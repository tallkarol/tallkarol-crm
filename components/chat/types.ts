import type { AttachmentView } from "@/lib/chat/attachments"
import type { ReplyActionContext } from "@/lib/chat/reply-actions"
import type { ChatToolCall, ChatTurn } from "@/db/schema"

export type ChatMessageView = {
  id: string
  role: "user" | "assistant" | "tool" | "system"
  agent: string
  body: string
  createdAt: string
  turnId: string | null
  /** The thread the reply sits in — enough to grow a Mark-done button. */
  actionsContext: ReplyActionContext
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
  /** Screenshots sent with the message, in paste order. */
  attachments: AttachmentView[]
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

