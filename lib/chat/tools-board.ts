import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { calendarSources, clients, projects, sessionNotes, tasks } from "@/db/schema"
import type { Task } from "@/db/schema"
import { getMeetingsInWindow } from "@/lib/calendar"
import { PERSONAL_CALENDAR_ID, writeCalendarEvent } from "@/lib/calendar-write"
import { workspaceTimezone } from "@/lib/timezone"
import { dismissNote, loadLeftOff } from "@/lib/leftoff-data"
import { listTasks } from "@/lib/tasks"
import { completeTask } from "@/lib/task-complete"
import { applyTaskPatch, planTaskPatch, type TaskPatch } from "@/lib/task-edit"
import { loadWaiting } from "@/lib/waiting-data"
import { ISO_DAY, range, str, type ToolPreview, type ToolSpec } from "@/lib/chat/tool-helpers"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The task a write names, or a refusal the model can act on. A card for a
 * task that does not exist could only fail on Confirm, so it is never drawn.
 */
async function findTask(args: Record<string, unknown>): Promise<Task> {
  const id = str(args, "taskId")
  if (!id) throw new Error("`taskId` is required — call list_tasks for ids.")
  const task = UUID.test(id) ? await db.query.tasks.findFirst({ where: eq(tasks.id, id) }) : undefined
  if (!task) throw new Error(`No task with id "${id}". Call list_tasks and use a taskId from it.`)
  return task
}

function emails(args: Record<string, unknown>, key: string): string[] {
  const value = args[key]
  const raw = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : typeof value === "string"
      ? value.split(/[,\s]+/)
      : []
  return raw.map((item) => item.trim().toLowerCase()).filter((item) => item.includes("@"))
}

export const listLeftOffTool: ToolSpec = {
  name: "list_leftoff",
  description:
    "The 'where I left off' board: chats waiting, blocked, working or parked, plus dirty repos. Use for 'what's waiting on me', 'where did I leave off'.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      state: {
        type: "string",
        description: "blocked | waiting | working | parked. Omit for the whole board.",
      },
      clientSlug: { type: "string" },
    },
  },
  async run(args) {
    const state = str(args, "state")
    const clientSlug = str(args, "clientSlug")
    const board = await loadLeftOff()
    const notes = board.notes
      .filter((n) => !state || n.state === state)
      .filter((n) => !clientSlug || n.client?.slug === clientSlug)
      .map((n) => ({
        ref: n.sessionRef,
        title: n.title,
        state: n.state,
        surface: n.surface,
        project: n.project || null,
        client: n.client?.slug ?? null,
        ago: n.ago,
        blockedOn: n.blockedOn || null,
        next: n.handoff?.next ?? null,
        done: n.handoff?.done ?? null,
        agents: n.agents ? `${n.agents.running} running (${n.agents.types.join(", ")})` : null,
        repo: n.repo
          ? { dirty: n.repo.dirty, branch: n.branch, files: n.repo.files.slice(0, 5) }
          : null,
      }))
    return {
      counts: board.counts,
      notes,
      browsers: board.browsers.map((b) => ({
        browser: b.browser,
        capturedAt: b.capturedAt,
        windows: b.windows.length,
        tabs: b.windows.reduce((n, w) => n + w.tabs.length, 0),
      })),
    }
  },
}

export const listWaitingTool: ToolSpec = {
  name: "list_waiting",
  description:
    "The decision queue: blocked chats, failing monitors, unanswered tickets, new enquiries, overdue tasks, punch-list items, unbilled sessions. Use for 'what needs me' when leftover is too chat-shaped.",
  mutating: false,
  parameters: { type: "object", properties: {} },
  async run() {
    const waiting = await loadWaiting()
    return {
      total: waiting.total,
      counts: waiting.counts,
      items: waiting.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        title: item.title,
        subtitle: item.subtitle,
        client: item.client || null,
        age: item.ageLabel,
        severity: item.severity,
        href: item.href,
      })),
    }
  },
}

