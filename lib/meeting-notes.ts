import { and, asc, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  calendarEvents,
  clients,
  meetingNoteItems,
  meetingNotes,
  projects,
  tasks,
  timePunches,
} from "@/db/schema"
import type { MeetingNote, MeetingNoteItem } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { notify } from "@/lib/notify"
import { attendeeDomains } from "@/lib/meetings"
import { clientTimezoneFor } from "@/lib/client-timezone"
import { workspaceTimezone } from "@/lib/timezone"
import { occurredOnIn, punchHours } from "@/lib/punch"
import {
  activeRetainerFor,
  approvePunch,
  clockIn,
  clockOut,
  insertApprovedEntry,
  toView,
  type PunchView,
} from "@/lib/punches"
import { insertTaskRow, resolveTaskTarget } from "@/lib/task-insert"
import { writeCalendarEvent } from "@/lib/calendar-write"
import { analyzeTranscript, type Analyzer } from "@/lib/meeting-note-analysis"
import { recordWorkerSeen, workerStatus, type WorkerStatus } from "@/lib/chat/worker-status"
import {
  bandOf,
  canTransition,
  DAY,
  dayIn,
  defaultEventEnd,
  EMPTY_ANALYSIS,
  FILABLE_KINDS,
  formatDayLabel,
  formatMeetingMoment,
  HEARTBEAT_LOST_MS,
  ITEM_KINDS,
  ITEM_REF_KIND,
  isLive,
  itemToEventInput,
  itemToTaskInput,
  MAX_PASTE_CHARS,
  MAX_TRANSCRIPT_ATTEMPTS,
  mechanicalFallback,
  parseLevels,
  parseSegments,
  parseTranscript,
  phaseLabel,
  reindex,
  STALE_REQUEST_MS,
  summaryLine,
  TASK_SOURCE,
  TRANSCRIPT_STUCK_MS,
  transcriptText,
  WALL_CLOCK,
  type Band,
  type ItemKind,
  type MeetingAnalysis,
  type MeetingLevels,
  type NoteStatus,
  type TranscriptSegment,
} from "@/lib/meeting-note"

/**
 * The db half of meeting notes. `lib/meeting-note.ts` is the pure half —
 * keep anything a client component needs over there.
 *
 * Two machines write here. The Mac (scripts/meeting-worker.ts) claims a
 * capture, heartbeats while it records, posts the recording and later the
 * transcript. The CRM runs the analysis and holds every gate: nothing lands
 * on the board, the calendar or the timesheet until Karol files it. Every
 * state change is a compare-and-swap on the status columns, so a click and
 * a heartbeat racing each other cannot both win.
 */

export const MEETING_WORKER_KEY = "meeting_worker"
export const RECORDER_SOURCE = "recorder" as const

type Failure = { ok: false; status: number; error: string }
type Success<T> = { ok: true; data: T }
export type NoteResult<T> = Success<T> | Failure

const fail = (status: number, error: string): Failure => ({ ok: false, status, error })
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* ------------------------------------------------------------------ */
/* views                                                                */
/* ------------------------------------------------------------------ */

export type Party = { id: string; name: string; slug: string }

export type ItemCounts = {
  proposed: number
  accepted: number
  dismissed: number
  tasks: number
  events: number
}

export type NoteRow = {
  id: string
  title: string
  status: NoteStatus
  source: string
  transcriptStatus: string
  analysisStatus: string
  phase: string
  band: Band
  startedAt: string | null
  endedAt: string | null
  durationSec: number
  language: string
  timeZone: string
  worker: string
  heartbeatAt: string | null
  client: Party | null
  project: Party | null
  items: ItemCounts
  createdAt: string
}

export type ItemView = {
  id: string
  kind: ItemKind
  sort: number
  title: string
  detail: string
  quote: string
  segmentIndex: number | null
  segmentStart: number | null
  owner: string
  dueOn: string | null
  startsAt: string
  endsAt: string
  timeZone: string
  state: "proposed" | "accepted" | "dismissed"
  taskId: string | null
  calendarRef: string
  calendarUrl: string
  error: string
}

export type NoteDetail = NoteRow & {
  summary: string
  analysis: MeetingAnalysis
  analysisModel: string
  analysisError: string
  transcriptModel: string
  transcriptError: string
  transcriptAttempts: number
  segments: TranscriptSegment[]
  speakerNames: Record<string, string>
  tracks: string[]
  recordingPath: string
  levels: MeetingLevels | null
  punch: PunchView | null
  ownsPunch: boolean
  calendarEvent: { title: string; startsAt: string; endsAt: string; attendees: { name: string; email: string }[] } | null
  filedAt: string | null
  itemRows: ItemView[]
}

type NoteWithParties = MeetingNote & {
  client: Party | null
  project: Party | null
}

const withParties = {
  client: { columns: { id: true, name: true, slug: true } },
  project: { columns: { id: true, name: true, slug: true } },
} as const

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

function countItems(items: { kind: string; state: string }[]): ItemCounts {
  const counts: ItemCounts = { proposed: 0, accepted: 0, dismissed: 0, tasks: 0, events: 0 }
  for (const item of items) {
    if (item.state === "proposed") counts.proposed += 1
    else if (item.state === "accepted") counts.accepted += 1
    else if (item.state === "dismissed") counts.dismissed += 1
    if (item.state !== "dismissed") {
      if (item.kind === "task") counts.tasks += 1
      if (item.kind === "event") counts.events += 1
    }
  }
  return counts
}

function toRow(note: NoteWithParties, items: { kind: string; state: string }[]): NoteRow {
  return {
    id: note.id,
    title: note.title,
    status: note.status as NoteStatus,
    source: note.source,
    transcriptStatus: note.transcriptStatus,
    analysisStatus: note.analysisStatus,
    phase: phaseLabel(note),
    band: bandOf(note),
    startedAt: iso(note.startedAt),
    endedAt: iso(note.endedAt),
    durationSec: note.durationSec,
    language: note.language,
    timeZone: note.timeZone,
    worker: note.worker,
    heartbeatAt: iso(note.heartbeatAt),
    client: note.client,
    project: note.project,
    items: countItems(items),
    createdAt: note.createdAt.toISOString(),
  }
}

function toItemView(item: MeetingNoteItem, segments: TranscriptSegment[]): ItemView {
  const seg = item.segmentIndex != null && item.segmentIndex >= 0 ? segments[item.segmentIndex] : undefined
  return {
    id: item.id,
    kind: (ITEM_KINDS as readonly string[]).includes(item.kind) ? (item.kind as ItemKind) : "note",
    sort: item.sort,
    title: item.title,
    detail: item.detail,
    quote: item.quote,
    segmentIndex: item.segmentIndex,
    segmentStart: seg?.start ?? null,
    owner: item.owner,
    dueOn: item.dueOn,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    timeZone: item.timeZone,
    state: item.state === "accepted" || item.state === "dismissed" ? item.state : "proposed",
    taskId: item.taskId,
    calendarRef: item.calendarRef,
    calendarUrl: item.calendarUrl,
    error: item.error,
  }
}

async function punchView(punchId: string | null): Promise<PunchView | null> {
  if (!punchId) return null
  const row = await db.query.timePunches.findFirst({
    where: eq(timePunches.id, punchId),
    with: {
      client: { columns: { id: true, name: true, slug: true } },
      project: { columns: { id: true, name: true } },
    },
  })
  if (!row) return null
  return toView(row as Parameters<typeof toView>[0], await workspaceTimezone())
}

