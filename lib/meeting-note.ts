import { z } from "zod"

/**
 * The pure half of meeting notes — statuses and their transitions, the
 * transcript shapes and parsers, the analysis contract, the fallbacks and
 * the maths. No db import: the note page's client components read from here,
 * and `scripts/check-meeting-notes.ts` proves it without a database.
 *
 * "Meetings" already means calendar events proposed as time entries in this
 * app (`lib/meetings.ts`, `time_entries.source = 'meeting'`, the review tab).
 * Everything here is a meeting NOTE — `meeting_notes`, `/meeting-notes` — and
 * the punch a recording opens has `source = 'recorder'`, never `meeting`, so a
 * grep for either never returns the other.
 */

/* ------------------------------------------------------------------ */
/* lifecycle                                                            */
/* ------------------------------------------------------------------ */

export const NOTE_STATUSES = [
  "requested",
  "recording",
  "stopping",
  "recorded",
  "review",
  "filed",
  "discarded",
  "failed",
] as const
export type NoteStatus = (typeof NOTE_STATUSES)[number]

/** While one of these is on, the Mac owns the row and nothing else may start. */
export const LIVE_STATUSES: readonly NoteStatus[] = ["requested", "recording", "stopping"]

export const STAGE_STATUSES = ["pending", "queued", "running", "done", "failed"] as const
export type StageStatus = (typeof STAGE_STATUSES)[number]

export const NOTE_SOURCES = ["live", "import", "paste"] as const
export type NoteSource = (typeof NOTE_SOURCES)[number]

export const ITEM_KINDS = ["task", "event", "decision", "question", "note"] as const
export type ItemKind = (typeof ITEM_KINDS)[number]

export const ITEM_STATES = ["proposed", "accepted", "dismissed"] as const
export type ItemState = (typeof ITEM_STATES)[number]

/** Kinds that can be filed somewhere. Decisions and questions are read, not filed. */
export const FILABLE_KINDS: readonly ItemKind[] = ["task", "event"]

const TRANSITIONS: Record<NoteStatus, readonly NoteStatus[]> = {
  requested: ["recording", "discarded", "failed"],
  recording: ["stopping", "recorded", "discarded", "failed"],
  stopping: ["recorded", "discarded", "failed"],
  recorded: ["review", "discarded", "failed"],
  review: ["filed", "discarded"],
  filed: ["discarded"],
  failed: ["discarded"],
  discarded: [],
}

export function canTransition(from: NoteStatus, to: NoteStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false
}

export function isLive(status: string): boolean {
  return (LIVE_STATUSES as readonly string[]).includes(status)
}

export function isNoteStatus(value: unknown): value is NoteStatus {
  return typeof value === "string" && (NOTE_STATUSES as readonly string[]).includes(value)
}

/** A `requested` row nobody claimed in this long failed — the meeting is over. */
export const STALE_REQUEST_MS = 90_000
/** A recording whose heartbeat is older than this lost its recorder. */
export const HEARTBEAT_LOST_MS = 60_000
/** A transcription running longer than this is presumed dead and requeued. */
export const TRANSCRIPT_STUCK_MS = 30 * 60_000
export const MAX_TRANSCRIPT_ATTEMPTS = 3
/** The panel gives up on "Starting…" and says nobody is recording after this. */
export const STRANDED_AFTER_MS = 20_000

/** Segment-level JSON for a two-hour meeting is a few hundred KB; this is the ceiling. */
export const MAX_TRANSCRIPT_BYTES = 4_000_000
export const MAX_SEGMENTS = 20_000
/** A pasted transcript rides a server action, which Next caps at 1 MB. */
export const MAX_PASTE_CHARS = 900_000

export type NoteFacts = {
  status: NoteStatus | string
  transcriptStatus: StageStatus | string
  analysisStatus: StageStatus | string
}