export const listTasksTool: ToolSpec = {
  name: "list_tasks",
  description:
    "Open tasks on the board. Use for 'what's due', 'Mineralife tasks', 'overdue'. Call list_clients first when a name has to become a slug.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      clientSlug: { type: "string" },
      q: { type: "string" },
      state: { type: "string", description: "open | doing | waiting | done | all. Default open." },
      due: { type: "string", description: "any | overdue | today | week | none." },
      needsMe: { type: "boolean" },
    },
  },
  async run(args) {
    const clientSlug = str(args, "clientSlug")
    const rows = await listTasks(
      {
        state: str(args, "state") ?? "open",
        due: str(args, "due"),
        needsMe: args.needsMe === true,
        clients: clientSlug ? [clientSlug] : undefined,
      },
      { q: str(args, "q") }
    )
    return {
      total: rows.length,
      tasks: rows.slice(0, 60).map((t) => ({
        taskId: t.id,
        title: t.title,
        client: t.clientSlug,
        project: t.projectSlug,
        dueOn: t.dueOn,
        stage: t.stage,
        priority: t.priority,
        overdueDays: t.overdueDays,
        waitingDays: t.waitingDays,
      })),
      truncated: rows.length > 60,
    }
  },
}

export const listCalendarTool: ToolSpec = {
  name: "list_calendar",
  description:
    "Upcoming meetings from the synced calendars, plus which calendars can be written. Use for 'what's on the calendar', 'meetings this week'. Default is the next 10 days. To create a block, use create_calendar_event.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      from: { type: "string", description: "YYYY-MM-DD or YYYY-MM. Default today." },
      to: { type: "string", description: "YYYY-MM-DD. Default 10 days after `from`." },
    },
  },
  async run(args) {
    const span = range(str(args, "from"), str(args, "to"))
    const from = span.from ? new Date(`${span.from}T00:00:00Z`) : new Date()
    const to = span.to
      ? new Date(`${span.to}T23:59:59Z`)
      : new Date(from.getTime() + 10 * 86_400_000)
    const [snap, sources] = await Promise.all([
      getMeetingsInWindow(from, to),
      db.query.calendarSources.findMany({
        orderBy: [asc(calendarSources.sort), asc(calendarSources.label)],
      }),
    ])
    return {
      configured: snap.configured,
      from: from.toISOString(),
      to: to.toISOString(),
      calendars: sources
        .filter((s) => s.enabled)
        .map((s) => ({
          label: s.label,
          kind: s.kind,
          id: s.externalId || null,
          personal: s.externalId.toLowerCase() === PERSONAL_CALENDAR_ID,
          destination: s.writable,
          canWrite: s.kind === "google",
        })),
      meetings: snap.meetings.map((m) => ({
        id: m.id,
        title: m.title,
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        allDay: m.allDay,
        location: m.location || null,
        source: m.source,
        attendees: m.attendees.map((a) => a.email || a.name).filter(Boolean),
      })),
    }
  },
}

