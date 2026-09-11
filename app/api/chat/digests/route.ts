import { NextResponse } from "next/server"
import { and, asc, eq, isNull, lt, ne, or, sql } from "drizzle-orm"
import { db } from "@/db"
import { chatMessages, chatThreads } from "@/db/schema"
import { authenticateTimeRequest, readJson, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * A desk thread that went quiet and has no digest yet — for the worker to
 * summarise on a cheap model when it has nothing else to do.
 *
 * Quiet means twenty minutes since the last message. A thread is offered
 * again after each new message (`digested_at < last_message_at`), so the
 * digest follows the conversation; a thread the worker could not digest is
 * offered again on the next poll — the worker keeps its own short memory of
 * ones that just failed.
 */
const QUIET_MS = 20 * 60_000

export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()
  await readJson(request)

  const quiet = new Date(Date.now() - QUIET_MS)
  const skip = new URL(request.url).searchParams.get("skip")?.split(",").filter(Boolean) ?? []
  const thread = await db.query.chatThreads.findFirst({
    where: and(
      eq(chatThreads.userId, caller.userId),
      ne(chatThreads.agent, ""),
      lt(chatThreads.lastMessageAt, quiet),
      or(isNull(chatThreads.digestedAt), sql`${chatThreads.digestedAt} < ${chatThreads.lastMessageAt}`),
      ...(skip.length ? [sql`${chatThreads.id} <> ALL(${sql.raw(`ARRAY[${skip.map((s) => `'${s.replace(/[^0-9a-f-]/g, "")}'`).join(",")}]::uuid[]`)})`] : [])
    ),
    orderBy: [asc(chatThreads.lastMessageAt)],
  })
  if (!thread) return NextResponse.json({ thread: null })

  const messages = await db.query.chatMessages.findMany({
    where: eq(chatMessages.threadId, thread.id),
    orderBy: [asc(chatMessages.createdAt)],
  })
  const spoken = messages.filter((m) => m.role === "user" || m.role === "assistant").slice(-60)
  if (spoken.length < 2) {
    // Nothing to digest; stamp it so it is not offered again until it grows.
    await db.update(chatThreads).set({ digestedAt: new Date() }).where(eq(chatThreads.id, thread.id))
    return NextResponse.json({ thread: null })
  }

  return NextResponse.json({
    thread: {
      id: thread.id,
      agent: thread.agent,
      pack: thread.pack,
      title: thread.title,
      lastMessageAt: thread.lastMessageAt.toISOString(),
      messages: spoken.map((m) => ({ role: m.role, agent: m.agent, body: m.body, at: m.createdAt.toISOString() })),
    },
  })
}