/** One label for the row: what the note is doing right now. */
export function phaseLabel(note: NoteFacts): string {
  switch (note.status) {
    case "requested":
      return "Starting"
    case "recording":
      return "Recording"
    case "stopping":
      return "Finishing"
    case "recorded":
      if (note.transcriptStatus === "failed") return "Transcription failed"
      if (note.transcriptStatus === "done") {
        return note.analysisStatus === "failed" ? "Notes failed" : "Writing notes"
      }
      return "Transcribing"
    case "review":
      if (note.analysisStatus === "running" || note.analysisStatus === "queued") return "Writing notes"
      if (note.analysisStatus === "failed") return "Needs review · notes failed"
      return "Needs review"
    case "filed":
      return "Filed"
    case "discarded":
      return "Discarded"
    case "failed":
      return "Failed"
    default:
      return note.status
  }
}

export type PhaseTone = "rec" | "warn" | "good" | "bad" | "muted" | "teal"

export function phaseTone(note: NoteFacts): PhaseTone {
  if (note.status === "recording") return "rec"
  if (note.status === "requested" || note.status === "stopping") return "warn"
  if (note.status === "recorded") return note.transcriptStatus === "failed" ? "bad" : "teal"
  if (note.status === "review") return note.analysisStatus === "failed" ? "bad" : "warn"
  if (note.status === "filed") return "good"
  if (note.status === "failed") return "bad"
  return "muted"
}

/** The list's bands, in the order they are drawn. */
export type Band = "progress" | "review" | "filed" | "failed" | "discarded"
export const BANDS: { key: Band; title: string }[] = [
  { key: "progress", title: "In progress" },
  { key: "review", title: "Needs review" },
  { key: "filed", title: "Filed" },
  { key: "failed", title: "Failed" },
  { key: "discarded", title: "Discarded" },
]

export function bandOf(note: NoteFacts): Band {
  switch (note.status) {
    case "requested":
    case "recording":
    case "stopping":
    case "recorded":
      return note.transcriptStatus === "failed" ? "failed" : "progress"
    case "review":
      return "review"
    case "filed":
      return "filed"
    case "discarded":
      return "discarded"
    default:
      return "failed"
  }
}

/** The five steps the note page draws, with what each one is doing. */
export type PhaseStep = {
  key: "recorded" | "transcribed" | "notes" | "review" | "filed"
  label: string
  state: "done" | "now" | "todo" | "failed"
}

export function phaseSteps(note: NoteFacts & { source: string }): PhaseStep[] {
  const s = note.status
  const recorded: PhaseStep["state"] =
    s === "requested" ? "todo" : s === "recording" || s === "stopping" ? "now" : s === "failed" ? "failed" : "done"
  const transcribed: PhaseStep["state"] =
    note.transcriptStatus === "done"
      ? "done"
      : note.transcriptStatus === "failed"
        ? "failed"
        : recorded === "done" && (note.transcriptStatus === "queued" || note.transcriptStatus === "running")
          ? "now"
          : "todo"
  const notes: PhaseStep["state"] =
    note.analysisStatus === "done"
      ? "done"
      : note.analysisStatus === "failed"
        ? "failed"
        : transcribed === "done"
          ? "now"
          : "todo"
  const review: PhaseStep["state"] =
    s === "filed" ? "done" : s === "review" && (notes === "done" || notes === "failed") ? "now" : "todo"
  const filed: PhaseStep["state"] = s === "filed" ? "done" : "todo"
  return [
    { key: "recorded", label: note.source === "live" ? "Recorded" : note.source === "import" ? "Imported" : "Pasted", state: recorded },
    { key: "transcribed", label: "Transcribed", state: transcribed },
    { key: "notes", label: "Notes written", state: notes },
    { key: "review", label: "Review", state: review },
    { key: "filed", label: "Filed", state: filed },
  ]
}

/* ------------------------------------------------------------------ */
/* transcript                                                           */
/* ------------------------------------------------------------------ */

/**
 * One line of the transcript. Times are seconds into the recording; a
 * pasted transcript without timestamps carries null.
 */
export type TranscriptSegment = {
  i: number
  start: number | null
  end: number | null
  speaker: string
  text: string
}