export const createCalendarEventTool: ToolSpec = {
  name: "create_calendar_event",
  description:
    "Create an event on a Google calendar. Always previewed — Karol confirms before it is written. Personal / life / girlfriend / family defaults to Personal (karolzbuczek@gmail.com). Work / client meetings go on Remote. Pass calendar 'personal' or 'remote', or a connected label. startsAt is YYYY-MM-DDTHH:mm or YYYY-MM-DD for all-day. Zone defaults to Europe/Warsaw.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      startsAt: {
        type: "string",
        description: "YYYY-MM-DDTHH:mm, or YYYY-MM-DD for all-day.",
      },
      endsAt: {
        type: "string",
        description: "Same shape as startsAt. Default +1 hour, or the same day if all-day.",
      },
      timeZone: { type: "string", description: "IANA zone. Default workspace (Europe/Warsaw)." },
      description: { type: "string" },
      location: { type: "string" },
      attendees: {
        type: "string",
        description: "Comma-separated emails.",
      },
      calendar: {
        type: "string",
        description: "personal | remote | a connected label. Default personal.",
      },
    },
    required: ["title", "startsAt"],
  },
  async preview(args) {
    const zone = str(args, "timeZone") || (await workspaceTimezone())
    const cal = str(args, "calendar") || "personal"
    const sources = await db.query.calendarSources.findMany()
    const wanted = cal.toLowerCase()
    const source = sources.find(
      (s) =>
        s.label.toLowerCase() === wanted ||
        s.externalId.toLowerCase() === wanted ||
        (wanted === "personal" && s.externalId.toLowerCase() === PERSONAL_CALENDAR_ID) ||
        (wanted === "gmail" && s.externalId.toLowerCase() === PERSONAL_CALENDAR_ID) ||
        (wanted === "remote" && s.label.toLowerCase() === "remote")
    )
    return {
      title: "Calendar event preview",
      fields: [
        { label: "Title", value: str(args, "title") ?? "—" },
        { label: "When", value: [str(args, "startsAt"), str(args, "endsAt")].filter(Boolean).join(" → ") || "—" },
        { label: "Zone", value: zone },
        { label: "Calendar", value: source ? `${source.label} (${source.externalId})` : cal },
        { label: "Where", value: str(args, "location") ?? "—" },
        { label: "Who", value: emails(args, "attendees").join(", ") || "—" },
      ],
      note: source
        ? undefined
        : `No connected calendar matches "${cal}".`,
    }
  },
  async run(args, ctx) {
    const title = str(args, "title")
    const startsAt = str(args, "startsAt")
    if (!title || !startsAt) throw new Error("`title` and `startsAt` are required.")
    const result = await writeCalendarEvent({
      title,
      startsAt,
      endsAt: str(args, "endsAt"),
      timeZone: str(args, "timeZone") || (await workspaceTimezone()),
      description: str(args, "description") ?? "",
      location: str(args, "location") ?? "",
      attendees: emails(args, "attendees"),
      calendar: str(args, "calendar") || "personal",
      refKey: ctx.idempotencyKey,
    })
    if (!result.ok) throw new Error(result.error)
    return {
      id: result.id,
      url: result.url,
      calendar: result.calendar,
      replayed: result.replayed,
    }
  },
}

export const dismissLeftOffTool: ToolSpec = {
  name: "dismiss_leftoff",
  description: "Clear a leftover row from the board. Previewed. Pass the session ref from list_leftoff.",
  mutating: true,
  parameters: {
    type: "object",
    properties: { sessionRef: { type: "string" } },
    required: ["sessionRef"],
  },
  async preview(args) {
    const ref = str(args, "sessionRef")
    if (!ref) throw new Error("`sessionRef` is required — call list_leftoff for refs.")
    const board = await loadLeftOff()
    const note = board.notes.find((n) => n.sessionRef === ref)
    if (note) {
      return {
        title: "Dismiss leftover",
        fields: [
          { label: "Ref", value: ref },
          { label: "Title", value: note.title || "—" },
          { label: "State", value: note.state },
        ],
      }
    }
    // Off the board is not the same as missing: dismissNote writes any row
    // with that ref, so only a ref with no row at all is refused.
    const row = await db.query.sessionNotes.findFirst({
      where: eq(sessionNotes.sessionRef, ref),
      columns: { title: true, state: true, dismissedAt: true },
    })
    if (!row) throw new Error(`No leftover row with ref "${ref}". Call list_leftoff and use a ref from it.`)
    return {
      title: "Dismiss leftover",
      fields: [
        { label: "Ref", value: ref },
        { label: "Title", value: row.title || "—" },
        { label: "State", value: row.state },
      ],
      note: row.dismissedAt ? "Already dismissed — confirming changes nothing." : "Not on the board right now.",
    }
  },
  async run(args) {
    const ref = str(args, "sessionRef")
    if (!ref) throw new Error("`sessionRef` is required.")
    const ok = await dismissNote(ref)
    if (!ok) throw new Error("No such leftover row.")
    return { dismissed: ref }
  },
}

export const completeTaskTool: ToolSpec = {
  name: "complete_task",
  description: "Mark a task done. Previewed. Pass the task id from list_tasks.",
  mutating: true,
  parameters: {
    type: "object",
    properties: { taskId: { type: "string" } },
    required: ["taskId"],
  },
  async preview(args) {
    const task = await findTask(args)
    return {
      title: "Complete task",
      fields: [
        { label: "Task", value: task.title },
        { label: "Due", value: task.dueOn ?? "—" },
      ],
    }
  },
  async run(args, ctx) {
    const id = str(args, "taskId")
    if (!id) throw new Error("`taskId` is required.")
    const result = await completeTask(id, ctx.userId, true)
    if (!result.ok) throw new Error(result.error)
    return { taskId: id, title: result.title }
  },
}