export async function loadNote(id: string): Promise<NoteDetail | null> {
  if (!UUID.test(id)) return null
  const note = await db.query.meetingNotes.findFirst({
    where: eq(meetingNotes.id, id),
    with: {
      ...withParties,
      items: { orderBy: [asc(meetingNoteItems.sort), asc(meetingNoteItems.createdAt)] },
      calendarEvent: { columns: { title: true, startsAt: true, endsAt: true, attendees: true } },
    },
  })
  if (!note) return null
  const punch = await punchView(note.punchId)
  return {
    ...toRow(note, note.items),
    summary: note.summary,
    analysis: note.analysis ?? EMPTY_ANALYSIS,
    analysisModel: note.analysisModel,
    analysisError: note.analysisError,
    transcriptModel: note.transcriptModel,
    transcriptError: note.transcriptError,
    transcriptAttempts: note.transcriptAttempts,
    segments: note.segments ?? [],
    speakerNames: note.speakerNames ?? {},
    tracks: note.tracks ?? [],
    recordingPath: note.recordingPath,
    levels: note.levels ?? null,
    punch,
    ownsPunch: note.ownsPunch,
    calendarEvent: note.calendarEvent
      ? {
          title: note.calendarEvent.title,
          startsAt: note.calendarEvent.startsAt.toISOString(),
          endsAt: note.calendarEvent.endsAt.toISOString(),
          attendees: note.calendarEvent.attendees,
        }
      : null,
    filedAt: iso(note.filedAt),
    itemRows: note.items.map((item) => toItemView(item, note.segments ?? [])),
  }
}

export async function listNotes(userId: string, limit = 200): Promise<NoteRow[]> {
  const rows = await db.query.meetingNotes.findMany({
    where: eq(meetingNotes.userId, userId),
    with: { ...withParties, items: { columns: { kind: true, state: true } } },
    orderBy: [desc(meetingNotes.startedAt), desc(meetingNotes.createdAt)],
    limit,
  })
  return rows.map((row) => toRow(row, row.items))
}

export async function notesForClient(clientId: string, limit = 6): Promise<NoteRow[]> {
  const rows = await db.query.meetingNotes.findMany({
    where: and(eq(meetingNotes.clientId, clientId), sql`${meetingNotes.status} <> 'discarded'`),
    with: { ...withParties, items: { columns: { kind: true, state: true } } },
    orderBy: [desc(meetingNotes.startedAt)],
    limit,
  })
  return rows.map((row) => toRow(row, row.items))
}

/** Notes waiting on Karol — the rail badge. */
export async function reviewCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(meetingNotes)
    .where(and(eq(meetingNotes.userId, userId), eq(meetingNotes.status, "review")))
  return row?.n ?? 0
}

export type LiveView = NoteRow & {
  levels: MeetingLevels | null
  punchId: string | null
  /** Seconds since Start was pressed, for the "Starting…" → stranded flip. */
  waitingSec: number
  recorder: WorkerStatus
}

/**
 * The one live row for a person, or null. A `requested` row nobody claimed
 * in 90 s is failed here too — the cron only comes every fifteen minutes and
 * the panel polls this every two seconds, so this is where honesty happens.
 */
export async function liveRecording(userId: string, now = new Date()): Promise<LiveView | null> {
  const note = await db.query.meetingNotes.findFirst({
    where: and(eq(meetingNotes.userId, userId), inArray(meetingNotes.status, ["requested", "recording", "stopping"])),
    with: { ...withParties, items: { columns: { kind: true, state: true } } },
  })
  if (!note) return null
  if (note.status === "requested" && now.getTime() - note.createdAt.getTime() > STALE_REQUEST_MS) {
    await failCapture(note, "No recorder was listening — the Mac was asleep or the meeting worker was not running.")
    return null
  }
  const recorder = await workerStatus(MEETING_WORKER_KEY)
  return {
    ...toRow(note, note.items),
    levels: note.levels ?? null,
    punchId: note.punchId,
    waitingSec: Math.max(0, Math.round((now.getTime() - note.createdAt.getTime()) / 1000)),
    recorder,
  }
}

export async function recorderStatus(): Promise<WorkerStatus> {
  return workerStatus(MEETING_WORKER_KEY)
}

export async function recordRecorderSeen(name: string) {
  return recordWorkerSeen(name, MEETING_WORKER_KEY)
}

/* ------------------------------------------------------------------ */
/* start / stop                                                         */
/* ------------------------------------------------------------------ */

async function resolveParties(input: { clientId?: string | null; projectId?: string | null }) {
  let clientId = input.clientId || null
  const projectId = input.projectId || null
  let project: Party | null = null
  if (projectId) {
    const row = await db.query.projects.findFirst({ where: eq(projects.id, projectId) })
    if (!row) return fail(400, "That project does not exist.")
    project = { id: row.id, name: row.name, slug: row.slug }
    clientId = row.clientId
  }
  let client: Party | null = null
  if (clientId) {
    const row = await db.query.clients.findFirst({ where: eq(clients.id, clientId) })
    if (!row) return fail(400, "That client does not exist.")
    client = { id: row.id, name: row.name, slug: row.slug }
  }
  return { ok: true as const, data: { client, project } }
}

async function zoneFor(client: Party | null): Promise<string> {
  return client ? clientTimezoneFor(client.slug) : workspaceTimezone()
}

export type CalendarSuggestion = {
  eventId: string
  title: string
  startsAt: string
  endsAt: string
  clientId: string | null
  clientName: string | null
  attendees: string[]
}

/**
 * The calendar event happening now, if any, and the client its attendees'
 * domain names — what the Record panel highlights and Start links to.
 */
export async function calendarNow(now = new Date()): Promise<CalendarSuggestion | null> {
  const slack = 10 * 60_000
  const events = await db.query.calendarEvents.findMany({
    where: and(
      eq(calendarEvents.allDay, false),
      eq(calendarEvents.cancelled, false),
      lte(calendarEvents.startsAt, new Date(now.getTime() + slack)),
      gte(calendarEvents.endsAt, new Date(now.getTime() - slack))
    ),
    orderBy: [asc(calendarEvents.startsAt)],
    limit: 5,
  })
  if (!events.length) return null
  const allClients = await db.query.clients.findMany({ columns: { id: true, name: true, domains: true } })
  const byDomain = new Map<string, { id: string; name: string }>()
  for (const client of allClients) {
    for (const domain of client.domains) byDomain.set(domain.toLowerCase(), { id: client.id, name: client.name })
  }
  const event = events[0]
  const linked = event.clientId ? allClients.find((c) => c.id === event.clientId) : null
  const domain = attendeeDomains(event.attendees).find((d) => byDomain.has(d))
  const client = linked ? { id: linked.id, name: linked.name } : domain ? byDomain.get(domain)! : null
  return {
    eventId: event.id,
    title: event.title,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt.toISOString(),
    clientId: client?.id ?? null,
    clientName: client?.name ?? null,
    attendees: event.attendees.map((a) => a.name || a.email).filter(Boolean),
  }
}

export type StartInput = {
  userId: string
  clientId?: string | null
  projectId?: string | null
  title?: string
  clientRequestId?: string | null
  calendarEventId?: string | null
}

export type StartOutcome = { note: NoteRow; replayed: boolean; punchAdopted: boolean }

/**
 * Start a recording: one live row per person, a punch when there is a
 * client (owned when we opened it, adopted when the same target was already
 * running), the overlapping calendar event when there is one. The Mac has
 * not heard yet — the row sits `requested` until it claims it.
 */
