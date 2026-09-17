import { eq } from "drizzle-orm"
import { db } from "@/db"
import { clients, projects } from "@/db/schema"
import { hoursLabel, ISO_DAY, num, range, str, type ToolPreview, type ToolSpec } from "@/lib/chat/tool-helpers"
import { approvalBlocker, occurredOnIn, parsePunchTime, wallClockIn } from "@/lib/punch"
import {
  approvePunch,
  dropAnyPunch,
  findPunches,
  planDropAny,
  planRevision,
  planSplit,
  punchDetail,
  revisePunch,
  splitPunch,
  type PunchDetail,
  type PunchRevision,
  type PunchSplit,
} from "@/lib/punches"
import { workspaceTimezone } from "@/lib/timezone"
import type { TimePunch } from "@/db/schema"

/**
 * Punches from the chat: every state, not just the running clock. A punch in
 * Review, an approved one whose line is already on the timesheet, a discarded
 * one — all of them can be listed, edited, split, dropped or approved here,
 * each write previewed and confirmed like every other chat write.
 *
 * The rules live in lib/punches.ts (planRevision / planSplit / planDropAny),
 * and the preview is built from the same plan the write executes. A month an
 * invoice already covers is refused unless the call says `force: true`.
 */

const STATUS_WORDS: Record<TimePunch["status"], string> = {
  running: "running",
  stopped: "in review",
  approved: "approved — on the timesheet",
  discarded: "discarded",
}

const STATUS_FILTER: Record<string, TimePunch["status"][]> = {
  review: ["stopped"],
  running: ["running"],
  approved: ["approved"],
  discarded: ["discarded"],
  all: ["running", "stopped", "approved", "discarded"],
}

function bool(args: Record<string, unknown>, key: string): boolean {
  return args[key] === true || args[key] === "true"
}

function describe(p: PunchDetail) {
  return {
    punchId: p.id,
    status: STATUS_WORDS[p.status],
    day: p.occurredOn,
    clockIn: p.startClock,
    clockOut: p.endClock || null,
    hours: p.hours,
    client: p.clientName,
    clientSlug: p.clientSlug,
    project: p.projectName,
    summary: p.note,
    source: p.source,
    flags: p.flags,
    timesheetLine: p.line
      ? { day: p.line.occurredOn, hours: p.line.hours, summary: p.line.summary, invoice: p.line.invoiceNumber }
      : null,
    lockedBy: p.lockedBy ? `${p.lockedBy.number} (${p.lockedBy.status})` : null,
  }
}

function spanLabel(p: { startedAt: string | Date; endedAt: string | Date | null }, tz: string) {
  const start = new Date(p.startedAt)
  const end = p.endedAt ? new Date(p.endedAt) : null
  return `${wallClockIn(start, tz)} – ${end ? wallClockIn(end, tz) : "running"}`
}

function change(before: string, after: string) {
  return before === after ? before : `${before} → ${after}`
}

async function clientIdFor(slug: string | undefined): Promise<string | undefined> {
  if (!slug) return undefined
  const client = await db.query.clients.findFirst({ where: eq(clients.slug, slug) })
  if (!client) throw new Error(`No client with slug "${slug}". Call list_clients.`)
  return client.id
}

/** undefined = leave as is; null = clear ("none"). */
async function projectIdFor(slug: string | undefined): Promise<string | null | undefined> {
  if (!slug) return undefined
  if (["none", "null", "-"].includes(slug.toLowerCase())) return null
  const project = await db.query.projects.findFirst({ where: eq(projects.slug, slug) })
  if (!project) throw new Error(`No project with slug "${slug}". Call list_clients for project slugs.`)
  return project.id
}

async function projectName(id: string | null): Promise<string> {
  if (!id) return "—"
  const project = await db.query.projects.findFirst({ where: eq(projects.id, id), columns: { name: true } })
  return project?.name ?? "—"
}

async function clientName(id: string): Promise<string> {
  const client = await db.query.clients.findFirst({ where: eq(clients.id, id), columns: { name: true } })
  return client?.name ?? "—"
}

