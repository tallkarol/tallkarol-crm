"use server"

import { revalidatePath } from "next/cache"
import { getSessionUser } from "@/lib/auth"
import { decideToolCall, send } from "@/lib/chat/turns"

/**
 * What the browser calls. Machine callers use /api/chat/* with a device
 * token; both land on the same functions in lib/chat/turns.ts, so a phone
 * shortcut and the page cannot drift apart.
 */

export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

export async function sendMessage(input: {
  threadId?: string | null
  text: string
}): Promise<ActionResult<{ threadId: string; model: string; job: string; notice: string | null }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const text = input.text.trim()
  if (!text) return { ok: false, error: "Nothing to send." }

  try {
    const result = await send({
      userId: user.id,
      threadId: input.threadId,
      text,
    })
    revalidatePath("/chat")
    return {
      ok: true,
      threadId: result.threadId,
      model: result.turn.model,
      job: result.routing.job,
      notice: result.routing.notice ?? null,
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function decideApproval(input: {
  callId: string
  approve: boolean
}): Promise<ActionResult<{ status: string }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const outcome = await decideToolCall({
    userId: user.id,
    callId: input.callId,
    approve: input.approve,
  })

  revalidatePath("/chat")
  revalidatePath("/timesheet")
  revalidatePath("/tasks")

  if (!outcome.ok) return { ok: false, error: outcome.error }
  return { ok: true, status: outcome.call.status }
}