export async function startRecording(input: StartInput): Promise<NoteResult<StartOutcome>> {
  const requestId = input.clientRequestId?.trim() || null
  if (requestId) {
    const existing = await db.query.meetingNotes.findFirst({
      where: and(eq(meetingNotes.userId, input.userId), eq(meetingNotes.clientRequestId, requestId)),
      with: { ...withParties, items: { columns: { kind: true, state: true } } },
    })
    if (existing) return { ok: true, data: { note: toRow(existing, existing.items), replayed: true, punchAdopted: false } }
  }

  const live = await db.query.meetingNotes.findFirst({
    where: and(eq(meetingNotes.userId, input.userId), inArray(meetingNotes.status, ["requested", "recording", "stopping"])),
  })
  if (live) return fail(409, "A recording is already running. Stop it before starting another.")

  const parties = await resolveParties(input)
  if (!parties.ok) return parties
  const { client, project } = parties.data
  const timeZone = await zoneFor(client)

  let title = (input.title ?? "").trim().slice(0, 200)
  let calendarEventId = input.calendarEventId && UUID.test(input.calendarEventId) ? input.calendarEventId : null
  if (!calendarEventId) {
    const suggestion = await calendarNow()
    if (suggestion && (!client || !suggestion.clientId || suggestion.clientId === client.id)) {
      calendarEventId = suggestion.eventId
      if (!title) title = suggestion.title.slice(0, 200)
    }
  }

  let punchId: string | null = null
  let ownsPunch = false
  let punchAdopted = false
  if (client) {
    const punch = await clockIn({
      userId: input.userId,
      clientId: client.id,
      projectId: project?.id ?? null,
      note: title,
      source: RECORDER_SOURCE,
      clientRequestId: requestId ? `meeting-note:${requestId}` : null,
    })
    if (punch.ok) {
      punchId = punch.data.punch.id
      ownsPunch = true
    } else if (punch.status === 409 && punch.running) {
      punchId = punch.running.id
      punchAdopted = true
    } else {
      return fail(punch.status, punch.error)
    }
  }

  try {
    const [row] = await db
      .insert(meetingNotes)
      .values({
        userId: input.userId,
        clientId: client?.id ?? null,
        projectId: project?.id ?? null,
        calendarEventId,
        punchId,
        ownsPunch,
        title,
        status: "requested",
        source: "live",
        timeZone,
        startedAt: new Date(),
        clientRequestId: requestId,
      })
      .returning()
    const note = { ...row, client, project }
    return { ok: true, data: { note: toRow(note, []), replayed: false, punchAdopted } }
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      if (ownsPunch && punchId) await clockOut({ userId: input.userId, punchId }).catch(() => null)
      return fail(409, "A recording is already running.")
    }
    throw error
  }
}

/** Stop is a compare-and-swap; the Mac finishes the row on its next heartbeat. */
export async function requestStop(userId: string, noteId: string): Promise<NoteResult<NoteRow>> {
  const note = await db.query.meetingNotes.findFirst({
    where: and(eq(meetingNotes.id, noteId), eq(meetingNotes.userId, userId)),
    with: { ...withParties, items: { columns: { kind: true, state: true } } },
  })
  if (!note) return fail(404, "That recording does not exist.")
  if (note.status === "requested") return discardNote(userId, noteId)
  if (note.status === "stopping" || note.status === "recorded") return { ok: true, data: toRow(note, note.items) }
  if (note.status !== "recording") return fail(409, `That recording is ${note.status}, not running.`)
  const [row] = await db
    .update(meetingNotes)
    .set({ status: "stopping", updatedAt: new Date() })
    .where(and(eq(meetingNotes.id, noteId), eq(meetingNotes.status, "recording")))
    .returning()
  return { ok: true, data: toRow({ ...(row ?? note), client: note.client, project: note.project }, note.items) }
}

/** Discard from any state. An owned punch still running is clocked out; the row stays as a receipt. */
export async function discardNote(userId: string, noteId: string): Promise<NoteResult<NoteRow>> {
  const note = await db.query.meetingNotes.findFirst({
    where: and(eq(meetingNotes.id, noteId), eq(meetingNotes.userId, userId)),
    with: { ...withParties, items: { columns: { kind: true, state: true } } },
  })
  if (!note) return fail(404, "That note does not exist.")
  if (note.status === "discarded") return { ok: true, data: toRow(note, note.items) }
  if (!canTransition(note.status as NoteStatus, "discarded")) return fail(409, "That note cannot be discarded.")
  if (note.ownsPunch && note.punchId) await closeOwnedPunch(note, new Date())
  const [row] = await db
    .update(meetingNotes)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(eq(meetingNotes.id, noteId))
    .returning()
  return { ok: true, data: toRow({ ...row, client: note.client, project: note.project }, note.items) }
}

async function closeOwnedPunch(note: MeetingNote, at: Date) {
  if (!note.punchId) return
  const punch = await db.query.timePunches.findFirst({ where: eq(timePunches.id, note.punchId) })
  if (!punch || punch.status !== "running") return
  const within24h = Math.abs(Date.now() - at.getTime()) < 23.5 * 3_600_000
  await clockOut({ userId: note.userId, punchId: note.punchId, at: within24h ? at.toISOString() : undefined }).catch(() => null)
}

async function failCapture(note: MeetingNote, error: string) {
  await db
    .update(meetingNotes)
    .set({ status: "failed", transcriptError: error, updatedAt: new Date() })
    .where(and(eq(meetingNotes.id, note.id), inArray(meetingNotes.status, ["requested", "recording", "stopping"])))
  if (note.ownsPunch && note.punchId) await closeOwnedPunch(note, note.heartbeatAt ?? new Date())
}

/* ------------------------------------------------------------------ */
/* the Mac's side                                                       */
/* ------------------------------------------------------------------ */

export type CaptureJob = {
  id: string
  title: string
  client: { slug: string; name: string } | null
  project: { slug: string; name: string } | null
  timeZone: string
  /** Proper nouns for Whisper's initial prompt: client, project, attendees. */
  vocabulary: string[]
  startedAt: string
}

export type TranscribeJob = {
  id: string
  recordingPath: string
  tracks: string[]
  language: string
  timeZone: string
  vocabulary: string[]
  attempt: number
}

async function vocabularyFor(note: NoteWithParties): Promise<string[]> {
  const words = new Set<string>()
  if (note.client) words.add(note.client.name)
  if (note.project) words.add(note.project.name)
  if (note.calendarEventId) {
    const event = await db.query.calendarEvents.findFirst({
      where: eq(calendarEvents.id, note.calendarEventId),
      columns: { attendees: true, title: true },
    })
    for (const a of event?.attendees ?? []) if (a.name) words.add(a.name)
  }
  return Array.from(words).slice(0, 20)
}

/**
 * The oldest `requested` row becomes this worker's recording — compare-and-
 * swap, like the chat queue. A request older than 90 s is failed instead of
 * started: a recording of a meeting that already ended must never begin late.
 */
