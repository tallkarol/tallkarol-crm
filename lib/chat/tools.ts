import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { clients, projects } from "@/db/schema"
import { refreshInsightsAction } from "@/lib/insights/actions"
import { logAgentTime } from "@/lib/punches"
import { ledgerEntries } from "@/lib/sheets"
import { searchSessions } from "@/lib/leftoff-history"
import { insertTaskRow, resolveTaskTarget } from "@/lib/task-insert"
import { monthEnd } from "@/lib/timesheet"

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

export type ToolContext = {
  userId: string
  threadId: string
  /** The parked tool call's key, handed to domain writes that accept one. */
  idempotencyKey: string
}

export type ToolPreview = {
  title: string
  /** Ordered label/value pairs; rendered verbatim on the approval card. */
  fields: { label: string; value: string }[]
  note?: string
}

export type ToolSpec = {
  name: string
  description: string
  mutating: boolean
  /** JSON Schema handed to the model. Kept by hand so it cannot drift. */
  parameters: Record<string, unknown>
  preview?: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolPreview>
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}

/* ---------- argument helpers ---------- */

function str(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function num(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value)
  }
  return undefined
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
const ISO_MONTH = /^\d{4}-\d{2}$/

/** Accepts "2026-06" or "2026-06-01" and returns an inclusive day range. */
function range(from?: string, to?: string): { from?: string; to?: string } {
  if (from && ISO_MONTH.test(from)) {
    return { from: `${from}-01`, to: to && ISO_DAY.test(to) ? to : monthEnd(from) }
  }
  return {
    from: from && ISO_DAY.test(from) ? from : undefined,
    to: to && ISO_DAY.test(to) ? to : undefined,
  }
}

function hoursLabel(hours: number): string {
  return `${hours.toFixed(2)} h`
}

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

const refreshInsights: ToolSpec = {
  name: "refresh_insights",
  description:
    "Pull fresh analytics for a site. Confirmed first because it calls Google and Vercel and can take a while.",
  mutating: true,
  parameters: {
    type: "object",
    properties: { siteSlug: { type: "string" } },
    required: ["siteSlug"],
  },
  async preview(args) {
    return {
      title: "Refresh insights",
      fields: [{ label: "Site", value: str(args, "siteSlug") ?? "—" }],
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
  logTime,
  createTask,
  refreshInsights,
]

export function toolByName(name: string): ToolSpec | undefined {
  return TOOLS.find((tool) => tool.name === name)
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
