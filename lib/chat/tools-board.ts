import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { calendarSources, tasks } from "@/db/schema"
import { getMeetingsInWindow } from "@/lib/calendar"
import { PERSONAL_CALENDAR_ID, writeCalendarEvent } from "@/lib/calendar-write"
import { workspaceTimezone } from "@/lib/timezone"
import { dismissNote, loadLeftOff } from "@/lib/leftoff-data"
import { listTasks } from "@/lib/tasks"
import { completeTask } from "@/lib/task-complete"
import { loadWaiting } from "@/lib/waiting-data"
import { ISO_DAY, range, str, type ToolSpec } from "@/lib/chat/tool-helpers"

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
        id: t.id,
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
    const board = await loadLeftOff()
    const note = ref ? board.notes.find((n) => n.sessionRef === ref) : null
    return {
      title: "Dismiss leftover",
      fields: [
        { label: "Ref", value: ref ?? "—" },
        { label: "Title", value: note?.title ?? "—" },
        { label: "State", value: note?.state ?? "—" },
      ],
      note: note ? undefined : "No matching row on the board right now.",
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
    const id = str(args, "taskId")
    const task = id ? await db.query.tasks.findFirst({ where: eq(tasks.id, id) }) : null
    return {
      title: "Complete task",
      fields: [
        { label: "Task", value: task?.title ?? id ?? "—" },
        { label: "Due", value: task?.dueOn ?? "—" },
      ],
      note: task ? undefined : "No task with that id.",
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
    const id = str(args, "taskId")
    const dueOn = str(args, "dueOn")
    const task = id ? await db.query.tasks.findFirst({ where: eq(tasks.id, id) }) : null
    if (task && dueOn && !ISO_DAY.test(dueOn)) {
      return {
        title: "Reschedule task",
        fields: [{ label: "Task", value: task.title }],
        note: "That due date is not valid. Use YYYY-MM-DD.",
      }
    }
    return {
      title: "Reschedule task",
      fields: [
        { label: "Task", value: task?.title ?? id ?? "—" },
        { label: "Due now", value: task?.dueOn ?? "—" },
        { label: "Due after", value: dueOn ?? "cleared" },
      ],
      note: task ? undefined : "No task with that id.",
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

export const BOARD_TOOLS: readonly ToolSpec[] = [
  listLeftOffTool,
  listWaitingTool,
  listTasksTool,
  listCalendarTool,
  createCalendarEventTool,
  dismissLeftOffTool,
  completeTaskTool,
  rescheduleTaskTool,
]
