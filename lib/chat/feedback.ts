import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { chatFeedback, chatMessages, chatThreads } from "@/db/schema"

/**
 * Feedback on a reply. Three kinds and nothing cleverer: `down` (this was
 * wrong, and why), `example` (keep this as the bar), `note` (a remark).
 * The persona's `/train` lane reads them; nothing here changes a persona
 * by itself.
 */

export const FEEDBACK_KINDS = ["down", "example", "note"] as const
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number]

export async function leaveFeedback(input: {
  userId: string
  messageId: string
  kind: FeedbackKind
  note: string
}) {
  if (!FEEDBACK_KINDS.includes(input.kind)) throw new Error("Unknown feedback kind.")
  const message = await db.query.chatMessages.findFirst({
    where: eq(chatMessages.id, input.messageId),
    columns: { id: true, threadId: true, role: true },
  })
  if (!message || message.role !== "assistant") throw new Error("Feedback goes on a reply.")
  const thread = await db.query.chatThreads.findFirst({
    where: and(eq(chatThreads.id, message.threadId), eq(chatThreads.userId, input.userId)),
    columns: { id: true, agent: true, pack: true },
  })
  if (!thread) throw new Error("Not your thread.")
  const [row] = await db
    .insert(chatFeedback)
    .values({
      threadId: thread.id,
      messageId: message.id,
      userId: input.userId,
      agent: thread.agent,
      pack: thread.pack,
      kind: input.kind,
      note: input.note.trim().slice(0, 2000),
    })
    .returning()
  return row
}
