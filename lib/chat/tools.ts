import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { clients, projects, sites } from "@/db/schema"
import { BOARD_TOOLS } from "@/lib/chat/tools-board"
import { INBOX_TOOLS } from "@/lib/chat/tools-inbox"
import { INSPIRATION_TOOLS } from "@/lib/chat/tools-inspiration"
import { DESK_TOOLS } from "@/lib/chat/tools-desk"
import { PACK_TOOLS } from "@/lib/chat/tools-packs"
import {
  hoursLabel,
  ISO_DAY,
  num,
  range,
  str,
  type ToolSpec,
} from "@/lib/chat/tool-helpers"
import { refreshInsightsAction } from "@/lib/insights/actions"
import { logAgentTime } from "@/lib/punches"
import { ledgerEntries } from "@/lib/sheets"
import { searchSessions } from "@/lib/leftoff-history"
import { insertTaskRow, resolveTaskTarget } from "@/lib/task-insert"

/**
 * What the chat can actually do.
 *
 * Every tool is a thin wrapper over logic that already exists and is already
 * tested — ledgerEntries, searchSessions, logAgentTime, insertTaskRow. The
 * model chooses the tool and the arguments; it never writes SQL, never sees a
 * connection, and cannot reach anything not listed here.
 *
 * `mutating` is the whole safety story. A read runs the moment the model asks
 * for it. A write does NOT: it renders a preview, parks at `pending`, and only
 * touches a table after Karol confirms in the UI. The idempotency key travels
 * from the parked row into the domain write, so confirming twice — or a worker
 * retrying a dropped connection — cannot double-apply.
 */

export type { ToolContext, ToolPreview, ToolSpec } from "@/lib/chat/tool-helpers"

/* ---------- read tools ---------- */

const searchWorkHistory: ToolSpec = {
  name: "search_work_history",
  description:
    "Logged, billable time. Use for questions like 'what did I work on for Mineralife in June'. Returns entries with hours and summaries plus a total.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      clientSlug: { type: "string", description: "Client slug, e.g. 'mineralife'." },
      from: { type: "string", description: "YYYY-MM-DD, or YYYY-MM for a whole month." },
      to: { type: "string", description: "YYYY-MM-DD. Optional when `from` is a month." },
      q: { type: "string", description: "Match against the entry summary." },
    },
  },
  async run(args) {
    const span = range(str(args, "from"), str(args, "to"))
    const result = await ledgerEntries({
      clientSlug: str(args, "clientSlug"),
      q: str(args, "q"),
      from: span.from,
      to: span.to,
      limit: 200,
    })
    return {
      total: result.total,
      hours: result.hours,
      truncated: result.truncated,
      entries: result.rows.map((row) => ({
        date: row.occurredOn,
        hours: row.hours,
        client: row.clientName,
        project: row.projectName,
        summary: row.summary,
        source: row.source,
        invoice: row.invoiceNumber,
      })),
    }
  },
}

const searchPastSessions: ToolSpec = {
  name: "search_sessions",
  description:
    "Full-text search across past agent conversations — what was discussed, tried or decided. Use when the answer is in a session rather than on the timesheet.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      q: { type: "string", description: "Search terms." },
      clientSlug: { type: "string" },
      from: { type: "string", description: "YYYY-MM-DD or YYYY-MM." },
      to: { type: "string", description: "YYYY-MM-DD." },
    },
    required: ["q"],
  },
  async run(args) {
    const q = str(args, "q")
    if (!q) return { sessions: [] }
    const span = range(str(args, "from"), str(args, "to"))
    const rows = await searchSessions(q, {
      clientSlug: str(args, "clientSlug") ?? null,
      from: span.from ? new Date(`${span.from}T00:00:00Z`) : null,
      to: span.to ? new Date(`${span.to}T23:59:59Z`) : null,
      limit: 40,
    })
    return {
      sessions: rows.map((row) => ({
        ref: row.sessionRef,
        title: row.title,
        project: row.project,
        client: row.client?.name ?? null,
        at: row.at,
        summary: row.summary,
        messages: row.messageCount,
        hits: row.hits.map((hit) => ({
          role: hit.role,
          at: hit.at,
          text: hit.snippet.map((part) => part.text).join(""),
        })),
      })),
    }
  },
}