function requirePunchId(args: Record<string, unknown>): string {
  const id = str(args, "punchId")
  if (!id) throw new Error("`punchId` is required — call list_punches first.")
  return id
}

function timeArg(args: Record<string, unknown>, key: string, day: string, tz: string): Date | undefined {
  const raw = str(args, key)
  if (!raw) return undefined
  const parsed = parsePunchTime(raw, day, tz)
  if ("error" in parsed) throw new Error(`${key}: ${parsed.error}`)
  return parsed.at
}

/* ---------- list ---------- */

const listPunches: ToolSpec = {
  name: "list_punches",
  description:
    "Clock punches in any state: 'review' (stopped, waiting for approval — the default), 'running', 'approved' (already on the timesheet), 'discarded', or 'all'. Returns punch ids plus local clock times. Call this before edit_punch, split_punch, drop_punch or approve_punch.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["review", "running", "approved", "discarded", "all"] },
      day: { type: "string", description: "YYYY-MM-DD — punches that started that local day." },
      from: { type: "string", description: "YYYY-MM-DD or YYYY-MM." },
      to: { type: "string", description: "YYYY-MM-DD." },
      clientSlug: { type: "string" },
    },
  },
  async run(args, ctx) {
    const status = str(args, "status") ?? "review"
    const statuses = STATUS_FILTER[status]
    if (!statuses) throw new Error("status must be review, running, approved, discarded or all.")
    const day = str(args, "day")
    const span = day ? { from: day, to: day } : range(str(args, "from"), str(args, "to"))
    // Review and running are short lists; the others default to the last two weeks.
    let from = span.from
    if (!from && !day && (status === "approved" || status === "discarded" || status === "all")) {
      const tz = await workspaceTimezone()
      from = occurredOnIn(new Date(Date.now() - 14 * 86_400_000), tz)
    }
    const result = await findPunches({
      userId: ctx.userId,
      statuses,
      fromDay: from,
      toDay: span.to,
      clientSlug: str(args, "clientSlug"),
      limit: 60,
    })
    if (!result.ok) throw new Error(result.error)
    return { timeZone: result.data.timeZone, punches: result.data.punches.map(describe) }
  },
}

/* ---------- edit ---------- */

async function revisionFrom(args: Record<string, unknown>, userId: string): Promise<PunchRevision> {
  const punchId = requirePunchId(args)
  const before = await punchDetail(userId, punchId)
  if (!before) throw new Error("No punch with that id. Call list_punches for ids.")
  const tz = await workspaceTimezone()
  const day = str(args, "day")
  if (day && !ISO_DAY.test(day)) throw new Error("`day` must be YYYY-MM-DD.")
  const startDay = day ?? before.occurredOn
  const endDay = day ?? (before.endedAt ? occurredOnIn(new Date(before.endedAt), tz) : before.occurredOn)
  const isLine = before.status === "approved" && before.line !== null
  const summary = args.summary
  return {
    userId,
    punchId,
    startedAt: timeArg(args, "clockIn", startDay, tz),
    endedAt: timeArg(args, "clockOut", endDay, tz),
    clientId: await clientIdFor(str(args, "clientSlug")),
    projectId: await projectIdFor(str(args, "projectSlug")),
    note: typeof summary === "string" ? summary : undefined,
    hours: num(args, "hours"),
    occurredOn: isLine ? day : undefined,
    reopen: bool(args, "reopen"),
    force: bool(args, "force"),
  }
}

