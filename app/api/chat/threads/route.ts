import { NextResponse } from "next/server"
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm"
import { db } from "@/db"
import { chatMessages, chatThreads, chatToolCalls } from "@/db/schema"
import { authenticateTimeRequest, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * A desk's threads, for the Mac.
 *
 *   GET /api/chat/threads?agent=coach[&pack=me][&since=ISO][&limit=50]
 *
 * What `/train <persona>` reads: every thread addressed to the desk, with its
 * messages, the outcome of every tool call (a rejected write is a signal) and
 * the digest. Device-token auth, like every other machine route; the token
 * is Karol's, on his Mac, so private threads come back too.
 */
export async function GET(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const url = new URL(request.url)
  const agent = url.searchParams.get("agent")?.trim().toLowerCase() ?? ""
  if (!agent) return NextResponse.json({ error: "Send `agent`." }, { status: 400 })
  const pack = url.searchParams.get("pack")?.trim() ?? ""
  const sinceRaw = url.searchParams.get("since")
  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw) : null
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 50) || 50, 1), 200)

  const threads = await db.query.chatThreads.findMany({
    where: and(
      eq(chatThreads.userId, caller.userId),
      eq(chatThreads.agent, agent),
      ...(pack ? [eq(chatThreads.pack, pack)] : []),
      ...(since ? [gte(chatThreads.lastMessageAt, since)] : [])
    ),
    orderBy: [desc(chatThreads.lastMessageAt)],
    limit,
  })
  const ids = threads.map((t) => t.id)
  const [messages, calls] = ids.length
    ? await Promise.all([
        db.query.chatMessages.findMany({
          where: inArray(chatMessages.threadId, ids),
          orderBy: [asc(chatMessages.createdAt)],
        }),
        db.query.chatToolCalls.findMany({
          where: inArray(chatToolCalls.threadId, ids),
          orderBy: [asc(chatToolCalls.createdAt)],
        }),
      ])
    : [[], []]

  return NextResponse.json({
    threads: threads.map((t) => ({
      id: t.id,
      title: t.title,
      agent: t.agent,
      pack: t.pack,
      private: t.private,
      createdAt: t.createdAt.toISOString(),
      lastMessageAt: t.lastMessageAt.toISOString(),
      digest: t.digest,
      fromThreadId: t.fromThreadId,
      messages: messages
        .filter((m) => m.threadId === t.id)
        .map((m) => ({ id: m.id, role: m.role, agent: m.agent, body: m.body, at: m.createdAt.toISOString() })),
      calls: calls
        .filter((c) => c.threadId === t.id)
        .map((c) => ({ id: c.id, name: c.name, status: c.status, error: c.error, turnId: c.turnId })),
    })),
  })
}
