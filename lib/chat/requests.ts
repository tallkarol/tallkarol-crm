import type { ChatToolCall, ChatTurn } from "@/db/schema"
import type { ChatMessageView, ThreadPulse, ThreadState } from "@/components/chat/types"
import { viaReplyAction } from "@/lib/chat/reply-actions"

/**
 * A thread, read as requests.
 *
 * PURE — the ledger and the queue both import this. The chat's unit of work
 * is not a message but a request: one line from Karol, the rungs it climbed,
 * what those rungs read and wrote, and the replies that came back. Grouping
 * the rows that way is what lets the page say "Needs you" over the line that
 * needs him, rather than somewhere below a bubble.
 */

export type RequestState = "queued" | "running" | "needs" | "failed" | "done"

export type RequestGroup = {
  key: string
  /** Karol's line. Null when a thread opens with a reply — a handoff, a digest. */
  ask: ChatMessageView | null
  replies: ChatMessageView[]
  /** Router notices and other system rows, in order. */
  notes: ChatMessageView[]
  turns: ChatTurn[]
  reads: ChatToolCall[]
  /** Writes that came from the model — reply-button clicks are their own record. */
  writes: ChatToolCall[]
  state: RequestState
  cents: number
  /** Time the finished rungs took, summed. A running rung counts itself. */
  ms: number
}

export function groupRequests(messages: ChatMessageView[]): RequestGroup[] {
  const groups: RequestGroup[] = []
  let current: RequestGroup | null = null

  const open = (ask: ChatMessageView | null, key: string) => {
    current = {
      key,
      ask,
      replies: [],
      notes: [],
      turns: [],
      reads: [],
      writes: [],
      state: "done",
      cents: 0,
      ms: 0,
    }
    groups.push(current)
    return current
  }

  for (const message of messages) {
    if (message.role === "tool") continue
    if (message.role === "user") {
      open(message, message.id)
      continue
    }
    const group = current ?? open(null, message.id)
    if (message.role === "system") group.notes.push(message)
    else group.replies.push(message)
  }

  for (const group of groups) {
    const turns = new Map<string, ChatTurn>()
    const calls = new Map<string, ChatToolCall>()
    const sources = group.ask ? [group.ask, ...group.replies] : group.replies
    for (const source of sources) {
      for (const turn of source.chain) turns.set(turn.id, turn)
      for (const call of source.calls) calls.set(call.id, call)
    }
    group.turns = Array.from(turns.values()).sort(byCreated)
    const all = Array.from(calls.values()).sort(byCreated)
    group.reads = all.filter((c) => !c.mutating)
    group.writes = all.filter((c) => c.mutating && !viaReplyAction(c.args))
    group.state = requestState(group.turns, group.writes)
    group.cents = group.turns.reduce((sum, t) => sum + Number(t.costCents), 0)
    group.ms = group.turns.reduce((sum, t) => sum + elapsed(t), 0)
  }

  return groups
}

export function requestState(turns: ChatTurn[], writes: ChatToolCall[]): RequestState {
  if (turns.some((t) => t.status === "claimed" || t.status === "running")) return "running"
  if (turns.some((t) => t.status === "queued")) return "queued"
  if (writes.some((c) => c.status === "pending")) return "needs"
  if (turns.length > 0 && turns.every((t) => t.status === "failed" || t.status === "cancelled")) {
    return "failed"
  }
  return "done"
}

/** How long a rung took: from when it started (or was claimed, or queued) to when it finished. */
export function elapsed(turn: ChatTurn): number {
  if (!turn.finishedAt) return 0
  const from = turn.startedAt ?? turn.claimedAt ?? turn.createdAt
  return Math.max(0, new Date(turn.finishedAt).getTime() - new Date(from).getTime())
}

/** The queue files a thread under its most urgent state; chronology is the fallback. */
export function threadState(pulse: ThreadPulse | undefined): ThreadState {
  if (!pulse) return "idle"
  if (pulse.live) return pulse.live.status === "queued" ? "queued" : "running"
  if (pulse.waiting) return "needs"
  return "idle"
}

function byCreated(a: { createdAt: Date | string }, b: { createdAt: Date | string }) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
}