export async function claimCapture(worker: string, now = new Date()): Promise<CaptureJob | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await db.query.meetingNotes.findFirst({
      where: eq(meetingNotes.status, "requested"),
      orderBy: [asc(meetingNotes.createdAt)],
      with: withParties,
    })
    if (!next) return null
    if (now.getTime() - next.createdAt.getTime() > STALE_REQUEST_MS) {
      await failCapture(next, "No recorder was listening — the Mac was asleep or the meeting worker was not running.")
      continue
    }
    const [claimed] = await db
      .update(meetingNotes)
      .set({ status: "recording", worker, heartbeatAt: now, startedAt: now, updatedAt: now })
      .where(and(eq(meetingNotes.id, next.id), eq(meetingNotes.status, "requested")))
      .returning()
    if (!claimed) continue
    return {
      id: claimed.id,
      title: claimed.title,
      client: next.client ? { slug: next.client.slug, name: next.client.name } : null,
      project: next.project ? { slug: next.project.slug, name: next.project.name } : null,
      timeZone: claimed.timeZone,
      vocabulary: await vocabularyFor(next),
      startedAt: now.toISOString(),
    }
  }
  return null
}

export type Verdict = "continue" | "stop" | "discard"

/**
 * The recorder's heartbeat, and the channel Stop travels back on. Updates
 * only the heartbeat and the meters — never the status — and answers with
 * what the recorder should do now. A punch stopped from the widget or the
 * watch also stops the recording that owns it.
 */
export async function recordHeartbeat(input: {
  noteId: string
  worker: string
  levels?: unknown
  now?: Date
}): Promise<NoteResult<{ verdict: Verdict }>> {
  const now = input.now ?? new Date()
  const note = await db.query.meetingNotes.findFirst({ where: eq(meetingNotes.id, input.noteId) })
  if (!note) return fail(404, "That recording does not exist.")
  if (note.worker && note.worker !== input.worker) return fail(409, `That recording belongs to ${note.worker}.`)
  if (note.status === "discarded") return { ok: true, data: { verdict: "discard" } }
  if (note.status !== "recording") {
    // A worker mid-transcription beats on this same channel so the sweep
    // does not requeue a job that is merely long.
    if (note.transcriptStatus === "running") await touchTranscription(note.id, input.worker, now)
    return { ok: true, data: { verdict: "stop" } }
  }

  if (note.ownsPunch && note.punchId) {
    const punch = await db.query.timePunches.findFirst({ where: eq(timePunches.id, note.punchId), columns: { status: true } })
    if (punch && punch.status !== "running") {
      await db
        .update(meetingNotes)
        .set({ status: "stopping", updatedAt: now })
        .where(and(eq(meetingNotes.id, note.id), eq(meetingNotes.status, "recording")))
      return { ok: true, data: { verdict: "stop" } }
    }
  }

  const levels = parseLevels(input.levels, now)
  await db
    .update(meetingNotes)
    .set({ heartbeatAt: now, ...(levels ? { levels } : {}), updatedAt: now })
    .where(eq(meetingNotes.id, note.id))
  return { ok: true, data: { verdict: "continue" } }
}

/**
 * The recorder finished writing the files. The row becomes `recorded` with
 * transcription queued for this same worker, and the owned punch is clocked
 * out at the same instant. A replay is a no-op.
 */
export async function markRecorded(input: {
  noteId: string
  worker: string
  durationSec: number
  tracks: string[]
  recordingPath: string
  now?: Date
}): Promise<NoteResult<{ replayed: boolean }>> {
  const now = input.now ?? new Date()
  const note = await db.query.meetingNotes.findFirst({ where: eq(meetingNotes.id, input.noteId) })
  if (!note) return fail(404, "That recording does not exist.")
  if (note.worker && note.worker !== input.worker) return fail(409, `That recording belongs to ${note.worker}.`)
  if (note.status === "discarded") return fail(409, "That recording was discarded.")
  if (!isLive(note.status)) return { ok: true, data: { replayed: true } }

  const durationSec = Math.max(0, Math.round(Number(input.durationSec) || 0))
  const tracks = input.tracks.filter((t) => t === "mic" || t === "system")
  const [row] = await db
    .update(meetingNotes)
    .set({
      status: "recorded",
      endedAt: now,
      durationSec,
      tracks,
      recordingPath: input.recordingPath.slice(0, 1000),
      worker: input.worker,
      transcriptStatus: durationSec > 0 ? "queued" : "failed",
      transcriptError: durationSec > 0 ? "" : "The recording is empty.",
      heartbeatAt: now,
      updatedAt: now,
    })
    .where(and(eq(meetingNotes.id, note.id), inArray(meetingNotes.status, ["recording", "stopping"])))
    .returning()
  if (!row) return { ok: true, data: { replayed: true } }
  if (note.ownsPunch && note.punchId) await closeOwnedPunch(note, now)
  return { ok: true, data: { replayed: false } }
}

/** Transcription is affine to the Mac that holds the WAVs. */
export async function claimTranscription(worker: string, now = new Date()): Promise<TranscribeJob | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await db.query.meetingNotes.findFirst({
      where: and(
        eq(meetingNotes.status, "recorded"),
        eq(meetingNotes.transcriptStatus, "queued"),
        eq(meetingNotes.worker, worker)
      ),
      orderBy: [asc(meetingNotes.endedAt)],
      with: withParties,
    })
    if (!next) return null
    const [claimed] = await db
      .update(meetingNotes)
      .set({
        transcriptStatus: "running",
        transcriptAttempts: sql`${meetingNotes.transcriptAttempts} + 1`,
        heartbeatAt: now,
        updatedAt: now,
      })
      .where(and(eq(meetingNotes.id, next.id), eq(meetingNotes.transcriptStatus, "queued")))
      .returning()
    if (!claimed) continue
    return {
      id: claimed.id,
      recordingPath: claimed.recordingPath,
      tracks: claimed.tracks,
      language: claimed.language,
      timeZone: claimed.timeZone,
      vocabulary: await vocabularyFor(next),
      attempt: claimed.transcriptAttempts,
    }
  }
  return null
}

/** A worker still transcribing says so, or the sweep will requeue the job under it. */
export async function touchTranscription(noteId: string, worker: string, now = new Date()) {
  await db
    .update(meetingNotes)
    .set({ heartbeatAt: now })
    .where(and(eq(meetingNotes.id, noteId), eq(meetingNotes.worker, worker), eq(meetingNotes.transcriptStatus, "running")))
}

/**
 * The transcript lands, the text twin is derived here (one writer), and the
 * notes are written in the same request — the Mac waits up to three minutes
 * for this one call.
 */
export async function saveTranscript(input: {
  noteId: string
  worker: string
  segments: unknown
  model?: string | null
  language?: string | null
  analyzer?: Analyzer
}): Promise<NoteResult<NoteDetail>> {
  const note = await db.query.meetingNotes.findFirst({ where: eq(meetingNotes.id, input.noteId) })
  if (!note) return fail(404, "That note does not exist.")
  if (note.worker && note.worker !== input.worker) return fail(409, `That note belongs to ${note.worker}.`)
  if (note.status === "discarded") return fail(409, "That note was discarded.")
  const parsed = parseSegments(input.segments)
  if ("error" in parsed) return fail(400, parsed.error)
  if (!parsed.length) return fail(422, "The transcript is empty — nothing was said, or the tracks were silent.")

  const last = parsed[parsed.length - 1]
  const durationSec = note.durationSec > 0 ? note.durationSec : Math.round(last.end ?? last.start ?? 0)
  const now = new Date()
  await db
    .update(meetingNotes)
    .set({
      segments: parsed,
      transcriptText: transcriptText(parsed, note.speakerNames),
      transcriptModel: (input.model ?? "").slice(0, 120),
      language: (input.language ?? "").slice(0, 16),
      transcriptStatus: "done",
      transcriptError: "",
      durationSec,
      status: note.status === "recorded" ? "recorded" : note.status,
      heartbeatAt: now,
      updatedAt: now,
    })
    .where(eq(meetingNotes.id, note.id))

  await runAnalysis(note.id, { analyzer: input.analyzer })
  const detail = await loadNote(note.id)
  return detail ? { ok: true, data: detail } : fail(404, "That note vanished.")
}

