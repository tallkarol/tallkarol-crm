import { cursorHref } from "@/lib/leftoff"
import { parseWhen } from "@/lib/task-parse"

/**
 * Recommended next steps at the end of a reply, as buttons Karol can click.
 *
 * The model is asked to emit a ```crm-actions fence when Left for Karol (or
 * a desk close) names something the CRM can do. The same parser also reads
 * a few high-confidence phrases in that close — "mark the task when you're
 * happy", "file a follow-up", "remind me Friday" — so a reply that forgot
 * the fence still grows a button, and one that invented work does not.
 *
 * Only kinds the CRM can actually perform survive. A click is the approval;
 * the write lands through the same tools the chat already has.
 */

export const REPLY_ACTION_VIA = "reply-action"

export const CRM_ACTIONS_HINT = [
  "If the close of the reply recommends something the CRM can do — mark a task done, file a follow-up, put a reminder on the calendar, open a workspace — end with a ```crm-actions fence Karol can click. One action per line, only those kinds:",
  "  complete_task",
  '  create_task title="…" [clientSlug=…] [dueOn=YYYY-MM-DD] [notes=…]',
  "  create_calendar_event title=\"…\" startsAt=YYYY-MM-DD|+3d|fri [calendar=personal]",
  '  open_workspace path="/Users/…"',
  "Never invent work that is not in the reply. The fence is stripped from the prose he reads.",
].join("\n")

export type ReplyActionKind =
  | "complete_task"
  | "create_task"
  | "create_calendar_event"
  | "open_workspace"

export type ReplyActionContext = {
  threadId: string
  task: { id: string; title: string; status: string } | null
  clientSlug: string | null
}

export type SuggestedAction = {
  key: string
  kind: ReplyActionKind
  label: string
  detail?: string
  /** Arguments the matching chat tool accepts, plus `_via` / `_key`. */
  args: Record<string, string>
  /** A click navigates here instead of writing. */
  href?: string
}

export type ReplyActionCall = {
  name: string
  status: string
  args: unknown
}

const FENCE = /```(?:crm-)?actions[ \t]*\n([\s\S]*?)```/i
const KINDS = new Set<ReplyActionKind>([
  "complete_task",
  "create_task",
  "create_calendar_event",
  "open_workspace",
])

const MARK_TASK =
  /\b(mark(?:ing)? the task|mark it done|complete the task|tick the task|when you(?:'|’)?re (?:happy|ready)|when you(?:'|’)?re done)\b/i
const FILE_TASK =
  /\b(file|create|add|open)\b[^.!?\n]{0,40}\b(follow-?up|task|ticket)\b|\b(follow-?up|put (?:that|it|this) on the board)\b/i
const REMIND =
  /\b(remind(?:er)?|on the calendar|calendar (?:block|hold|invite)|put (?:it|that|this) on (?:the )?calendar)\b/i
const OPEN_WS =
  /\b(open (?:it |the )?(?:in )?cursor|open the (?:workspace|worktree|repo|checkout))\b/i
const OFFER = /\bsay if you want\b|\bif you want (?:those|that|them|me|it)\b/i

