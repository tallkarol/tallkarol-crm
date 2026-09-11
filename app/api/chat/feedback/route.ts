import { NextResponse } from "next/server"
import { and, desc, eq, gte, inArray } from "drizzle-orm"
import { db } from "@/db"
import { chatFeedback, chatMessages } from "@/db/schema"
import { authenticateTimeRequest, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * What Karol said about a desk's replies, for the Mac.
 *
 *   GET /api/chat/feedback?agent=coach[&since=ISO]
 *
 * Each row carries the reply it was about, so `/train` can quote the
 * sentence that was wrong next to what Karol said about it.
 */
export async function GET(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const url = new URL(request.url)
  const agent = url.searchParams.get("agent")?.trim().toLowerCase() ?? ""
  if (!agent) return NextResponse.json({ error: "Send `agent`." }, { status: 400 })
  const sinceRaw = url.searchParams.get("since")
  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw) : null

  const rows = await db.query.chatFeedback.findMany({
    where: and(
      eq(chatFeedback.userId, caller.userId),
      eq(chatFeedback.agent, agent),
      ...(since ? [gte(chatFeedback.createdAt, since)] : [])
    ),
    orderBy: [desc(chatFeedback.createdAt)],
    limit: 500,
  })
  const messageIds = rows.map((r) => r.messageId).filter((id): id is string => !!id)
  const messages = messageIds.length
    ? await db.query.chatMessages.findMany({
        where: inArray(chatMessages.id, messageIds),
        columns: { id: true, body: true, agent: true },
      })
    : []
  const byId = new Map(messages.map((m) => [m.id, m]))

  return NextResponse.json({
    feedback: rows.map((r) => {
      const m = r.messageId ? byId.get(r.messageId) : null
      return {
        id: r.id,
        threadId: r.threadId,
        messageId: r.messageId,
        agent: r.agent,
        pack: r.pack,
        kind: r.kind,
        note: r.note,
        createdAt: r.createdAt.toISOString(),
        message: m ? { body: m.body, agent: m.agent } : null,
      }
    }),
  })
}
