"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { chatMessages, chatThreads, chatToolCalls, clients } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { leaveFeedback, type FeedbackKind } from "@/lib/chat/feedback"
import {
  actionDone,
  suggestedActions,
  type ReplyActionContext,
} from "@/lib/chat/reply-actions"
import { startTaskThread } from "@/lib/chat/task-thread"
import { toolByName, toolSource } from "@/lib/chat/tools"
import { isLadderPick, type LadderPick } from "@/lib/chat/models"
import {
  decideToolCall,
  renameThread as rename,
  send,
  setThreadArchived,
} from "@/lib/chat/turns"
import { insertTaskRow, resolveTaskTarget } from "@/lib/task-insert"

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
  ladder?: LadderPick
  attachmentIds?: string[]
}): Promise<ActionResult<{ threadId: string; model: string; job: string; notice: string | null }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const text = input.text.trim()
  const attachmentIds = (input.attachmentIds ?? []).filter((id) => typeof id === "string")
  if (!text && attachmentIds.length === 0) return { ok: false, error: "Nothing to send." }

  try {
    const result = await send({
      userId: user.id,
      threadId: input.threadId,
      text,
      ladder: isLadderPick(input.ladder) ? input.ladder : "auto",
      attachmentIds,
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

export async function renameThread(input: {
  threadId: string
  title: string
}): Promise<ActionResult<{ title: string }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  try {
    const title = await rename(user.id, input.threadId, input.title)
    revalidatePath("/chat")
    return { ok: true, title }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function archiveThread(input: {
  threadId: string
  archived: boolean
}): Promise<ActionResult<{ archived: boolean; skipped: number }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  try {
    const { skipped } = await setThreadArchived(user.id, input.threadId, input.archived)
    revalidatePath("/chat")
    return { ok: true, archived: input.archived, skipped }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function giveFeedback(input: {
  messageId: string
  kind: FeedbackKind
  note?: string
}): Promise<ActionResult<{ id: string }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  try {
    const row = await leaveFeedback({
      userId: user.id,
      messageId: input.messageId,
      kind: input.kind,
      note: input.note ?? "",
    })
    revalidatePath("/chat")
    return { ok: true, id: row.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * A failed card becomes a ticket and a solve, in one click.
 *
 * The diagnosis is the row itself — tool, arguments, error, the thread it
 * happened in, and the file the tool lives in — written as a task under the
 * house client (tallkarol) so it sits on the board, then taken straight into
 * a task thread: the worker cuts a worktree of the CRM and works the fix,
 * replying Found / Changed / Verified / Left for Karol. Clicking is the
 * approval; nothing parks twice.
 */
export async function triageFailedCall(input: {
  callId: string
}): Promise<ActionResult<{ taskId: string; threadId: string }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const call = await db.query.chatToolCalls.findFirst({ where: eq(chatToolCalls.id, input.callId) })
  if (!call) return { ok: false, error: "Unknown tool call." }
  if (call.status !== "failed") return { ok: false, error: `That call is ${call.status}, not failed.` }
  const thread = await db.query.chatThreads.findFirst({
    where: and(eq(chatThreads.id, call.threadId), eq(chatThreads.userId, user.id)),
    columns: { id: true, title: true, agent: true },
  })
  if (!thread) return { ok: false, error: "Not your thread." }

  const house = await db.query.clients.findFirst({ where: eq(clients.slug, "tallkarol"), columns: { id: true } })
  if (!house) return { ok: false, error: "No house client (slug tallkarol) to file under." }
  const target = await resolveTaskTarget({ clientId: house.id })
  if ("error" in target) return { ok: false, error: target.error }

  const error = call.error || "failed without an error message"
  const notes = [
    `A chat write failed and Karol asked for it to be fixed.`,
    ``,
    `Tool: ${call.name}`,
    `Arguments: ${JSON.stringify(call.args)}`,
    `Error: ${error}`,
    `Thread: /chat?thread=${thread.id}${thread.agent ? ` (desk: ${thread.agent})` : ""}${thread.title ? ` — "${thread.title}"` : ""}`,
    ``,
    `Where to look first: ${toolSource(call.name)} (the tool's preview and run), then whatever it wraps.`,
    `Repository: the crm checkout under ~/Work/tallkarol — work in crm.`,
    `Done means: the same call with the same arguments either succeeds or fails before approval with a message that says what to do instead. Add a check to scripts/check-chat-db.ts if one fits.`,
  ].join("\n")

  try {
    const taskId = await insertTaskRow(db, {
      title: `chat: ${call.name} failed — ${error.slice(0, 80)}`,
      userId: user.id,
      target,
      priority: 2,
      notes,
      labels: ["chat-failure", call.name],
      source: "chat",
      refKind: "chat_tool_call",
      refId: call.id,
    })
    const { threadId } = await startTaskThread(user.id, taskId)
    revalidatePath("/chat")
    revalidatePath("/tasks")
    return { ok: true, taskId, threadId }
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
  revalidatePath("/inbox")
  revalidatePath("/inspiration")
  revalidatePath("/")

  if (!outcome.ok) return { ok: false, error: outcome.error }
  return { ok: true, status: outcome.call.status }
}

/**
 * Several cards from one reply, decided together — "Confirm all 8". Each
 * still goes through decideToolCall, so the per-row compare-and-swap and
 * the idempotency key that flows into the domain write are unchanged; only
 * the clicks and the revalidation are shared.
 */
export async function decideApprovals(input: {
  callIds: string[]
  approve: boolean
}): Promise<ActionResult<{ decided: number; failed: { callId: string; error: string }[] }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const ids = Array.from(new Set(input.callIds.filter((id) => typeof id === "string"))).slice(0, 50)
  const failed: { callId: string; error: string }[] = []
  let decided = 0
  for (const callId of ids) {
    const outcome = await decideToolCall({ userId: user.id, callId, approve: input.approve })
    if (outcome.ok) decided++
    else failed.push({ callId, error: outcome.error })
  }

  revalidatePath("/chat")
  revalidatePath("/timesheet")
  revalidatePath("/tasks")
  revalidatePath("/inbox")
  revalidatePath("/inspiration")
  revalidatePath("/")

  return { ok: true, decided, failed }
}

/**
 * A button under Left for Karol. The click is the approval — the same tools
 * the chat already has, without a second Confirm card for work he just asked
 * the reply to offer.
 */
export async function runReplyAction(input: {
  messageId: string
  key: string
}): Promise<ActionResult<{ href?: string; label: string }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const message = await db.query.chatMessages.findFirst({
    where: eq(chatMessages.id, input.messageId),
  })
  if (!message || message.role !== "assistant") {
    return { ok: false, error: "No such reply." }
  }

  const thread = await db.query.chatThreads.findFirst({
    where: and(eq(chatThreads.id, message.threadId), eq(chatThreads.userId, user.id)),
    with: {
      task: { columns: { id: true, title: true, status: true } },
      client: { columns: { slug: true } },
    },
  })
  if (!thread) return { ok: false, error: "Not your thread." }

  const context: ReplyActionContext = {
    threadId: thread.id,
    task: thread.task,
    clientSlug: thread.client?.slug ?? null,
  }
  const action = suggestedActions(message.body, context).find((a) => a.key === input.key)
  if (!action) return { ok: false, error: "That action is no longer on this reply." }

  if (action.href) return { ok: true, href: action.href, label: action.label }

  const existing = await db.query.chatToolCalls.findMany({
    where: eq(chatToolCalls.threadId, thread.id),
  })
  if (actionDone(action, existing)) return { ok: true, label: action.label }

  const spec = toolByName(action.kind)
  if (!spec) return { ok: false, error: `The CRM cannot ${action.kind}.` }

  const [row] = await db
    .insert(chatToolCalls)
    .values({
      threadId: thread.id,
      turnId: message.turnId,
      name: spec.name,
      args: action.args,
      mutating: spec.mutating,
      status: "pending",
    })
    .returning()

  if (spec.preview) {
    try {
      const preview = await spec.preview(action.args, {
        userId: user.id,
        threadId: thread.id,
        idempotencyKey: row.idempotencyKey,
      })
      await db.update(chatToolCalls).set({ preview }).where(eq(chatToolCalls.id, row.id))
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await db
        .update(chatToolCalls)
        .set({ status: "failed", error: error.slice(0, 2000) })
        .where(eq(chatToolCalls.id, row.id))
      return { ok: false, error }
    }
  }

  const outcome = await decideToolCall({
    userId: user.id,
    callId: row.id,
    approve: true,
  })

  revalidatePath("/chat")
  revalidatePath("/tasks")
  revalidatePath("/")

  if (!outcome.ok) return { ok: false, error: outcome.error }
  return { ok: true, label: action.label }
}