const PATH = /(?:^|[\s`"'=(])((?:~|\/Users\/)[/A-Za-z0-9._-]+)/
const ARG = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g

/** Pull the fence off the prose so Karol never sees the machine block. */
export function stripReplyActions(text: string): string {
  return text
    .replace(FENCE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

export function suggestedActions(
  text: string,
  context: ReplyActionContext,
  now = new Date()
): SuggestedAction[] {
  const fromFence = parseFence(text, context, now)
  const inferred = fromFence.length ? [] : inferActions(text, context, now)
  const out: SuggestedAction[] = []
  const seen = new Set<string>()
  for (const action of [...fromFence, ...inferred]) {
    const ready = finalize(action, context, text, now)
    if (!ready || seen.has(ready.key)) continue
    seen.add(ready.key)
    out.push(ready)
  }
  return out
}

export function actionDone(action: SuggestedAction, calls: ReplyActionCall[]): boolean {
  return calls.some((call) => {
    if (call.status !== "ran" && call.status !== "approved") return false
    if (viaKey(call.args) === action.key) return true
    if (call.name !== action.kind) return false
    if (action.kind === "complete_task") {
      return strArg(call.args, "taskId") === action.args.taskId
    }
    if (action.kind === "create_task") {
      return strArg(call.args, "title") === action.args.title
    }
    return false
  })
}

export function viaReplyAction(args: unknown): boolean {
  return strArg(args, "_via") === REPLY_ACTION_VIA
}

function viaKey(args: unknown): string | null {
  return strArg(args, "_key")
}

function strArg(args: unknown, key: string): string | null {
  if (!args || typeof args !== "object") return null
  const value = (args as Record<string, unknown>)[key]
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function parseFence(
  text: string,
  context: ReplyActionContext,
  now: Date
): SuggestedAction[] {
  const block = FENCE.exec(text)?.[1]
  if (!block) return []
  const out: SuggestedAction[] = []
  for (const raw of block.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const kind = line.split(/\s+/, 1)[0] as ReplyActionKind
    if (!KINDS.has(kind)) continue
    const args = parseArgs(line.slice(kind.length))
    out.push(draft(kind, args))
  }
  return out
}

function parseArgs(rest: string): Record<string, string> {
  const args: Record<string, string> = {}
  ARG.lastIndex = 0
  let hit: RegExpExecArray | null
  while ((hit = ARG.exec(rest))) {
    args[hit[1]] = hit[2] ?? hit[3] ?? hit[4] ?? ""
  }
  return args
}

function inferActions(
  text: string,
  context: ReplyActionContext,
  now: Date
): SuggestedAction[] {
  const close = inferenceText(text)
  if (!close) return []
  const out: SuggestedAction[] = []

  if (context.task && context.task.status !== "done" && MARK_TASK.test(close)) {
    out.push(draft("complete_task", { taskId: context.task.id }))
  }

  if (FILE_TASK.test(close)) {
    const title = clip(taskTitleFrom(close) || close, 80)
    if (title) out.push(draft("create_task", { title, notes: clip(close, 400) }))
  } else if (OFFER.test(close)) {
    const title = offerTitle(close)
    if (title) out.push(draft("create_task", { title, notes: clip(close, 400) }))
  }

  if (REMIND.test(close)) {
    const when = whenFrom(close, now) ?? parseWhen("tomorrow", now)?.on
    const title = clip(remindTitle(close) || context.task?.title || "Follow up", 80)
    if (title && when) {
      out.push(draft("create_calendar_event", { title, startsAt: when, calendar: "personal" }))
    }
  }

  if (OPEN_WS.test(close)) {
    const path = extractPath(text)
    if (path) out.push(draft("open_workspace", { path }))
  }

  return out
}

function draft(kind: ReplyActionKind, args: Record<string, string>): SuggestedAction {
  return { key: "", kind, label: "", args }
}

function finalize(
  action: SuggestedAction,
  context: ReplyActionContext,
  text: string,
  now: Date
): SuggestedAction | null {
  const args = { ...action.args }

  if (action.kind === "complete_task") {
    const taskId = args.taskId || context.task?.id
    if (!taskId || context.task?.status === "done") return null
    args.taskId = taskId
    return stamp(action.kind, "Mark task done", context.task?.title, args)
  }

  if (action.kind === "create_task") {
    const title = clip(args.title || "", 300)
    if (!title) return null
    args.title = title
    if (!args.clientSlug && context.clientSlug) args.clientSlug = context.clientSlug
    return stamp(action.kind, `File: ${clip(title, 48)}`, args.dueOn, args)
  }

  if (action.kind === "create_calendar_event") {
    const title = clip(args.title || context.task?.title || "", 300)
    const startsAt = resolveWhen(args.startsAt, now) ?? parseWhen("tomorrow", now)?.on
    if (!title || !startsAt) return null
    args.title = title
    args.startsAt = startsAt
    if (!args.calendar) args.calendar = "personal"
    return stamp(action.kind, `Remind: ${clip(title, 40)}`, startsAt, args)
  }

  if (action.kind === "open_workspace") {
    const path = expandHome(args.path || extractPath(text) || "")
    if (!path) return null
    const href = cursorHref(path)
    if (!href) return null
    args.path = path
    return stamp(action.kind, "Open in Cursor", path, args, href)
  }

  return null
}

function stamp(
  kind: ReplyActionKind,
  label: string,
  detail: string | undefined,
  args: Record<string, string>,
  href?: string
): SuggestedAction {
  const key = [
    kind,
    args.taskId ?? "",
    normalize(args.title ?? ""),
    args.startsAt ?? "",
    args.path ?? "",
  ].join(":")
  return {
    key,
    kind,
    label,
    detail: detail || undefined,
    args: { ...args, _via: REPLY_ACTION_VIA, _key: key },
    href,
  }
}

function inferenceText(text: string): string {
  const stripped = stripReplyActions(text)
  // Solver replies often bold the heading (`**Left for Karol**`), or put the
  // close on the same line after an em dash. Either way the buttons only
  // read what he was left — not Verified, not the rest of the thread.
  const headed =
    /(?:^|\n)#{0,3}[ \t]*\*{0,2}(?:Left for Karol|Questions for Karol)\*{0,2}(?:[ \t]*[—–:][ \t]*|[ \t]*\n+)([\s\S]+)/i.exec(
      stripped
    )
  if (headed) return headed[1].trim()
  const next = /(?:^|\n)Next:\s*(.+)/im.exec(stripped)
  if (next) return next[1].trim()
  if (stripped.length <= 800) return stripped
  return stripped.split(/\n{2,}/).at(-1)?.trim() ?? stripped
}

function offerTitle(section: string): string | null {
  const sentence =
    section
      .split(/(?<=[.!?])\s+/)
      .find((part) => OFFER.test(part))
      ?.replace(/\s+/g, " ")
      .trim() ?? ""
  if (!sentence) return null
  const before = sentence.split(/\s+[—–-]\s+(?:say if you want|if you want)/i)[0].trim()
  const cleaned = (before.length >= 12 ? before : sentence)
    .replace(/\bsay if you want(?: those| that| them| me to)?(?: too)?[.:]?\s*/gi, "")
    .trim()
  return cleaned ? clip(cleaned, 80) : null
}

function taskTitleFrom(section: string): string | null {
  const quoted = /[“"]([^”"]{8,80})[”"]/.exec(section)
  if (quoted) return quoted[1].trim()
  const named =
    /(?:file|create|add)\s+(?:a\s+)?(?:follow-?up|task)(?:\s+(?:for|to|about))?\s+([^.;\n]{8,80})/i.exec(
      section
    )
  return named?.[1]?.trim() ?? null
}

function remindTitle(section: string): string | null {
  const named =
    /remind(?: me)?(?: to)?\s+([^.;\n]{6,80})/i.exec(section) ??
    /(?:calendar|reminder)\s+(?:for|about|to)\s+([^.;\n]{6,80})/i.exec(section)
  return named?.[1]?.replace(/\s+on\s+\S+$/i, "").trim() ?? null
}

function whenFrom(section: string, now: Date): string | null {
  const tokens = section.match(
    /\b(\+?\d+\s*[dwm]|today|tomorrow|eow|eom|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:rs(?:day)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?|\d{4}-\d{2}-\d{2})\b/gi
  )
  if (!tokens) return null
  for (const token of tokens) {
    const on = resolveWhen(token, now)
    if (on) return on
  }
  return null
}

export function resolveWhen(raw: string | undefined, now = new Date()): string | null {
  if (!raw) return null
  const value = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(value)) return value
  return parseWhen(value.replace(/^\+/, "").replace(/\s+/g, ""), now)?.on ?? null
}

function extractPath(text: string): string | null {
  const hit = PATH.exec(text)
  return hit ? expandHome(hit[1].replace(/[.,;:)]+$/, "")) : null
}

function expandHome(path: string): string {
  if (!path.startsWith("~")) return path
  return `/Users/karolbuczek${path.slice(1)}`
}

function clip(value: string, max: number): string {
  const line = value.replace(/\s+/g, " ").trim()
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim()
}