/** What the helper measures each second — shown as two dots on the band. */
export type MeetingLevels = { at: string; mic: number; sys: number | null }

export type MeetingAnalysis = {
  attendees: { name: string; role: string }[]
  topics: { title: string; detail: string }[]
  decisions: string[]
  questions: string[]
}

export const EMPTY_ANALYSIS: MeetingAnalysis = { attendees: [], topics: [], decisions: [], questions: [] }

/** The two tracks the helper writes, and what they are called until renamed. */
export const SPEAKER_MIC = "Karol"
export const SPEAKER_SYSTEM = "Others"

export function speakerLabel(names: Record<string, string> | null | undefined, speaker: string): string {
  const custom = names?.[speaker]
  return custom && custom.trim() ? custom.trim() : speaker
}

export function formatClock(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "—"
  const whole = Math.floor(seconds)
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

/** Hours to two decimals, the timesheet's rule — no rounding increment. */
export function hoursFromSeconds(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100
}

export type RawSegment = { start: number; end: number; text: string }

/** Words, lowercased, punctuation stripped. No `u` flag: the repo targets ES5 and Polish letters are not punctuation anyway. */
function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[\s.,;:!?"'()\[\]{}<>«»„“”…—–-]+/)
      .filter((t) => t.length >= 2)
  )
}

/**
 * A mic segment whose words also appear in a system segment close in time is
 * the far side leaking through the speakers, not Karol talking — drop it.
 * Threshold is the share of the mic segment's words found in the system one.
 */
export function dropBleed(
  segments: TranscriptSegment[],
  opts: { windowSec?: number; overlap?: number } = {}
): TranscriptSegment[] {
  const windowSec = opts.windowSec ?? 4
  const overlap = opts.overlap ?? 0.8
  const system = segments.filter((s) => s.speaker === SPEAKER_SYSTEM && s.start != null)
  return segments.filter((seg) => {
    if (seg.speaker !== SPEAKER_MIC || seg.start == null) return true
    const mine = tokens(seg.text)
    if (mine.size < 3) return true
    for (const other of system) {
      if (Math.abs((other.start ?? 0) - seg.start) > windowSec) continue
      const theirs = tokens(other.text)
      let hits = 0
      // forEach, not for…of: the ES5 target downlevels for…of into an
      // indexed loop that walks a Set zero times, silently.
      mine.forEach((t) => {
        if (theirs.has(t)) hits += 1
      })
      if (hits / mine.size >= overlap) return false
    }
    return true
  })
}

/** Two whisper tracks into one conversation, ordered by time, bleed removed, re-indexed. */
export function mergeTracks(
  mic: RawSegment[],
  system: RawSegment[],
  opts: { bleed?: boolean } = {}
): TranscriptSegment[] {
  const tag = (rows: RawSegment[], speaker: string): TranscriptSegment[] =>
    rows
      .filter((r) => r.text.trim())
      .map((r) => ({ i: 0, start: r.start, end: r.end, speaker, text: r.text.trim() }))
  const merged = [...tag(mic, SPEAKER_MIC), ...tag(system, SPEAKER_SYSTEM)].sort(
    (a, b) => (a.start ?? 0) - (b.start ?? 0) || (a.end ?? 0) - (b.end ?? 0)
  )
  const kept = opts.bleed === false ? merged : dropBleed(merged)
  return reindex(kept)
}

export function reindex(segments: TranscriptSegment[]): TranscriptSegment[] {
  return segments.map((s, i) => ({ ...s, i }))
}

/** The plain-text twin of the segments — what search and copy read. */
export function transcriptText(
  segments: TranscriptSegment[],
  names: Record<string, string> | null = null
): string {
  return segments
    .map((s) => {
      const time = s.start != null ? `[${formatClock(s.start)}] ` : ""
      const who = s.speaker ? `${speakerLabel(names, s.speaker)}: ` : ""
      return `${time}${who}${s.text}`
    })
    .join("\n")
}

/* ---- parsing what people paste or import ---- */

