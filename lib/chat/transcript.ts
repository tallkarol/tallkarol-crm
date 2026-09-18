import { imageNote } from "@/lib/chat/attachments"

/**
 * The conversation as the model reads it.
 *
 * PURE: the queue route shapes the rows, the worker renders them, and the
 * check scripts exercise both — so nothing here may touch the database or
 * the network. What the model is told about a thread is decided in one
 * place, and the CRM and the Mac cannot drift apart on it.
 */

/** What a tool call in an earlier turn looks like to the next turn. */
export type TranscriptCall = {
  name: string
  /** pending | approved | rejected | ran | failed | skipped */
  status: string
  mutating: boolean
  /** The preview's title, when the write had one — "Task preview". */
  title?: string
  /** A short rendering of the result: ids and titles, never the whole payload. */
  result?: string
  error?: string
}

export type TranscriptMessage = {
  role: string
  agent: string
  body: string
  at: string
  images?: { id: string }[]
  calls?: TranscriptCall[]
}

/** How many messages a claim carries — the NEWEST this many, oldest first. */
export const CLAIM_MESSAGES = 60

/** Keys worth repeating back to the model from a write's result; the rest is noise. */
const RESULT_KEYS = [
  "taskId",
  "timeEntryId",
  "ticketId",
  "id",
  "url",
  "title",
  "hours",
  "occurredOn",
  "refreshed",
  "replayed",
  "file",
  "commit",
  "threadId",
  "count",
  "total",
]

/**
 * A result, boiled down to what a follow-up needs — "taskId 4f1c…, title Call
 * DQS". Capped hard: a search result can run to 47 KB, and the point of the
 * note is continuity, not a replay.
 */
export function resultSummary(result: unknown, max = 160): string {
  if (result == null) return ""
  if (typeof result !== "object") return String(result).slice(0, max)
  const r = result as Record<string, unknown>
  const parts: string[] = []
  for (const key of RESULT_KEYS) {
    const value = r[key]
    if (value == null || typeof value === "object") continue
    const text = typeof value === "string" ? value : String(value)
    parts.push(`${key} ${key.endsWith("Id") || key === "id" ? text.slice(0, 8) : text.slice(0, 60)}`)
    if (parts.join(", ").length > max) break
  }
  return parts.join(", ").slice(0, max)
}

/** One row of chat_tool_calls, as the claim carries it. */
export function callSummary(call: {
  name: string
  status: string
  mutating: boolean
  preview?: unknown
  result?: unknown
  error?: string | null
}): TranscriptCall {
  const preview = call.preview && typeof call.preview === "object" ? (call.preview as { title?: unknown }) : null
  const out: TranscriptCall = { name: call.name, status: call.status, mutating: call.mutating }
  if (preview && typeof preview.title === "string" && preview.title) out.title = preview.title
  if (call.status === "ran" || call.status === "approved") {
    const summary = resultSummary(call.result)
    if (summary) out.result = summary
  }
  if (call.error) out.error = call.error.slice(0, 160)
  return out
}

/** What a status means to the model, in one word it will not misread. */
function statusWord(call: TranscriptCall): string {
  if (!call.mutating) return call.status === "failed" ? "failed" : "read"
  switch (call.status) {
    case "ran":
      return "CONFIRMED by Karol and written"
    case "approved":
      return "approved, the Mac is writing it"
    case "rejected":
      return "DISCARDED by Karol — do not propose it again unless asked"
    case "skipped":
      return "skipped (never decided)"
    case "failed":
      return "failed"
    default:
      return "still waiting for Karol"
  }
}

/**
 * The line under a reply that says what its tool calls came to. Reads are
 * summarised as a count; every write is named with its outcome, so the next
 * turn knows a task was filed (or discarded) instead of proposing it twice.
 */
export function callsNote(calls: TranscriptCall[] | undefined): string {
  if (!calls || calls.length === 0) return ""
  const reads = calls.filter((c) => !c.mutating)
  const writes = calls.filter((c) => c.mutating)
  const parts: string[] = []
  if (reads.length > 0) {
    const failed = reads.filter((c) => c.status === "failed").length
    parts.push(`${reads.length} read${reads.length === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`)
  }
  for (const w of writes) {
    const what = w.title ? `${w.name} (${w.title})` : w.name
    const tail = w.result ? ` → ${w.result}` : w.error ? ` → ${w.error}` : ""
    parts.push(`${what}: ${statusWord(w)}${tail}`)
  }
  return `[did: ${parts.join("; ")}]`
}

/**
 * Who a line is from. Karol's own rows are "Karol:"; a row a desk handed
 * over (route_to's brief, a scheduled line) is stored with role user under
 * the desk's name, and must not be replayed as Karol's authority.
 */
export function speaker(message: { role: string; agent: string }): string {
  if (message.role === "assistant") return "You"
  const agent = (message.agent || "").trim()
  if (!agent || agent === "Karol") return "Karol"
  return `${agent} (handed over — not Karol)`
}

/**
 * The transcript. `sent` is what `pickImages` chose for this turn, so each
 * message's image note numbers the pictures the model actually holds.
 */
export function transcriptText(messages: TranscriptMessage[], sent: string[]): string {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const said = [m.body, imageNote(m.images, sent), callsNote(m.calls)].filter(Boolean).join("\n")
      return `${speaker(m)}: ${said}`
    })
    .join("\n\n")
}
