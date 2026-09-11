import type { ChatToolCall, ChatTurn } from "@/db/schema"

export type ChatMessageView = {
  id: string
  role: "user" | "assistant" | "tool" | "system"
  agent: string
  body: string
  createdAt: string
  turnId: string | null
  /**
   * Turns hang off the USER message they answer — an escalation chain has
   * one question and several attempts. An assistant message carries the
   * chain that produced it, so the ladder footnote sits under the reply;
   * a user message carries its chain so a question that failed outright can
   * still say so.
   */
  chain: ChatTurn[]
  calls: ChatToolCall[]
  /** What Karol said about this reply, if anything. */
  feedback: { kind: "down" | "example" | "note"; note: string }[]
}

/** A turn somebody is still running, for the thinking row. */
export type PendingView = {
  model: string
  claimedBy: string
  /** When it was started, claimed, or queued — whichever is latest. */
  since: string
  status: "queued" | "claimed" | "running"
}

export type ThreadStats = {
  turns: number
  cents: number
  /** "Composer 2.5 → Fable 5.1 Max", or the one model used. */
  chain: string
}

export type ThreadRow = {
  id: string
  title: string
  /** The desk the thread is addressed to, or "". */
  agent: string
  lastMessageAt: string
  /** A write is parked for Karol in this thread. */
  needsYou: boolean
  /** Stamped out of the main list; lives in the Archived group until restored. */
  archived: boolean
}

export type BudgetView = {
  /** "September" */
  period: string
  other: {
    spentCents: number
    limitCents: number
    reserveCents: number
    fraction: number
    level: "ok" | "alert" | "warn" | "cutoff"
    cutoff: boolean
    routineExhausted: boolean
  }
  cursor: { spentCents: number; turns: number }
}