const CUE_TIME = /(\d{1,2}:)?(\d{1,2}):(\d{2})[.,](\d{1,3})/
const CUE_LINE = /^\s*(?:(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*(?:(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3})/
const SPEAKER_LINE = /^\s*(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s*[-–—]?\s*)?([^\n:]{1,48}?):\s+(.+)$/

function cueSeconds(raw: string): number | null {
  const m = CUE_TIME.exec(raw)
  if (!m) return null
  const h = m[1] ? Number(m[1].slice(0, -1)) : 0
  const ms = Number((m[4] ?? "0").padEnd(3, "0"))
  return h * 3600 + Number(m[2]) * 60 + Number(m[3]) + ms / 1000
}

function stampSeconds(raw: string | undefined): number | null {
  if (!raw) return null
  const parts = raw.split(":").map(Number)
  if (parts.some((n) => Number.isNaN(n))) return null
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]
}

function stripTags(text: string): { speaker: string; text: string } {
  const voice = /<v\s+([^>]+)>/.exec(text)
  const speaker = voice ? voice[1].trim() : ""
  return { speaker, text: text.replace(/<[^>]+>/g, "").trim() }
}

export type ParsedTranscript = {
  format: "vtt" | "srt" | "speakers" | "plain"
  segments: TranscriptSegment[]
  speakers: string[]
}

/**
 * VTT and SRT from Zoom, Teams or Whisper; "Name: line" transcripts with or
 * without a leading [mm:ss]; or plain paragraphs. Consecutive duplicate lines
 * (what autogenerated captions emit) collapse to one.
 */
export function parseTranscript(input: string): ParsedTranscript {
  const text = input.replace(/\r\n?/g, "\n").replace(/^﻿/, "").trim()
  if (!text) return { format: "plain", segments: [], speakers: [] }

  const lines = text.split("\n")
  const isVtt = /^WEBVTT/i.test(lines[0] ?? "")
  const hasCues = lines.some((l) => CUE_LINE.test(l))

  let segments: TranscriptSegment[] = []
  let format: ParsedTranscript["format"] = "plain"

  if (isVtt || hasCues) {
    format = isVtt ? "vtt" : "srt"
    let current: { start: number | null; end: number | null; lines: string[] } | null = null
    const flush = () => {
      if (!current) return
      const joined = current.lines.join(" ").trim()
      if (joined) {
        const { speaker, text: body } = stripTags(joined)
        const named = !speaker ? SPEAKER_LINE.exec(body) : null
        segments.push({
          i: 0,
          start: current.start,
          end: current.end,
          speaker: speaker || (named ? named[2].trim() : ""),
          text: speaker ? body : named ? named[3].trim() : body,
        })
      }
      current = null
    }
    for (const line of lines) {
      if (/^WEBVTT/i.test(line) || /^(NOTE|STYLE|REGION|Kind:|Language:|X-TIMESTAMP-MAP)/.test(line)) continue
      if (CUE_LINE.test(line)) {
        flush()
        const [a, b] = line.split("-->")
        current = { start: cueSeconds(a), end: cueSeconds(b), lines: [] }
        continue
      }
      if (!line.trim()) {
        flush()
        continue
      }
      if (/^\d+$/.test(line.trim()) && !current) continue // SRT cue number
      if (current) current.lines.push(line.trim())
    }
    flush()
  } else {
    const speakerHits = lines.filter((l) => SPEAKER_LINE.test(l)).length
    const nonEmpty = lines.filter((l) => l.trim()).length
    if (nonEmpty > 0 && speakerHits / nonEmpty >= 0.5) {
      format = "speakers"
      for (const line of lines) {
        if (!line.trim()) continue
        const m = SPEAKER_LINE.exec(line)
        if (m) {
          segments.push({ i: 0, start: stampSeconds(m[1]), end: null, speaker: m[2].trim(), text: m[3].trim() })
        } else if (segments.length) {
          segments[segments.length - 1].text += ` ${line.trim()}`
        } else {
          segments.push({ i: 0, start: null, end: null, speaker: "", text: line.trim() })
        }
      }
    } else {
      format = "plain"
      for (const para of text.split(/\n{2,}|\n/)) {
        const body = para.trim()
        if (body) segments.push({ i: 0, start: null, end: null, speaker: "", text: body })
      }
    }
  }

  // Autogenerated captions repeat the line they are still building.
  const deduped: TranscriptSegment[] = []
  for (const seg of segments) {
    const prev = deduped[deduped.length - 1]
    if (prev && prev.text === seg.text && prev.speaker === seg.speaker) {
      prev.end = seg.end ?? prev.end
      continue
    }
    deduped.push(seg)
  }
  const out = reindex(deduped.slice(0, MAX_SEGMENTS))
  const speakers = Array.from(new Set(out.map((s) => s.speaker).filter(Boolean)))
  return { format, segments: out, speakers }
}

/** The wire shape the worker posts, checked before it touches a row. */
export function parseSegments(raw: unknown): TranscriptSegment[] | { error: string } {
  if (!Array.isArray(raw)) return { error: "`segments` must be an array." }
  if (raw.length > MAX_SEGMENTS) return { error: `At most ${MAX_SEGMENTS} segments.` }
  const out: TranscriptSegment[] = []
  for (const row of raw) {
    if (!row || typeof row !== "object") return { error: "Every segment must be an object." }
    const r = row as Record<string, unknown>
    const text = typeof r.text === "string" ? r.text.trim() : ""
    if (!text) continue
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null)
    out.push({
      i: 0,
      start: num(r.start),
      end: num(r.end),
      speaker: typeof r.speaker === "string" ? r.speaker.trim().slice(0, 80) : "",
      text: text.slice(0, 4000),
    })
  }
  return reindex(out)
}

