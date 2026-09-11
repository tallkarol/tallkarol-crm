import type { ChatMessageView, PendingView } from "@/components/chat/types"
import type { threadDetail } from "@/lib/chat/turns"

type Detail = NonNullable<Awaited<ReturnType<typeof threadDetail>>>

/**
 * A thread's rows, shaped for the Message component — the same shaping
 * `/chat` does, shared with the dock's panel so a reply reads identically in
 * both. Turns hang off the USER message they answer; an assistant message
 * carries the chain that produced it so the ladder footnote sits under the
 * reply; feedback rides on the reply it was about.
 */
export function messageViews(detail: Detail): ChatMessageView[] {
  const { messages, turns, calls, feedback } = detail
  return messages.map((message) => {
    const produced = message.turnId ? turns.find((t) => t.id === message.turnId) : null
    const chain =
      message.role === "user"
        ? turns.filter((t) => t.messageId === message.id)
        : produced
          ? turns.filter((t) => t.messageId === produced.messageId)
          : []
    return {
      id: message.id,
      role: message.role,
      agent: message.agent,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
      turnId: message.turnId,
      chain,
      calls: message.turnId ? calls.filter((c) => c.turnId === message.turnId) : [],
      feedback: feedback
        .filter((f) => f.messageId === message.id)
        .map((f) => ({ kind: f.kind as "down" | "example" | "note", note: f.note })),
    }
  })
}

/** The turn somebody is still running, if any. */
export function pendingView(detail: Detail): PendingView | null {
  const inFlight = detail.turns.find(
    (t) => t.status === "queued" || t.status === "claimed" || t.status === "running"
  )
  return inFlight
    ? {
        model: inFlight.model,
        claimedBy: inFlight.claimedBy,
        since: (inFlight.startedAt ?? inFlight.claimedAt ?? inFlight.createdAt).toISOString(),
        status: inFlight.status as PendingView["status"],
      }
    : null
}