export async function failStage(input: {
  noteId: string
  worker: string
  stage: "capture" | "transcript"
  error: string
}): Promise<NoteResult<{ status: string }>> {
  const note = await db.query.meetingNotes.findFirst({ where: eq(meetingNotes.id, input.noteId) })
  if (!note) return fail(404, "That note does not exist.")
  if (note.worker && note.worker !== input.worker) return fail(409, `That note belongs to ${note.worker}.`)
  const error = input.error.trim().slice(0, 2000) || "The recorder reported a failure."
  if (input.stage === "capture") {
    if (!isLive(note.status)) return { ok: true, data: { status: note.status } }
    await failCapture(note, error)
    return { ok: true, data: { status: "failed" } }
  }
  await db
    .update(meetingNotes)
    .set({ transcriptStatus: "failed", transcriptError: error, updatedAt: new Date() })
    .where(eq(meetingNotes.id, note.id))
  return { ok: true, data: { status: note.status } }
}

/** Karol asks for another try at the audio; the Mac that has it will pick it up. */
export async function requeueTranscription(userId: string, noteId: string): Promise<NoteResult<null>> {
  const note = await db.query.meetingNotes.findFirst({
    where: and(eq(meetingNotes.id, noteId), eq(meetingNotes.userId, userId)),
  })
  if (!note) return fail(404, "That note does not exist.")
  if (!note.recordingPath || !note.worker) return fail(422, "There is no recording on a Mac to transcribe again.")
  if (note.transcriptStatus === "running") return fail(409, "It is being transcribed right now.")
  await db
    .update(meetingNotes)
    .set({ transcriptStatus: "queued", transcriptError: "", transcriptAttempts: 0, updatedAt: new Date() })
    .where(eq(meetingNotes.id, note.id))
  return { ok: true, data: null }
}

/* ------------------------------------------------------------------ */
/* analysis                                                             */
/* ------------------------------------------------------------------ */

/**
 * Write the notes from the transcript. Proposed items are replaced; accepted
 * and dismissed ones — Karol's decisions — are kept, and a new proposal with
 * the same title as a decided one is not proposed again. A failure still
 * leaves a title and a summary that says what happened.
 */
export async function runAnalysis(noteId: string, opts: { analyzer?: Analyzer } = {}): Promise<NoteResult<null>> {
  const analyzer = opts.analyzer ?? analyzeTranscript
  const note = await db.query.meetingNotes.findFirst({
    where: eq(meetingNotes.id, noteId),
    with: {
      ...withParties,
      items: true,
      calendarEvent: { columns: { title: true, attendees: true } },
    },
  })
  if (!note) return fail(404, "That note does not exist.")
  if (note.status === "discarded") return fail(409, "That note was discarded.")
  const segments = note.segments ?? []
  if (!segments.length) return fail(422, "There is no transcript to write notes from.")

  const now = new Date()
  await db
    .update(meetingNotes)
    .set({ analysisStatus: "running", analysisError: "", updatedAt: now })
    .where(eq(meetingNotes.id, note.id))

  const zone = note.timeZone || "UTC"
  const when = note.startedAt ?? note.createdAt
  const dayLabel = formatDayLabel(when, zone)
  const decided = new Set(
    note.items.filter((i) => i.state !== "proposed").map((i) => `${i.kind}|${i.title.trim().toLowerCase()}`)
  )

  try {
    const outcome = await analyzer({
      clientName: note.client?.name ?? null,
      projectName: note.project?.name ?? null,
      title: note.title,
      moment: formatMeetingMoment(when, zone),
      day: dayIn(when, zone),
      timeZone: zone,
      attendees: (note.calendarEvent?.attendees ?? []).map((a) => a.name || a.email).filter(Boolean),
      segments,
      speakerNames: note.speakerNames ?? {},
    })
    const a = outcome.analysis
    const fresh = a.items.filter((item) => !decided.has(`${item.kind}|${item.title.trim().toLowerCase()}`))

    await db.transaction(async (tx) => {
      await tx
        .delete(meetingNoteItems)
        .where(and(eq(meetingNoteItems.noteId, note.id), eq(meetingNoteItems.state, "proposed")))
      if (fresh.length) {
        await tx.insert(meetingNoteItems).values(
          fresh.map((item, index) => ({
            noteId: note.id,
            kind: item.kind,
            sort: index,
            title: item.title,
            detail: item.detail,
            quote: item.quote,
            segmentIndex: item.segmentIndex >= 0 ? item.segmentIndex : null,
            owner: item.owner,
            dueOn: item.dueOn,
            startsAt: item.startsAt ?? "",
            endsAt: item.endsAt ?? (item.startsAt && WALL_CLOCK.test(item.startsAt) ? defaultEventEnd(item.startsAt) : ""),
            timeZone: zone,
            state: "proposed",
          }))
        )
      }
      await tx
        .update(meetingNotes)
        .set({
          title: note.title.trim() ? note.title : a.title || `${note.client?.name ?? "Meeting"} · ${dayLabel}`,
          summary: a.summary,
          analysis: { attendees: a.attendees, topics: a.topics, decisions: a.decisions, questions: a.questions },
          analysisModel: outcome.model,
          analysisUsage: outcome.usage,
          analysisStatus: "done",
          analysisError: "",
          status: note.status === "recorded" ? "review" : note.status,
          updatedAt: new Date(),
        })
        .where(eq(meetingNotes.id, note.id))
    })

    await notify({
      kind: "meetingnotes.ready",
      dedupeKey: `note:${note.id}`,
      body: `${a.title || note.title || "Meeting notes"} — ${fresh.length} ${fresh.length === 1 ? "proposal" : "proposals"} to review`,
      url: ROUTES.meetingNote(note.id),
    }).catch(() => {})
    return { ok: true, data: null }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const fallback = mechanicalFallback({
      clientName: note.client?.name ?? null,
      calendarTitle: note.calendarEvent?.title ?? null,
      dayLabel,
      segments,
      error: message,
    })
    await db
      .update(meetingNotes)
      .set({
        title: note.title.trim() ? note.title : fallback.title,
        summary: note.summary.trim() && note.analysisStatus === "done" ? note.summary : fallback.summary,
        analysisStatus: "failed",
        analysisError: message.slice(0, 2000),
        status: note.status === "recorded" ? "review" : note.status,
        updatedAt: new Date(),
      })
      .where(eq(meetingNotes.id, note.id))
    return fail(502, message)
  }
}

/* ------------------------------------------------------------------ */
/* transcripts that arrive as text                                      */
/* ------------------------------------------------------------------ */

export type PasteInput = {
  userId: string
  title?: string
  clientId?: string | null
  projectId?: string | null
  /** ISO instant the meeting happened, or null for now. */
  startedAt?: string | null
  text: string
  analyzer?: Analyzer
}