const listClients: ToolSpec = {
  name: "list_clients",
  description:
    "Clients and their projects, with slugs. Call this first when a name in the request has to be resolved to a slug before another tool can use it.",
  mutating: false,
  parameters: { type: "object", properties: {} },
  async run() {
    const rows = await db.query.clients.findMany({
      orderBy: [asc(clients.name)],
      columns: { id: true, name: true, slug: true, status: true },
      with: {
        projects: {
          columns: { id: true, name: true, slug: true, status: true },
          orderBy: [asc(projects.name)],
        },
      },
    })
    return {
      clients: rows.map((row) => ({
        name: row.name,
        slug: row.slug,
        status: row.status,
        projects: row.projects.map((p) => ({
          name: p.name,
          slug: p.slug,
          status: p.status,
        })),
      })),
    }
  },
}

/* ---------- mutating tools ---------- */

/**
 * Agent-logged time. `logAgentTime` wants an interval; the chat only ever
 * knows a day and a duration, so the window is nominal and ends at 17:00 UTC
 * on the day worked. The hours are what bill — the clock face is decoration
 * that keeps the punch row well-formed.
 */
const logTime: ToolSpec = {
  name: "log_time",
  description:
    "Log hours to a client's timesheet. Always previewed and confirmed by Karol before anything is written.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      clientSlug: { type: "string" },
      projectSlug: { type: "string" },
      occurredOn: { type: "string", description: "YYYY-MM-DD, the day worked." },
      hours: { type: "number", description: "Between 0 and 24." },
      summary: { type: "string", description: "What the time bought, in Karol's invoice voice." },
    },
    required: ["clientSlug", "occurredOn", "hours", "summary"],
  },
  async preview(args) {
    const slug = str(args, "clientSlug")
    const client = slug
      ? await db.query.clients.findFirst({ where: eq(clients.slug, slug) })
      : null
    const hours = num(args, "hours") ?? 0
    return {
      title: "Time entry preview",
      fields: [
        { label: "Client", value: client?.name ?? slug ?? "—" },
        { label: "Project", value: str(args, "projectSlug") ?? "—" },
        { label: "Date", value: str(args, "occurredOn") ?? "—" },
        { label: "Hours", value: hoursLabel(hours) },
        { label: "Summary", value: str(args, "summary") ?? "—" },
      ],
      note: client ? undefined : `No client matches "${slug ?? ""}".`,
    }
  },
  async run(args, ctx) {
    const occurredOn = str(args, "occurredOn")
    const hours = num(args, "hours")
    const summary = str(args, "summary")
    if (!occurredOn || !ISO_DAY.test(occurredOn)) {
      throw new Error("`occurredOn` must be YYYY-MM-DD.")
    }
    if (hours == null || hours <= 0 || hours > 24) {
      throw new Error("`hours` must be between 0 and 24.")
    }
    if (!summary) throw new Error("`summary` is required.")

    const endedAt = new Date(`${occurredOn}T17:00:00Z`)
    const startedAt = new Date(endedAt.getTime() - hours * 3_600_000)

    const result = await logAgentTime({
      userId: ctx.userId,
      clientSlug: str(args, "clientSlug") ?? null,
      projectSlug: str(args, "projectSlug") ?? null,
      occurredOn,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      hours,
      summary,
      note: `Logged from chat thread ${ctx.threadId}.`,
      clientRequestId: ctx.idempotencyKey,
    })

    if (!result.ok) throw new Error(result.error)
    return {
      timeEntryId: result.data.timeEntryId,
      replayed: result.data.replayed,
      hours,
      occurredOn,
    }
  },
}

const createTask: ToolSpec = {
  name: "create_task",
  description: "File a task on the board. Previewed and confirmed before it is written.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      clientSlug: { type: "string" },
      dueOn: { type: "string", description: "YYYY-MM-DD." },
      notes: { type: "string" },
      priority: { type: "number", description: "1 high, 2 normal, 3 low." },
    },
    required: ["title"],
  },
  async preview(args) {
    const slug = str(args, "clientSlug")
    const client = slug
      ? await db.query.clients.findFirst({ where: eq(clients.slug, slug) })
      : null
    return {
      title: "Task preview",
      fields: [
        { label: "Title", value: str(args, "title") ?? "—" },
        { label: "Client", value: client?.name ?? slug ?? "—" },
        { label: "Due", value: str(args, "dueOn") ?? "—" },
        { label: "Notes", value: str(args, "notes") ?? "—" },
      ],
    }
  },
  async run(args, ctx) {
    const title = str(args, "title")
    if (!title) throw new Error("`title` is required.")

    const slug = str(args, "clientSlug")
    const client = slug
      ? await db.query.clients.findFirst({ where: eq(clients.slug, slug) })
      : null

    const target = await resolveTaskTarget({ clientId: client?.id ?? null })
    if ("error" in target) throw new Error(target.error)

    const priority = num(args, "priority")
    const id = await insertTaskRow(db, {
      title: title.slice(0, 300),
      userId: ctx.userId,
      target,
      dueOn: str(args, "dueOn") ?? null,
      notes: str(args, "notes") ?? "",
      priority: priority && [1, 2, 3].includes(priority) ? priority : 2,
      source: "chat",
      refKind: "chat",
      refId: ctx.idempotencyKey,
    })
    return { taskId: id, title }
  },
}