const editPunch: ToolSpec = {
  name: "edit_punch",
  description:
    "Change a punch in any state — in review, approved (its timesheet line changes with it), discarded, or running (a clockOut stops it). Times are local wall-clock on the punch's own day ('11:48 AM', '14:05') unless `day` says otherwise. Previewed and confirmed before anything is written.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      punchId: { type: "string", description: "From list_punches." },
      clockIn: { type: "string", description: "New clock-in: '9:02 AM', '09:02', or an ISO instant. Omit to keep it." },
      clockOut: { type: "string", description: "New clock-out, same formats. Omit to keep it." },
      day: {
        type: "string",
        description: "YYYY-MM-DD the new times are on, when it is not the punch's own day. On an approved punch it also moves the timesheet line to that day.",
      },
      clientSlug: { type: "string", description: "Move the punch to another client." },
      projectSlug: { type: "string", description: "Project slug, or 'none' to clear the project." },
      summary: { type: "string", description: "What the time bought, in Karol's invoice voice." },
      hours: {
        type: "number",
        description: "Approved punches only: what the line bills when it should differ from the clock span. Omit to bill the span.",
      },
      reopen: { type: "boolean", description: "Send a discarded punch back to Review." },
      force: {
        type: "boolean",
        description: "Only when Karol explicitly wants a line changed in a month an invoice already covers.",
      },
    },
    required: ["punchId"],
  },
  async preview(args, ctx) {
    const planned = await planRevision(await revisionFrom(args, ctx.userId))
    if (!planned.ok) throw new Error(planned.error)
    const plan = planned.data
    const before = plan.before
    const tz = await workspaceTimezone()
    const afterSpan = spanLabel({ startedAt: plan.startedAt, endedAt: plan.endedAt }, tz)
    const afterHours = plan.line ? plan.line.hours : plan.endedAt ? Math.round(((plan.endedAt.getTime() - plan.startedAt.getTime()) / 3_600_000) * 100) / 100 : before.hours
    const fields: ToolPreview["fields"] = [
      { label: "Status", value: change(STATUS_WORDS[before.status], STATUS_WORDS[plan.status]) },
      { label: "Client", value: change(before.clientName, plan.clientId === before.clientId ? before.clientName : await clientName(plan.clientId)) },
      { label: "Project", value: change(before.projectName ?? "—", plan.projectId === before.projectId ? (before.projectName ?? "—") : await projectName(plan.projectId)) },
      { label: "Day", value: change(before.line?.occurredOn ?? before.occurredOn, plan.line?.occurredOn ?? occurredOnIn(plan.startedAt, tz)) },
      { label: "Clock", value: change(spanLabel(before, tz), afterSpan) },
      { label: plan.line ? "Billed hours" : "Hours", value: change(hoursLabel(before.line?.hours ?? before.hours), hoursLabel(afterHours)) },
      { label: "Summary", value: change(before.note || "—", plan.note || "—") },
    ]
    const notes = [
      plan.line ? "Already on the timesheet — the line changes with the punch." : null,
      ...plan.warnings,
    ].filter(Boolean)
    return { title: "Edit punch", fields, note: notes.join(" ") || undefined }
  },
  async run(args, ctx) {
    const result = await revisePunch(await revisionFrom(args, ctx.userId))
    if (!result.ok) throw new Error(result.error)
    return { punch: describe(result.data.punch), warnings: result.data.warnings }
  },
}

/* ---------- split ---------- */

async function splitFrom(args: Record<string, unknown>, userId: string, requestId: string): Promise<PunchSplit> {
  const punchId = requirePunchId(args)
  const before = await punchDetail(userId, punchId)
  if (!before) throw new Error("No punch with that id. Call list_punches for ids.")
  const tz = await workspaceTimezone()
  const day = str(args, "day") ?? before.occurredOn
  const at = timeArg(args, "at", day, tz)
  if (!at) throw new Error("`at` is required — the local time to split at, e.g. '11:48 AM'.")
  const drop = str(args, "drop")
  if (drop && drop !== "before" && drop !== "after") throw new Error("`drop` must be 'before' or 'after'.")
  const secondSummary = args.secondSummary
  return {
    userId,
    punchId,
    at,
    drop: (drop as "before" | "after" | undefined) ?? null,
    secondNote: typeof secondSummary === "string" ? secondSummary : undefined,
    secondProjectId: await projectIdFor(str(args, "secondProjectSlug")),
    requestId,
    force: bool(args, "force"),
  }
}

