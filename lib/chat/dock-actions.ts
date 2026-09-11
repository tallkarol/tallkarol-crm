"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { chatThreads, chatToolCalls } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import type { ChatMessageView, PendingView } from "@/components/chat/types"
import { dockSettings, type DockOpenMode } from "@/lib/chat/dock-settings"
import { PERSONAS } from "@/lib/chat/personas"
import { latestDigestFor, latestThreadFor, send, threadDetail } from "@/lib/chat/turns"
import { messageViews, pendingView } from "@/lib/chat/views"

/**
 * What the dock's panel calls. The panel is the same thread the chat page
 * shows, narrower: same rows, same cards, same feedback — through the same
 * `send()`, addressed to the desk explicitly instead of by typed grammar.
 */

export type ActionResult<T> = ({ ok: true } & T) | { ok: false; error: string }

export type DeskThreadView = {
  threadId: string | null
  title: string
  messages: ChatMessageView[]
  pending: PendingView | null
  /** The desk's newest digest on this pack — what it remembers, before Karol types. */
  lastTime: { threadId: string; title: string; at: string; digest: string } | null
  mode: DockOpenMode
}

async function viewFor(userId: string, threadId: string | null, agent: string, pack: string, mode: DockOpenMode): Promise<DeskThreadView> {
  const detail = threadId ? await threadDetail(userId, threadId) : null
  const lastTime = await latestDigestFor(userId, agent, pack)
  return {
    threadId: detail?.thread.id ?? null,
    title: detail?.thread.title ?? "",
    messages: detail ? messageViews(detail) : [],
    pending: detail ? pendingView(detail) : null,
    lastTime,
    mode,
  }
}

/** Open a desk on a pack: its latest thread (continue) or nothing yet (new). */
export async function openDesk(input: {
  agent: string
  pack: string
  /** Force a fresh thread for this open, whatever the setting says. */
  fresh?: boolean
}): Promise<ActionResult<{ view: DeskThreadView }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const persona = PERSONAS[input.agent]
  if (!persona) return { ok: false, error: `No desk named "${input.agent}".` }
  const pack = persona.pack === "me" ? "me" : input.pack
  const settings = await dockSettings()
  const mode: DockOpenMode = input.fresh ? "new" : settings.open
  const latest = mode === "continue" ? await latestThreadFor(user.id, persona.name, pack) : null
  return { ok: true, view: await viewFor(user.id, latest?.id ?? null, persona.name, pack, mode) }
}

/** Re-read an open thread — the panel polls this while a turn is in flight. */
export async function loadDeskThread(input: {
  threadId: string
  agent: string
  pack: string
}): Promise<ActionResult<{ view: DeskThreadView }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const settings = await dockSettings()
  return { ok: true, view: await viewFor(user.id, input.threadId, input.agent, input.pack, settings.open) }
}

/** Send to the desk; a null threadId starts the thread. */
export async function sendToDesk(input: {
  threadId: string | null
  agent: string
  pack: string
  text: string
}): Promise<ActionResult<{ threadId: string }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  try {
    const result = await send({
      userId: user.id,
      threadId: input.threadId,
      text: input.text,
      desk: { agent: input.agent, pack: input.pack },
    })
    revalidatePath("/chat")
    return { ok: true, threadId: result.threadId }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Desks with a card parked for Karol — the dot on a monogram. */
export async function deskBadges(): Promise<Record<string, number>> {
  const user = await getSessionUser()
  if (!user) return {}
  const rows = await db
    .select({ agent: chatThreads.agent, threadId: chatThreads.id })
    .from(chatToolCalls)
    .innerJoin(chatThreads, eq(chatToolCalls.threadId, chatThreads.id))
    .where(and(eq(chatToolCalls.status, "pending"), eq(chatThreads.userId, user.id)))
  const seen = new Map<string, Set<string>>()
  for (const r of rows) {
    if (!r.agent) continue
    if (!seen.has(r.agent)) seen.set(r.agent, new Set())
    seen.get(r.agent)!.add(r.threadId)
  }
  const out: Record<string, number> = {}
  seen.forEach((threads, agent) => {
    out[agent] = threads.size
  })
  return out
}