export async function createFromTranscript(input: PasteInput): Promise<NoteResult<{ id: string }>> {
  const text = (input.text ?? "").trim()
  if (!text) return fail(400, "Paste the transcript first.")
  if (text.length > MAX_PASTE_CHARS) return fail(413, "That transcript is too long to paste — import the file on the Mac instead.")
  const parsed = parseTranscript(text)
  if (!parsed.segments.length) return fail(422, "Nothing readable in that transcript.")

  const parties = await resolveParties(input)
  if (!parties.ok) return parties
  const { client, project } = parties.data
  const timeZone = await zoneFor(client)
  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date()
  if (Number.isNaN(startedAt.getTime())) return fail(400, "That date is not valid.")
  const last = parsed.segments[parsed.segments.length - 1]
  const durationSec = Math.round(last.end ?? last.start ?? 0)

  const [row] = await db
    .insert(meetingNotes)
    .values({
      userId: input.userId,
      clientId: client?.id ?? null,
      projectId: project?.id ?? null,
      title: (input.title ?? "").trim().slice(0, 200),
      status: "recorded",
      source: "paste",
      timeZone,
      startedAt,
      endedAt: durationSec ? new Date(startedAt.getTime() + durationSec * 1000) : null,
      durationSec,
      segments: parsed.segments,
      transcriptText: transcriptText(parsed.segments),
      transcriptStatus: "done",
      transcriptModel: `pasted ${parsed.format}`,
    })
    .returning({ id: meetingNotes.id })

  await runAnalysis(row.id, { analyzer: input.analyzer })
  return { ok: true, data: { id: row.id } }
}

export type ImportInput = {
  userId: string
  worker: string
  title?: string | null
  clientSlug?: string | null
  clientId?: string | null
  projectSlug?: string | null
  projectId?: string | null
  startedAt?: string | null
  durationSec?: number | null
  recordingPath?: string | null
  tracks?: string[] | null
  /** Already-transcribed imports (.vtt/.srt/.txt) skip Whisper. */
  segments?: unknown
  language?: string | null
  model?: string | null
  clientRequestId?: string | null
}

/** A file the Mac found — a Zoom recording, a Voice Memo, a caption file. */
export async function createImport(input: ImportInput): Promise<NoteResult<{ id: string; replayed: boolean }>> {
  const requestId = input.clientRequestId?.trim() || null
  if (requestId) {
    const existing = await db.query.meetingNotes.findFirst({
      where: and(eq(meetingNotes.userId, input.userId), eq(meetingNotes.clientRequestId, requestId)),
      columns: { id: true },
    })
    if (existing) return { ok: true, data: { id: existing.id, replayed: true } }
  }
  let clientId = input.clientId ?? null
  let projectId = input.projectId ?? null
  if (!clientId && input.clientSlug) {
    const client = await db.query.clients.findFirst({ where: eq(clients.slug, input.clientSlug) })
    if (!client) return fail(404, `No client with slug "${input.clientSlug}".`)
    clientId = client.id
  }
  if (!projectId && input.projectSlug) {
    const project = await db.query.projects.findFirst({ where: eq(projects.slug, input.projectSlug) })
    if (!project) return fail(404, `No project with slug "${input.projectSlug}".`)
    projectId = project.id
  }
  const parties = await resolveParties({ clientId, projectId })
  if (!parties.ok) return parties
  const { client, project } = parties.data
  const timeZone = await zoneFor(client)
  const startedAt = input.startedAt ? new Date(input.startedAt) : new Date()
  if (Number.isNaN(startedAt.getTime())) return fail(400, "startedAt is not a valid ISO timestamp.")

  const segments = input.segments != null ? parseSegments(input.segments) : null
  if (segments && "error" in segments) return fail(400, segments.error)
  const hasText = !!segments && segments.length > 0
  const durationSec = Math.max(
    0,
    Math.round(Number(input.durationSec) || (hasText ? segments![segments!.length - 1].end ?? 0 : 0))
  )

  const [row] = await db
    .insert(meetingNotes)
    .values({
      userId: input.userId,
      clientId: client?.id ?? null,
      projectId: project?.id ?? null,
      title: (input.title ?? "").trim().slice(0, 200),
      status: "recorded",
      source: "import",
      timeZone,
      worker: input.worker,
      startedAt,
      endedAt: durationSec ? new Date(startedAt.getTime() + durationSec * 1000) : null,
      durationSec,
      recordingPath: (input.recordingPath ?? "").slice(0, 1000),
      tracks: (input.tracks ?? []).filter((t) => t === "mic" || t === "system"),
      segments: hasText ? segments! : [],
      transcriptText: hasText ? transcriptText(segments!) : "",
      transcriptStatus: hasText ? "done" : "queued",
      transcriptModel: hasText ? (input.model ?? "imported").slice(0, 120) : "",
      language: (input.language ?? "").slice(0, 16),
      clientRequestId: requestId,
      heartbeatAt: new Date(),
    })
    .returning({ id: meetingNotes.id })

  if (hasText) await runAnalysis(row.id)
  return { ok: true, data: { id: row.id, replayed: false } }
}

/* ------------------------------------------------------------------ */
/* review                                                               */
/* ------------------------------------------------------------------ */

async function ownedNote(userId: string, noteId: string) {
  if (!UUID.test(noteId)) return null
  return db.query.meetingNotes.findFirst({
    where: and(eq(meetingNotes.id, noteId), eq(meetingNotes.userId, userId)),
    with: withParties,
  })
}

export async function setNoteTitle(userId: string, noteId: string, title: string): Promise<NoteResult<null>> {
  const note = await ownedNote(userId, noteId)
  if (!note) return fail(404, "That note does not exist.")
  await db
    .update(meetingNotes)
    .set({ title: title.trim().slice(0, 200), updatedAt: new Date() })
    .where(eq(meetingNotes.id, note.id))
  return { ok: true, data: null }
}

export async function setNoteTarget(
  userId: string,
  noteId: string,
  target: { clientId?: string | null; projectId?: string | null }
): Promise<NoteResult<null>> {
  const note = await ownedNote(userId, noteId)
  if (!note) return fail(404, "That note does not exist.")
  const parties = await resolveParties(target)
  if (!parties.ok) return parties
  const { client, project } = parties.data
  await db
    .update(meetingNotes)
    .set({
      clientId: client?.id ?? null,
      projectId: project?.id ?? null,
      timeZone: await zoneFor(client),
      updatedAt: new Date(),
    })
    .where(eq(meetingNotes.id, note.id))
  return { ok: true, data: null }
}

export async function renameSpeaker(userId: string, noteId: string, speaker: string, name: string): Promise<NoteResult<null>> {
  const note = await ownedNote(userId, noteId)
  if (!note) return fail(404, "That note does not exist.")
  const key = speaker.trim().slice(0, 80)
  if (!key) return fail(400, "Which speaker?")
  const names = { ...(note.speakerNames ?? {}) }
  const clean = name.trim().slice(0, 80)
  if (clean) names[key] = clean
  else delete names[key]
  await db
    .update(meetingNotes)
    .set({ speakerNames: names, transcriptText: transcriptText(note.segments ?? [], names), updatedAt: new Date() })
    .where(eq(meetingNotes.id, note.id))
  return { ok: true, data: null }
}

export type ItemPatch = {
  title?: string
  detail?: string
  owner?: string
  kind?: string
  dueOn?: string | null
  startsAt?: string
  endsAt?: string
}

async function ownedItem(userId: string, itemId: string) {
  if (!UUID.test(itemId)) return null
  const item = await db.query.meetingNoteItems.findFirst({
    where: eq(meetingNoteItems.id, itemId),
    with: { note: { columns: { id: true, userId: true, title: true, timeZone: true, clientId: true, projectId: true, startedAt: true, createdAt: true } } },
  })
  if (!item || item.note.userId !== userId) return null
  return item
}