const splitPunchTool: ToolSpec = {
  name: "split_punch",
  description:
    "Cut one punch in two at a local time. The first piece keeps the punch (and, if approved, its timesheet line, re-billed to the shorter span); the second piece goes to Review. `drop` discards one side. Previewed and confirmed first.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      punchId: { type: "string", description: "From list_punches." },
      at: { type: "string", description: "Where to cut: '11:48 AM', '11:48', or an ISO instant." },
      day: { type: "string", description: "YYYY-MM-DD the cut is on, when the punch runs past midnight." },
      drop: { type: "string", enum: ["before", "after"], description: "Discard the part before or after the cut." },
      secondSummary: { type: "string", description: "Summary for the part after the cut. Defaults to the original's." },
      secondProjectSlug: { type: "string", description: "Project for the part after the cut, or 'none'." },
      force: { type: "boolean", description: "Only when Karol explicitly wants a billed month's line changed." },
    },
    required: ["punchId", "at"],
  },
  async preview(args, ctx) {
    const planned = await planSplit(await splitFrom(args, ctx.userId, ctx.idempotencyKey))
    if (!planned.ok) throw new Error(planned.error)
    const plan = planned.data
    const tz = await workspaceTimezone()
    const piece = (p: { status: TimePunch["status"]; startedAt: Date; endedAt: Date; hours: number }) =>
      `${spanLabel(p, tz)} · ${hoursLabel(p.hours)} · ${p.status === "discarded" ? "dropped" : STATUS_WORDS[p.status]}`
    return {
      title: "Split punch",
      fields: [
        { label: "Punch", value: `${plan.before.clientName} · ${plan.before.occurredOn} · ${spanLabel(plan.before, tz)} · ${hoursLabel(plan.before.hours)}` },
        { label: "First piece", value: piece(plan.first) },
        { label: "Second piece", value: piece(plan.second) },
        { label: "Second summary", value: plan.second.note || "—" },
        ...(plan.line
          ? [{ label: "Timesheet line", value: plan.line.action === "delete" ? "removed" : `${hoursLabel(plan.before.line?.hours ?? 0)} → ${hoursLabel(plan.line.hours)}` }]
          : []),
      ],
      note: plan.replayOf ? "Already split by this card — confirming changes nothing." : plan.warnings.join(" ") || undefined,
    }
  },
  async run(args, ctx) {
    const result = await splitPunch(await splitFrom(args, ctx.userId, ctx.idempotencyKey))
    if (!result.ok) throw new Error(result.error)
    return {
      first: describe(result.data.first),
      second: describe(result.data.second),
      replayed: result.data.replayed,
      warnings: result.data.warnings,
    }
  },
}

/* ---------- drop ---------- */

const dropPunchTool: ToolSpec = {
  name: "drop_punch",
  description:
    "Discard a punch in any state. For an approved punch this also removes its timesheet line; the punch itself is kept as discarded and can be sent back to Review with edit_punch reopen. Previewed and confirmed first.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      punchId: { type: "string", description: "From list_punches." },
      force: { type: "boolean", description: "Only when Karol explicitly wants a billed month's line removed." },
    },
    required: ["punchId"],
  },
  async preview(args, ctx) {
    const planned = await planDropAny({ userId: ctx.userId, punchId: requirePunchId(args), force: bool(args, "force") })
    if (!planned.ok) throw new Error(planned.error)
    const plan = planned.data
    const tz = await workspaceTimezone()
    return {
      title: "Drop punch",
      fields: [
        { label: "Client", value: plan.before.clientName },
        { label: "Day", value: plan.before.occurredOn },
        { label: "Clock", value: spanLabel(plan.before, tz) },
        { label: "Hours", value: hoursLabel(plan.before.hours) },
        { label: "Summary", value: plan.before.note || "—" },
        { label: "Status", value: change(STATUS_WORDS[plan.before.status], STATUS_WORDS.discarded) },
        ...(plan.line ? [{ label: "Timesheet line", value: `${plan.line.occurredOn} · ${hoursLabel(plan.line.hours)} — removed` }] : []),
      ],
      note: plan.already
        ? "Already discarded — confirming changes nothing."
        : plan.lock
          ? `Invoice ${plan.lock.number} is already ${plan.lock.status}; this removes a billed line and the invoice is not re-issued.`
          : undefined,
    }
  },
  async run(args, ctx) {
    const result = await dropAnyPunch({ userId: ctx.userId, punchId: requirePunchId(args), force: bool(args, "force") })
    if (!result.ok) throw new Error(result.error)
    return {
      punch: describe(result.data.punch),
      removedLine: result.data.removedLine ? { day: result.data.removedLine.occurredOn, hours: result.data.removedLine.hours } : null,
      alreadyDiscarded: result.data.already,
    }
  },
}