/* ------------------------------------------------------------------ */
/* analysis contract                                                    */
/* ------------------------------------------------------------------ */

/**
 * What the model returns. Kept to the JSON-schema subset structured outputs
 * accept — no patterns, no length bounds — and clipped afterwards by
 * `sanitizeAnalysis()`, which is also where a wrong segment index becomes -1.
 */
export const AnalysisItemSchema = z.object({
  kind: z.enum(["task", "event", "decision", "question"]),
  title: z.string(),
  detail: z.string(),
  quote: z.string(),
  segmentIndex: z.number().int(),
  owner: z.string(),
  dueOn: z.string().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  confidence: z.enum(["high", "medium"]),
})

export const AnalysisSchema = z.object({
  title: z.string(),
  summary: z.string(),
  attendees: z.array(z.object({ name: z.string(), role: z.string() })),
  topics: z.array(z.object({ title: z.string(), detail: z.string() })),
  decisions: z.array(z.string()),
  questions: z.array(z.string()),
  items: z.array(AnalysisItemSchema),
})

export type Analysis = z.infer<typeof AnalysisSchema>
export type AnalysisItem = z.infer<typeof AnalysisItemSchema>

export const DAY = /^\d{4}-\d{2}-\d{2}$/
export const WALL_CLOCK = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.trim().slice(0, n) : "")