export async function updateItem(userId: string, itemId: string, patch: ItemPatch): Promise<NoteResult<null>> {
  const item = await ownedItem(userId, itemId)
  if (!item) return fail(404, "That item does not exist.")
  if (item.state === "accepted") return fail(409, "That item is filed already — edit the task or the event instead.")
  const set: Partial<typeof meetingNoteItems.$inferInsert> = { updatedAt: new Date() }
  if (patch.title !== undefined) {
    const title = patch.title.trim().slice(0, 300)
    if (!title) return fail(400, "An item needs a title.")
    set.title = title
  }
  if (patch.detail !== undefined) set.detail = patch.detail.trim().slice(0, 2000)
  if (patch.owner !== undefined) set.owner = patch.owner.trim().slice(0, 80)
  if (patch.kind !== undefined) {
    if (!(ITEM_KINDS as readonly string[]).includes(patch.kind)) return fail(400, "Unknown item kind.")
    set.kind = patch.kind
  }
  if (patch.dueOn !== undefined) {
    if (patch.dueOn && !DAY.test(patch.dueOn)) return fail(400, "The due date must be YYYY-MM-DD.")
    set.dueOn = patch.dueOn || null
  }
  if (patch.startsAt !== undefined) {
    const v = patch.startsAt.trim()
    if (v && !WALL_CLOCK.test(v) && !DAY.test(v)) return fail(400, "The start must be YYYY-MM-DD or YYYY-MM-DDTHH:mm.")
    set.startsAt = v
  }
  if (patch.endsAt !== undefined) {
    const v = patch.endsAt.trim()
    if (v && !WALL_CLOCK.test(v) && !DAY.test(v)) return fail(400, "The end must be YYYY-MM-DD or YYYY-MM-DDTHH:mm.")
    set.endsAt = v
  }
  await db.update(meetingNoteItems).set(set).where(eq(meetingNoteItems.id, item.id))
  return { ok: true, data: null }
}

export async function setItemState(
  userId: string,
  itemId: string,
  state: "proposed" | "dismissed"
): Promise<NoteResult<null>> {
  const item = await ownedItem(userId, itemId)
  if (!item) return fail(404, "That item does not exist.")
  if (item.state === "accepted") return fail(409, "That item is filed already.")
  await db
    .update(meetingNoteItems)
    .set({ state, decidedAt: state === "dismissed" ? new Date() : null, error: "", updatedAt: new Date() })
    .where(eq(meetingNoteItems.id, item.id))
  return { ok: true, data: null }
}

export type FileOutcome = {
  filed: { itemId: string; taskId: string | null; calendarUrl: string }[]
  failed: { itemId: string; error: string }[]
  noteStatus: string
}

/**
 * File the chosen proposals. Each item is its own compare-and-swap from
 * `proposed` to `accepted`, so a double click on File cannot make two tasks:
 * only the click that wins the swap inserts. Tasks land in the same
 * transaction as the swap; an event's Google write happens after it and
 * reverts the swap on failure — the `refKey` makes the retry safe.
 */
export async function fileItems(userId: string, noteId: string, itemIds: string[]): Promise<NoteResult<FileOutcome>> {
  const note = await ownedNote(userId, noteId)
  if (!note) return fail(404, "That note does not exist.")
  if (note.status === "discarded") return fail(409, "That note was discarded.")
  const ids = itemIds.filter((id) => UUID.test(id))
  if (!ids.length) return fail(400, "Pick at least one item.")

  const items = await db.query.meetingNoteItems.findMany({
    where: and(eq(meetingNoteItems.noteId, note.id), inArray(meetingNoteItems.id, ids)),
  })
  const zone = note.timeZone || "UTC"
  const ctx = {
    title: note.title || "Meeting note",
    url: `${(process.env.APP_URL ?? "").replace(/\/$/, "")}${ROUTES.meetingNote(note.id)}`,
    clientName: note.client?.name ?? null,
    dayLabel: formatDayLabel(note.startedAt ?? note.createdAt, zone),
  }
  const target = await resolveTaskTarget({ clientId: note.clientId, projectId: note.projectId })
  if ("error" in target) return fail(400, target.error)

  const outcome: FileOutcome = { filed: [], failed: [], noteStatus: note.status }
  for (const item of items) {
    if (item.state !== "proposed") continue
    const facts = {
      kind: item.kind,
      title: item.title,
      detail: item.detail,
      quote: item.quote,
      segmentStart:
        item.segmentIndex != null && item.segmentIndex >= 0 ? (note.segments?.[item.segmentIndex]?.start ?? null) : null,
      owner: item.owner,
      dueOn: item.dueOn,
      startsAt: item.startsAt,
      endsAt: item.endsAt,
      timeZone: item.timeZone || zone,
    }

    if (item.kind === "task") {
      const taskInput = itemToTaskInput(facts, ctx)
      try {
        const result = await db.transaction(async (tx) => {
          const [won] = await tx
            .update(meetingNoteItems)
            .set({ state: "accepted", decidedAt: new Date(), error: "", updatedAt: new Date() })
            .where(and(eq(meetingNoteItems.id, item.id), eq(meetingNoteItems.state, "proposed")))
            .returning({ id: meetingNoteItems.id })
          if (!won) return null
          const taskId = await insertTaskRow(tx, {
            title: taskInput.title,
            userId,
            target,
            dueOn: taskInput.dueOn,
            priority: taskInput.priority,
            notes: taskInput.notes,
            labels: taskInput.labels,
            source: TASK_SOURCE,
            refKind: ITEM_REF_KIND,
            refId: item.id,
          })
          await tx.update(meetingNoteItems).set({ taskId }).where(eq(meetingNoteItems.id, item.id))
          return taskId
        })
        if (result) outcome.filed.push({ itemId: item.id, taskId: result, calendarUrl: "" })
      } catch (error) {
        outcome.failed.push({ itemId: item.id, error: error instanceof Error ? error.message : String(error) })
      }
      continue
    }

    if (item.kind === "event") {
      const eventInput = itemToEventInput(facts, ctx)
      if ("error" in eventInput) {
        outcome.failed.push({ itemId: item.id, error: eventInput.error })
        await db.update(meetingNoteItems).set({ error: eventInput.error }).where(eq(meetingNoteItems.id, item.id))
        continue
      }
      const [won] = await db
        .update(meetingNoteItems)
        .set({ state: "accepted", decidedAt: new Date(), error: "", updatedAt: new Date() })
        .where(and(eq(meetingNoteItems.id, item.id), eq(meetingNoteItems.state, "proposed")))
        .returning({ id: meetingNoteItems.id })
      if (!won) continue
      const written = await writeCalendarEvent({ ...eventInput, attendees: [], refKey: item.id })
      if (written.ok) {
        await db
          .update(meetingNoteItems)
          .set({ calendarRef: written.id, calendarUrl: written.url, updatedAt: new Date() })
          .where(eq(meetingNoteItems.id, item.id))
        outcome.filed.push({ itemId: item.id, taskId: null, calendarUrl: written.url })
      } else {
        await db
          .update(meetingNoteItems)
          .set({ state: "proposed", decidedAt: null, error: written.error.slice(0, 500), updatedAt: new Date() })
          .where(eq(meetingNoteItems.id, item.id))
        outcome.failed.push({ itemId: item.id, error: written.error })
      }
      continue
    }

    // Decisions, questions, notes: accepting is the receipt; nothing is written elsewhere.
    const [won] = await db
      .update(meetingNoteItems)
      .set({ state: "accepted", decidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(meetingNoteItems.id, item.id), eq(meetingNoteItems.state, "proposed")))
      .returning({ id: meetingNoteItems.id })
    if (won) outcome.filed.push({ itemId: item.id, taskId: null, calendarUrl: "" })
  }

  // The note is filed once nothing filable is left undecided.
  const remaining = await db.query.meetingNoteItems.findMany({
    where: and(eq(meetingNoteItems.noteId, note.id), eq(meetingNoteItems.state, "proposed")),
    columns: { kind: true },
  })
  const undecided = remaining.filter((r) => (FILABLE_KINDS as readonly string[]).includes(r.kind)).length
  if (outcome.filed.length && undecided === 0 && note.status === "review") {
    await db
      .update(meetingNotes)
      .set({ status: "filed", filedAt: note.filedAt ?? new Date(), updatedAt: new Date() })
      .where(and(eq(meetingNotes.id, note.id), eq(meetingNotes.status, "review")))
    outcome.noteStatus = "filed"
  } else if (outcome.filed.length && !note.filedAt) {
    await db.update(meetingNotes).set({ filedAt: new Date(), updatedAt: new Date() }).where(eq(meetingNotes.id, note.id))
  }
  return { ok: true, data: outcome }
}