/* ---------- approve ---------- */

async function approvalFrom(args: Record<string, unknown>, userId: string) {
  const punchId = requirePunchId(args)
  const before = await punchDetail(userId, punchId)
  if (!before) throw new Error("No punch with that id. Call list_punches for ids.")
  if (before.status === "running") throw new Error("That punch is still running — clock it out with edit_punch first.")
  if (before.status === "discarded") throw new Error("That punch is discarded — reopen it with edit_punch first.")
  const projectId = await projectIdFor(str(args, "projectSlug"))
  const summaryArg = args.summary
  const summary = typeof summaryArg === "string" ? summaryArg.trim() : before.note
  const hours = num(args, "hours") ?? before.hours
  const day = str(args, "day")
  if (day && !ISO_DAY.test(day)) throw new Error("`day` must be YYYY-MM-DD.")
  return { before, projectId, summary, hours: Math.round(hours * 100) / 100, day }
}

const approvePunchTool: ToolSpec = {
  name: "approve_punch",
  description:
    "Approve a punch that is in Review: writes its timesheet line. Summary is required when the punch has no project. Previewed and confirmed first.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      punchId: { type: "string", description: "From list_punches (status review)." },
      summary: { type: "string" },
      projectSlug: { type: "string", description: "Project slug, or 'none'." },
      hours: { type: "number", description: "Billable hours, when they should differ from the clock span." },
      day: { type: "string", description: "YYYY-MM-DD to file the line under, when not the punch's day." },
    },
    required: ["punchId"],
  },
  async preview(args, ctx) {
    const a = await approvalFrom(args, ctx.userId)
    const tz = await workspaceTimezone()
    if (a.before.status === "approved") {
      return {
        title: "Approve punch",
        fields: [{ label: "Punch", value: `${a.before.clientName} · ${a.before.occurredOn} · ${spanLabel(a.before, tz)}` }],
        note: "Already approved — confirming changes nothing.",
      }
    }
    const projectId = a.projectId === undefined ? a.before.projectId : a.projectId
    const blocker = approvalBlocker({ clientId: a.before.clientId, projectId, summary: a.summary, hours: a.hours })
    if (blocker) throw new Error(blocker)
    return {
      title: "Approve punch",
      fields: [
        { label: "Client", value: a.before.clientName },
        { label: "Project", value: projectId === a.before.projectId ? (a.before.projectName ?? "—") : await projectName(projectId) },
        { label: "Day", value: a.day ?? a.before.occurredOn },
        { label: "Clock", value: spanLabel(a.before, tz) },
        { label: "Hours", value: hoursLabel(a.hours) },
        { label: "Summary", value: a.summary || "—" },
      ],
    }
  },
  async run(args, ctx) {
    const a = await approvalFrom(args, ctx.userId)
    if (a.before.status === "approved") return { punch: describe(a.before), replayed: true }
    const result = await approvePunch({
      punchId: a.before.id,
      approvedBy: ctx.userId,
      summary: a.summary,
      hours: a.hours,
      projectId: a.projectId,
      occurredOn: a.day,
    })
    if (!result.ok) throw new Error(result.error)
    const fresh = await punchDetail(ctx.userId, a.before.id)
    return { punch: fresh ? describe(fresh) : null, timeEntryId: result.data.timeEntryId, replayed: false }
  },
}

export const TIME_TOOLS: readonly ToolSpec[] = [
  listPunches,
  editPunch,
  splitPunchTool,
  dropPunchTool,
  approvePunchTool,
]