export function sanitizeAnalysis(raw: Analysis, segmentCount: number): Analysis {
  const seen = new Set<string>()
  const items: AnalysisItem[] = []
  for (const item of raw.items ?? []) {
    const title = clip(item.title, 160)
    if (!title) continue
    const key = `${item.kind}|${title.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const idx = Number.isInteger(item.segmentIndex) && item.segmentIndex >= 0 && item.segmentIndex < segmentCount ? item.segmentIndex : -1
    const startsAt = item.startsAt && (WALL_CLOCK.test(item.startsAt) || DAY.test(item.startsAt)) ? item.startsAt : null
    const endsAt =
      item.endsAt && startsAt && (WALL_CLOCK.test(item.endsAt) || DAY.test(item.endsAt)) && item.endsAt >= startsAt
        ? item.endsAt
        : null
    items.push({
      kind: item.kind,
      title,
      detail: clip(item.detail, 600),
      quote: clip(item.quote, 400),
      segmentIndex: idx,
      owner: clip(item.owner, 80),
      dueOn: item.dueOn && DAY.test(item.dueOn) ? item.dueOn : null,
      startsAt,
      endsAt,
      confidence: item.confidence === "medium" ? "medium" : "high",
    })
    if (items.length >= 40) break
  }
  return {
    title: clip(raw.title, 120),
    summary: clip(raw.summary, 1400),
    attendees: (raw.attendees ?? [])
      .map((a) => ({ name: clip(a.name, 80), role: clip(a.role, 80) }))
      .filter((a) => a.name)
      .slice(0, 12),
    topics: (raw.topics ?? [])
      .map((t) => ({ title: clip(t.title, 80), detail: clip(t.detail, 400) }))
      .filter((t) => t.title)
      .slice(0, 8),
    decisions: (raw.decisions ?? []).map((d) => clip(d, 300)).filter(Boolean).slice(0, 12),
    questions: (raw.questions ?? []).map((q) => clip(q, 300)).filter(Boolean).slice(0, 12),
    items,
  }
}

/** Numbered lines the model quotes from — `[i] (Karol, 12:04) text`. */
export function numberedTranscript(
  segments: TranscriptSegment[],
  names: Record<string, string> | null = null
): string {
  return segments
    .map((s) => {
      const who = s.speaker ? speakerLabel(names, s.speaker) : "?"
      const at = s.start != null ? `, ${formatClock(s.start)}` : ""
      return `[${s.i}] (${who}${at}) ${s.text}`
    })
    .join("\n")
}

/**
 * When the model cannot write the notes, the note still gets a title and a
 * summary that says so — a blank is never the outcome.
 */
export function mechanicalFallback(input: {
  clientName?: string | null
  calendarTitle?: string | null
  dayLabel: string
  segments: TranscriptSegment[]
  error?: string
}): { title: string; summary: string } {
  const title =
    (input.calendarTitle ?? "").trim() ||
    `${(input.clientName ?? "").trim() || "Meeting"} · ${input.dayLabel}`
  const opening = input.segments
    .slice(0, 6)
    .map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text))
    .join(" ")
    .slice(0, 600)
  const why = input.error ? ` (${input.error.slice(0, 160)})` : ""
  const summary = opening
    ? `The notes could not be written automatically${why}. Use Analyze again, or read the transcript. It opens: ${opening}`
    : `The notes could not be written automatically${why}, and the transcript is empty.`
  return { title: title.slice(0, 120), summary }
}

/* ------------------------------------------------------------------ */
/* filing                                                               */
/* ------------------------------------------------------------------ */

export type ItemFacts = {
  kind: ItemKind | string
  title: string
  detail: string
  quote: string
  segmentStart: number | null
  owner: string
  dueOn: string | null
  startsAt: string
  endsAt: string
  timeZone: string
}

export type NoteContext = { title: string; url: string; clientName: string | null; dayLabel: string }

export const TASK_SOURCE = "meeting_note"
export const ITEM_REF_KIND = "meeting_note_item"
export const TASK_LABEL = "meeting note"

/** What a task made from an item carries, so the board tells where it came from. */
export function itemToTaskInput(item: ItemFacts, note: NoteContext) {
  const parts: string[] = []
  if (item.detail.trim()) parts.push(item.detail.trim())
  if (item.owner.trim()) parts.push(`Owner: ${item.owner.trim()}`)
  if (item.quote.trim()) {
    const at = item.segmentStart != null ? ` — ${formatClock(item.segmentStart)}` : ""
    parts.push(`“${item.quote.trim()}”${at}`)
  }
  parts.push(`From the meeting note “${note.title}” (${note.dayLabel}): ${note.url}`)
  return {
    title: item.title.trim().slice(0, 300),
    dueOn: item.dueOn && DAY.test(item.dueOn) ? item.dueOn : null,
    notes: parts.join("\n\n").slice(0, 4000),
    labels: [TASK_LABEL],
    priority: 2,
  }
}

/** What a calendar event made from an item carries — never an attendee. */
export function itemToEventInput(
  item: ItemFacts,
  note: NoteContext
): { title: string; startsAt: string; endsAt?: string; timeZone: string; description: string } | { error: string } {
  const startsAt = item.startsAt.trim()
  if (!startsAt) return { error: "Give the event a start before filing it." }
  if (!WALL_CLOCK.test(startsAt) && !DAY.test(startsAt)) {
    return { error: "The start must be a day (YYYY-MM-DD) or a wall-clock time (YYYY-MM-DDTHH:mm)." }
  }
  const endsAt = item.endsAt.trim()
  if (endsAt && !WALL_CLOCK.test(endsAt) && !DAY.test(endsAt)) {
    return { error: "The end must be a day or a wall-clock time, like the start." }
  }
  if (endsAt && endsAt < startsAt) return { error: "The end has to come after the start." }
  const description = [
    item.detail.trim(),
    item.quote.trim() ? `“${item.quote.trim()}”` : "",
    `From the meeting note “${note.title}” (${note.dayLabel}): ${note.url}`,
  ]
    .filter(Boolean)
    .join("\n\n")
  return {
    title: item.title.trim().slice(0, 300),
    startsAt,
    ...(endsAt ? { endsAt } : {}),
    timeZone: item.timeZone || "UTC",
    description,
  }
}

/** Half an hour after a timed start, for an event the model gave no end. */
export function defaultEventEnd(startsAt: string): string {
  if (!WALL_CLOCK.test(startsAt)) return ""
  const fake = new Date(`${startsAt}:00Z`)
  fake.setUTCMinutes(fake.getUTCMinutes() + 30)
  return fake.toISOString().slice(0, 16)
}

/* ------------------------------------------------------------------ */
/* the helper's level lines                                             */
/* ------------------------------------------------------------------ */

export function parseLevels(raw: unknown, now = new Date()): MeetingLevels | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const clamp = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null
  const mic = clamp(r.mic)
  if (mic == null) return null
  return { at: now.toISOString(), mic, sys: clamp(r.sys) }
}

/** Four bars, like a phone's signal: how many light up for an RMS level. */
export function levelBars(level: number | null | undefined): number {
  if (level == null) return 0
  if (level < 0.004) return 0
  if (level < 0.02) return 1
  if (level < 0.06) return 2
  if (level < 0.15) return 3
  return 4
}

/* ------------------------------------------------------------------ */
/* labels in a zone                                                     */
/* ------------------------------------------------------------------ */

function asDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const d = value instanceof Date ? value : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** "Tue, Sep 9" in the given zone. */
export function formatDayLabel(value: Date | string | null | undefined, timeZone: string): string {
  const d = asDate(value)
  if (!d) return ""
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", weekday: "short", month: "short", day: "numeric" }).format(d)
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/** "2:00 PM" in the given zone. */
export function formatTimeLabel(value: Date | string | null | undefined, timeZone: string): string {
  const d = asDate(value)
  if (!d) return ""
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: timeZone || "UTC", hour: "numeric", minute: "2-digit" }).format(d)
  } catch {
    return d.toISOString().slice(11, 16)
  }
}

/** "Tue, Sep 9, 2026 at 2:00 PM (America/New_York)" — what the model resolves dates against. */
export function formatMeetingMoment(value: Date | string | null | undefined, timeZone: string): string {
  const d = asDate(value)
  if (!d) return "unknown"
  try {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "UTC",
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(d)
    return `${s} (${timeZone || "UTC"})`
  } catch {
    return d.toISOString()
  }
}

/** The YYYY-MM-DD a moment falls on in a zone — the day a "by Friday" is counted from. */
export function dayIn(value: Date | string, timeZone: string): string {
  const d = asDate(value) ?? new Date()
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d)
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
    return `${get("year")}-${get("month")}-${get("day")}`
  } catch {
    return d.toISOString().slice(0, 10)
  }
}

/** The first line of the summary, clipped — the punch's entry text. */
export function summaryLine(summary: string, title: string): string {
  const first = summary.split(/\n+/).map((l) => l.trim()).find(Boolean) ?? ""
  return (first || title).slice(0, 300)
}