const listSites: ToolSpec = {
  name: "list_sites",
  description:
    "The sites the CRM measures, with their slugs and clients. Call this first when a site name has to become a slug — refresh_insights takes the slug exactly as listed here.",
  mutating: false,
  parameters: { type: "object", properties: {} },
  async run() {
    const rows = await db.query.sites.findMany({
      orderBy: [asc(sites.sort), asc(sites.name)],
      with: { client: { columns: { slug: true, name: true } } },
    })
    return {
      sites: rows.map((s) => ({
        slug: s.slug,
        name: s.name,
        origin: s.origin,
        client: s.client?.slug ?? null,
        searchConsole: Boolean(s.gscSiteUrl),
        ga4: Boolean(s.measurementId),
      })),
    }
  },
}

/** `my-custom-manufacturer` → the slug it most likely meant, or null. */
async function nearestSite(slug: string) {
  const rows = await db.query.sites.findMany({ columns: { slug: true, name: true } })
  const key = slug.toLowerCase().replace(/[^a-z0-9]/g, "")
  const hit = rows.find(
    (s) =>
      s.slug.replace(/[^a-z0-9]/g, "") === key ||
      s.name.toLowerCase().replace(/[^a-z0-9]/g, "") === key
  )
  return { rows, hit: hit ?? null }
}

const refreshInsights: ToolSpec = {
  name: "refresh_insights",
  description:
    "Pull fresh analytics for a site. Takes the site's slug as list_sites gives it — call list_sites first when you only have a name. Confirmed first because it calls Google and Vercel and can take a while.",
  mutating: true,
  parameters: {
    type: "object",
    properties: { siteSlug: { type: "string", description: "A slug from list_sites." } },
    required: ["siteSlug"],
  },
  async preview(args) {
    const slug = str(args, "siteSlug") ?? ""
    const site = slug ? await db.query.sites.findFirst({ where: eq(sites.slug, slug) }) : null
    if (!site) {
      // Refuse here, before Karol sees a card, and say what it was probably meant to be.
      const { rows, hit } = await nearestSite(slug)
      const known = rows.map((s) => s.slug).join(", ") || "none"
      throw new Error(
        hit
          ? `No site with slug "${slug}" — did you mean "${hit.slug}" (${hit.name})? Call again with that slug.`
          : `No site with slug "${slug}". Sites: ${known}. Call list_sites and use a slug from it.`
      )
    }
    return {
      title: "Refresh insights",
      fields: [
        { label: "Site", value: `${site.name} (${site.slug})` },
        { label: "Origin", value: site.origin || "—" },
      ],
      note: "Calls Search Console, GA4, Ads and Vercel, then rewrites the cached snapshot.",
    }
  },
  async run(args) {
    const slug = str(args, "siteSlug")
    if (!slug) throw new Error("`siteSlug` is required.")
    const result = await refreshInsightsAction(slug)
    if (!result.ok) throw new Error(result.error)
    return { refreshed: slug }
  },
}

export const TOOLS: readonly ToolSpec[] = [
  searchWorkHistory,
  searchPastSessions,
  listClients,
  listSites,
  ...INBOX_TOOLS,
  ...BOARD_TOOLS,
  ...INSPIRATION_TOOLS,
  ...PACK_TOOLS,
  ...DESK_TOOLS,
  logTime,
  createTask,
  refreshInsights,
]

export function toolByName(name: string): ToolSpec | undefined {
  return TOOLS.find((tool) => tool.name === name)
}

/** Where a tool is defined — the first file a solver should open when it failed. */
export function toolSource(name: string): string {
  if (INBOX_TOOLS.some((t) => t.name === name)) return "lib/chat/tools-inbox.ts"
  if (BOARD_TOOLS.some((t) => t.name === name)) return "lib/chat/tools-board.ts"
  if (INSPIRATION_TOOLS.some((t) => t.name === name)) return "lib/chat/tools-inspiration.ts"
  if (PACK_TOOLS.some((t) => t.name === name)) return "lib/chat/tools-packs.ts"
  if (DESK_TOOLS.some((t) => t.name === name)) return "lib/chat/tools-desk.ts"
  return "lib/chat/tools.ts"
}

/** The tool list as the worker hands it to the model. */
export function toolSchemas() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    mutating: tool.mutating,
    parameters: tool.parameters,
  }))
}