export const rescheduleTaskTool: ToolSpec = {
  name: "reschedule_task",
  description:
    "Change a task's due date. Previewed. Pass the task id from list_tasks. Omit dueOn (or pass an empty string) to clear the due date.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      taskId: { type: "string" },
      dueOn: { type: "string", description: "YYYY-MM-DD. Omit to clear the due date." },
    },
    required: ["taskId"],
  },
  async preview(args) {
    const task = await findTask(args)
    const dueOn = str(args, "dueOn")
    if (dueOn && !ISO_DAY.test(dueOn)) throw new Error("`dueOn` must be YYYY-MM-DD.")
    return {
      title: "Reschedule task",
      fields: [
        { label: "Task", value: task.title },
        { label: "Due now", value: task.dueOn ?? "—" },
        { label: "Due after", value: dueOn ?? "cleared" },
      ],
    }
  },
  async run(args) {
    const id = str(args, "taskId")
    if (!id) throw new Error("`taskId` is required.")
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
    if (!task) throw new Error("No task with that id.")

    const dueOn = str(args, "dueOn")
    if (dueOn && !ISO_DAY.test(dueOn)) throw new Error("`dueOn` must be YYYY-MM-DD.")

    await db
      .update(tasks)
      .set({ dueOn: dueOn ?? null, updatedAt: new Date() })
      .where(eq(tasks.id, id))

    return { taskId: id, title: task.title, dueOn: dueOn ?? null }
  },
}

/* ---------- edit ---------- */

const STAGES = ["queue", "doing", "waiting"] as const
type Stage = (typeof STAGES)[number]
const PRIORITY_WORDS: Record<number, string> = { 1: "high", 2: "normal", 3: "low" }
const NONE = new Set(["none", "null", "-"])

function priorityArg(args: Record<string, unknown>): number | undefined {
  const raw = args.priority
  if (raw == null || raw === "") return undefined
  if (typeof raw === "number") return raw
  const word = String(raw).trim().toLowerCase()
  const byWord: Record<string, number> = { high: 1, normal: 2, medium: 2, low: 3 }
  if (word in byWord) return byWord[word]
  const n = Number(word)
  if (Number.isFinite(n)) return n
  throw new Error("`priority` must be high, normal or low (1, 2 or 3).")
}

function labelList(raw: string): string[] {
  if (NONE.has(raw.trim().toLowerCase())) return []
  return raw.split(",").map((label) => label.trim()).filter(Boolean)
}

function sameList(a: string[], b: string[]) {
  return a.length === b.length && a.every((value, i) => value === b[i])
}

function change(before: string, after: string) {
  return before === after ? before : `${before} → ${after}`
}

type TaskEdit = {
  task: Task
  patch: TaskPatch
  reopen: boolean
  stage: Stage | null
  appended: string | null
  warnings: string[]
}

/**
 * The card and the write are both drawn from this: what the arguments change
 * on the task as it is now. Unchanged values drop out, so the card lists only
 * what moves and a confirm on an already-edited task is a no-op.
 */