/** Approve the recording's punch with the first line of the summary. */
export async function approveNotePunch(userId: string, noteId: string): Promise<NoteResult<{ timeEntryId: string }>> {
  const note = await ownedNote(userId, noteId)
  if (!note) return fail(404, "That note does not exist.")
  if (!note.punchId) return fail(422, "This note has no punch to approve.")
  const result = await approvePunch({
    punchId: note.punchId,
    approvedBy: userId,
    summary: summaryLine(note.summary, note.title),
  })
  if (!result.ok) return fail(result.status, result.error)
  return { ok: true, data: { timeEntryId: result.data.timeEntryId } }
}

/**
 * A note with a client but no punch — recorded without one, or imported —
 * logs its time here: an approved `recorder` punch and the billable entry,
 * in one transaction, exactly the shape the clock produces.
 */
export async function logNoteTime(userId: string, noteId: string): Promise<NoteResult<{ timeEntryId: string }>> {
  const note = await ownedNote(userId, noteId)
  if (!note) return fail(404, "That note does not exist.")
  if (note.punchId) return fail(409, "This note already has a punch.")
  if (!note.clientId) return fail(422, "Pick a client first.")
  if (!note.startedAt || note.durationSec <= 0) return fail(422, "This note has no duration to log.")
  const start = note.startedAt
  const end = note.endedAt ?? new Date(start.getTime() + note.durationSec * 1000)
  const hours = punchHours(start, end)
  if (hours <= 0) return fail(422, "Nothing to log.")
  const tz = await workspaceTimezone()
  const retainer = await activeRetainerFor(note.clientId)
  const summary = summaryLine(note.summary, note.title)

  const created = await db.transaction(async (tx) => {
    const [punch] = await tx
      .insert(timePunches)
      .values({
        userId,
        clientId: note.clientId!,
        projectId: note.projectId,
        startedAt: start,
        endedAt: end,
        status: "approved",
        note: `meeting note ${note.id}`,
        source: RECORDER_SOURCE,
        approvedAt: new Date(),
        approvedBy: userId,
      })
      .returning({ id: timePunches.id })
    const timeEntryId = await insertApprovedEntry(tx, {
      userId,
      source: "clock",
      clientId: note.clientId!,
      retainerId: retainer?.id ?? null,
      projectId: note.projectId,
      occurredOn: occurredOnIn(start, tz),
      startedAt: start.toISOString(),
      endedAt: end.toISOString(),
      hours,
      summary,
    })
    await tx.update(timePunches).set({ timeEntryId }).where(eq(timePunches.id, punch.id))
    await tx
      .update(meetingNotes)
      .set({ punchId: punch.id, ownsPunch: true, updatedAt: new Date() })
      .where(eq(meetingNotes.id, note.id))
    return timeEntryId
  })
  return { ok: true, data: { timeEntryId: created } }
}

/* ------------------------------------------------------------------ */
/* the cron sweep                                                       */
/* ------------------------------------------------------------------ */

export type SweepReport = { staleRequests: number; lostRecorders: number; requeued: number; abandoned: number }

export async function sweepMeetingNotes(now = new Date()): Promise<SweepReport> {
  const report: SweepReport = { staleRequests: 0, lostRecorders: 0, requeued: 0, abandoned: 0 }

  const stale = await db.query.meetingNotes.findMany({
    where: and(eq(meetingNotes.status, "requested"), lt(meetingNotes.createdAt, new Date(now.getTime() - STALE_REQUEST_MS))),
  })
  for (const note of stale) {
    await failCapture(note, "No recorder was listening — the Mac was asleep or the meeting worker was not running.")
    report.staleRequests += 1
  }

  const lost = await db.query.meetingNotes.findMany({
    where: and(
      inArray(meetingNotes.status, ["recording", "stopping"]),
      lt(meetingNotes.heartbeatAt, new Date(now.getTime() - HEARTBEAT_LOST_MS))
    ),
  })
  for (const note of lost) {
    await failCapture(note, "The recorder lost contact — the Mac went to sleep or the worker died mid-recording.")
    report.lostRecorders += 1
  }

  const stuck = await db.query.meetingNotes.findMany({
    where: and(
      eq(meetingNotes.transcriptStatus, "running"),
      lt(meetingNotes.heartbeatAt, new Date(now.getTime() - TRANSCRIPT_STUCK_MS))
    ),
  })
  for (const note of stuck) {
    const giveUp = note.transcriptAttempts >= MAX_TRANSCRIPT_ATTEMPTS
    await db
      .update(meetingNotes)
      .set(
        giveUp
          ? { transcriptStatus: "failed", transcriptError: `Transcription did not finish after ${note.transcriptAttempts} attempts.`, updatedAt: now }
          : { transcriptStatus: "queued", updatedAt: now }
      )
      .where(and(eq(meetingNotes.id, note.id), eq(meetingNotes.transcriptStatus, "running")))
    if (giveUp) report.abandoned += 1
    else report.requeued += 1
  }
  return report
}

/** For the db check: everything a note owns, gone. Tasks it made are the caller's to remove. */
export async function deleteNoteHard(noteId: string) {
  await db.delete(meetingNotes).where(eq(meetingNotes.id, noteId))
}

export { tasks as _tasksTable }

/* ------------------------------------------------------------------ */
/* pickers                                                              */
/* ------------------------------------------------------------------ */

export type ProjectOption = Party & { clientId: string }

/** Clients and open projects for the paste form, the target picker, the time card. */
export async function targetOptions(): Promise<{ clients: Party[]; projects: ProjectOption[] }> {
  const [clientRows, projectRows] = await Promise.all([
    db.query.clients.findMany({ columns: { id: true, name: true, slug: true, status: true }, orderBy: [asc(clients.name)] }),
    db.query.projects.findMany({ columns: { id: true, name: true, slug: true, clientId: true, status: true }, orderBy: [asc(projects.name)] }),
  ])
  return {
    clients: clientRows.map((c) => ({ id: c.id, name: c.name, slug: c.slug })),
    projects: projectRows
      .filter((p) => p.status !== "complete")
      .map((p) => ({ id: p.id, name: p.name, slug: p.slug, clientId: p.clientId })),
  }
}