async function taskEditFrom(args: Record<string, unknown>): Promise<TaskEdit> {
  const task = await findTask(args)
  const patch: TaskPatch = {}
  const warnings: string[] = []

  const title = str(args, "title")
  if (title !== undefined && title !== task.title) patch.title = title

  if (typeof args.notes === "string") patch.notes = args.notes.trim()
  let appended: string | null = null
  const append = str(args, "appendNotes")
  if (append) {
    const base = (patch.notes ?? task.notes).trimEnd()
    if (base.endsWith(append)) {
      warnings.push("Those notes are already there — nothing appended.")
    } else {
      patch.notes = base ? `${base}\n\n${append}` : append
      appended = append
    }
  }
  if (patch.notes !== undefined && patch.notes === task.notes) delete patch.notes

  // Client and project. A project names its own client; a client on its own
  // files the task at that client's level, as the board's client menu does.
  const clientSlug = str(args, "clientSlug")
  const projectSlug = str(args, "projectSlug")
  let clientId: string | null | undefined
  if (clientSlug) {
    if (NONE.has(clientSlug.toLowerCase())) clientId = null
    else {
      const client = await db.query.clients.findFirst({ where: eq(clients.slug, clientSlug), columns: { id: true } })
      if (!client) throw new Error(`No client with slug "${clientSlug}". Call list_clients.`)
      clientId = client.id
    }
  }
  if (projectSlug) {
    if (NONE.has(projectSlug.toLowerCase())) {
      if (task.projectId || task.deliverableId) {
        patch.projectId = null
        patch.deliverableId = null
      }
    } else {
      const project = await db.query.projects.findFirst({ where: eq(projects.slug, projectSlug), columns: { id: true, clientId: true } })
      if (!project) throw new Error(`No project with slug "${projectSlug}". Call list_clients for project slugs.`)
      if (clientId !== undefined && clientId !== project.clientId) {
        throw new Error("That project belongs to a different client than `clientSlug`.")
      }
      if (project.id !== task.projectId) {
        patch.projectId = project.id
        patch.deliverableId = null
        patch.productId = null
      }
    }
  }
  if (clientId !== undefined && clientId !== task.clientId && !patch.projectId) {
    patch.clientId = clientId
    patch.projectId = null
    patch.productId = null
    patch.deliverableId = null
    if (task.projectId || task.productId || task.deliverableId) {
      warnings.push("Its project was cleared — it belonged to the old client.")
    }
  }

  const priority = priorityArg(args)
  if (priority !== undefined && priority !== task.priority) patch.priority = priority

  let labels: string[] | undefined
  if (typeof args.labels === "string") labels = labelList(args.labels)
  const addLabels = str(args, "addLabels")
  if (addLabels) {
    const next = [...(labels ?? task.labels)]
    for (const label of labelList(addLabels)) if (!next.includes(label)) next.push(label)
    labels = next
  }
  if (labels && !sameList(labels, task.labels)) patch.labels = labels

  const stageArg = str(args, "stage")?.toLowerCase()
  if (stageArg === "done") throw new Error("To finish a task use complete_task.")
  if (stageArg && !STAGES.includes(stageArg as Stage)) throw new Error("`stage` must be queue, doing or waiting.")
  let stage = (stageArg as Stage | undefined) ?? null
  let reopen = args.reopen === true || args.reopen === "true"
  if (task.status === "done") {
    if (stage && !reopen) {
      reopen = true
      warnings.push("It was done — moving it to a stage reopens it.")
    }
  } else {
    if (reopen) warnings.push("It is already open.")
    reopen = false
    if (stage === task.boardStage) stage = null
  }

  return { task, patch, reopen, stage, appended, warnings }
}

function hasChanges(edit: TaskEdit) {
  return Object.keys(edit.patch).length > 0 || edit.reopen || edit.stage !== null
}

async function nameOf(kind: "client" | "project", id: string | null | undefined) {
  if (!id) return "—"
  const row =
    kind === "client"
      ? await db.query.clients.findFirst({ where: eq(clients.id, id), columns: { name: true } })
      : await db.query.projects.findFirst({ where: eq(projects.id, id), columns: { name: true } })
  return row?.name ?? "—"
}

const labelsLabel = (list: string[]) => (list.length ? list.join(", ") : "—")

export const editTaskTool: ToolSpec = {
  name: "edit_task",
  description:
    "Change an existing task instead of filing a new one: title, notes (replace, or appendNotes to add), client, project, priority, board stage (queue / doing / waiting), labels (replace, or addLabels), or reopen a done task. Only what you send changes. Due dates stay on reschedule_task; finishing stays on complete_task. Previewed before → after and confirmed first. Pass the task id from list_tasks.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      taskId: { type: "string", description: "From list_tasks." },
      title: { type: "string" },
      notes: { type: "string", description: "Replaces the notes. An empty string clears them." },
      appendNotes: { type: "string", description: "Added under the existing notes." },
      clientSlug: { type: "string", description: "Move to this client (its project is cleared), or 'none' for a house task." },
      projectSlug: { type: "string", description: "File under this project (its client follows), or 'none' to clear the project." },
      priority: { type: "string", description: "high, normal or low." },
      stage: { type: "string", enum: [...STAGES], description: "Board stage. On a done task this reopens it." },
      labels: { type: "string", description: "Replaces the labels, comma-separated; 'none' clears them." },
      addLabels: { type: "string", description: "Labels to add, comma-separated." },
      reopen: { type: "boolean", description: "Reopen a done task (back to queue unless `stage` says otherwise)." },
    },
    required: ["taskId"],
  },
  async preview(args) {
    const edit = await taskEditFrom(args)
    if (!hasChanges(edit)) {
      throw new Error(edit.warnings.join(" ") || "Nothing to change — send at least one field to edit.")
    }
    const planned = await planTaskPatch(edit.task, edit.patch)
    if (!planned.ok) throw new Error(planned.error)
    const t = edit.task
    const v = planned.values
    const fields: ToolPreview["fields"] = [{ label: "Task", value: t.title }]
    if (v.title !== undefined) fields.push({ label: "Title", value: change(t.title, v.title as string) })
    if (planned.retargeted) {
      fields.push(
        { label: "Client", value: change(await nameOf("client", t.clientId), await nameOf("client", v.clientId as string | null)) },
        { label: "Project", value: change(await nameOf("project", t.projectId), await nameOf("project", v.projectId as string | null)) }
      )
    }
    if (v.priority !== undefined) {
      fields.push({ label: "Priority", value: change(PRIORITY_WORDS[t.priority] ?? String(t.priority), PRIORITY_WORDS[v.priority as number]) })
    }
    const statusAfter = edit.reopen ? "open" : t.status
    const stageAfter = edit.stage ?? (edit.reopen ? "queue" : t.boardStage)
    if (statusAfter !== t.status) fields.push({ label: "Status", value: change(t.status, statusAfter) })
    if (stageAfter !== t.boardStage || statusAfter !== t.status) fields.push({ label: "Stage", value: change(t.boardStage, stageAfter) })
    if (v.labels !== undefined) fields.push({ label: "Labels", value: change(labelsLabel(t.labels), labelsLabel(v.labels as string[])) })
    if (edit.appended) fields.push({ label: "Notes", value: `+ ${edit.appended.slice(0, 400)}` })
    else if (v.notes !== undefined) {
      const notes = v.notes as string
      fields.push({ label: "Notes", value: notes ? `replaced with: ${notes.slice(0, 400)}${notes.length > 400 ? "…" : ""}` : "cleared" })
    }
    return { title: "Edit task", fields, note: edit.warnings.join(" ") || undefined }
  },
  async run(args, ctx) {
    const edit = await taskEditFrom(args)
    if (hasChanges(edit)) {
      const planned = await planTaskPatch(edit.task, edit.patch)
      if (!planned.ok) throw new Error(planned.error)
      if (Object.keys(edit.patch).length) await applyTaskPatch(edit.task.id, planned)
      // Reopening goes through completeTask so a repeating task's period record is retracted.
      if (edit.reopen) {
        const reopened = await completeTask(edit.task.id, ctx.userId, false)
        if (!reopened.ok) throw new Error(reopened.error)
      }
      if (edit.stage) {
        await db
          .update(tasks)
          .set({ status: "open", completedAt: null, boardStage: edit.stage, updatedAt: new Date() })
          .where(eq(tasks.id, edit.task.id))
      }
    }
    const fresh = await db.query.tasks.findFirst({ where: eq(tasks.id, edit.task.id) })
    if (!fresh) throw new Error("Could not read the task back.")
    return {
      taskId: fresh.id,
      title: fresh.title,
      client: await nameOf("client", fresh.clientId),
      project: await nameOf("project", fresh.projectId),
      priority: PRIORITY_WORDS[fresh.priority] ?? fresh.priority,
      status: fresh.status,
      stage: fresh.boardStage,
      labels: fresh.labels,
      notes: fresh.notes.slice(0, 600),
      changed: hasChanges(edit),
      warnings: edit.warnings,
    }
  },
}

export const BOARD_TOOLS: readonly ToolSpec[] = [
  listLeftOffTool,
  listWaitingTool,
  listTasksTool,
  listCalendarTool,
  createCalendarEventTool,
  dismissLeftOffTool,
  completeTaskTool,
  rescheduleTaskTool,
  editTaskTool,
]
