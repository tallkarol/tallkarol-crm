"use server"

import { and, eq } from "drizzle-orm"
import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { focusItems } from "@/db/schema"
import { setTicketState } from "@/app/(admin)/support/actions"
import { tracked } from "@/lib/activity/tracked"
import { getSessionUser } from "@/lib/auth"
import {
  FOCUS_MODE_COOKIE,
  isFocusKind,
  isFocusMode,
  placeInOrder,
  type FocusKind,
  type FocusMode,
} from "@/lib/focus"
import { focusOrder, focusRowClient, globalOrder, writeGlobalOrder, writeOrder } from "@/lib/focus-data"
import { isoDay, weekEnd, type Horizon } from "@/lib/horizon"
import { setInboxItemState } from "@/lib/inbox-triage"
import { ROUTES } from "@/lib/nav"
import { setDeliverableStatusAction } from "@/lib/peek-actions"
import { setTaskDone } from "@/lib/task-actions"
import { setTaskDueAction, setTaskSnoozeAction, setTaskStageAction } from "@/lib/task-peek-actions"

type Result = { ok: true } | { ok: false; error: string }

/** The other action modules each declare their own Result shape; fold them into ours. */
function pass(r: { ok: boolean; error?: string }): Result {
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? "Could not save." }
}

/**
 * Every write to focus_items. Each one re-reads the order, applies the pure
 * rule from lib/focus.ts, and writes positions back, so two quick drops
 * cannot leave a gap or a duplicate position.
 */

function touch(slug: string | null) {
  if (slug) revalidatePath(ROUTES.client(slug))
  revalidatePath(ROUTES.home)
  revalidatePath(ROUTES.clients)
}

export type FocusTarget = { slot: number } | { queue: number | null } | { front: true }

async function currentMode(): Promise<FocusMode> {
  const raw = (await cookies()).get(FOCUS_MODE_COOKIE)?.value
  return isFocusMode(raw) ? raw : "three"
}

export const setFocusModeAction = tracked("focus.setMode", async function setFocusModeAction(mode: FocusMode): Promise<Result> {
  if (!isFocusMode(mode)) return { ok: false, error: "Unknown mode." }
  const jar = await cookies()
  jar.set(FOCUS_MODE_COOKIE, mode, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" })
  return { ok: true }
})

export const addFocusAction = tracked("focus.add", async function addFocusAction(input: {
  clientId: string
  clientSlug: string
  refKind: FocusKind
  refId: string
  target?: FocusTarget
}): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!isFocusKind(input.refKind)) return { ok: false, error: "Unknown kind." }

  const existing = await db.query.focusItems.findFirst({
    where: and(
      eq(focusItems.clientId, input.clientId),
      eq(focusItems.refKind, input.refKind),
      eq(focusItems.refId, input.refId)
    ),
  })
  const order = await focusOrder(input.clientId)
  let id = existing?.id
  if (!id) {
    const [row] = await db
      .insert(focusItems)
      .values({ userId: user.id, clientId: input.clientId, refKind: input.refKind, refId: input.refId, position: order.length })
      .returning({ id: focusItems.id })
    id = row.id
    order.push(id)
  }
  const mode = await currentMode()
  const target = input.target ?? { queue: null }
  await writeOrder(input.clientId, placeInOrder(order, id, target, mode))
  touch(input.clientSlug)
  return { ok: true }
})

export const moveFocusAction = tracked("focus.move", async function moveFocusAction(id: string, target: FocusTarget): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const found = await focusRowClient(id)
  if (!found) return { ok: false, error: "That card is gone." }
  const order = await focusOrder(found.row.clientId)
  const mode = await currentMode()
  await writeOrder(found.row.clientId, placeInOrder(order, id, target, mode))
  touch(found.client?.slug ?? null)
  return { ok: true }
})

export const removeFocusAction = tracked("focus.remove", async function removeFocusAction(id: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const found = await focusRowClient(id)
  if (!found) return { ok: true }
  await db.delete(focusItems).where(eq(focusItems.id, id))
  const order = (await focusOrder(found.row.clientId)).filter((x) => x !== id)
  await writeOrder(found.row.clientId, order)
  touch(found.client?.slug ?? null)
  return { ok: true }
})

export const setFocusGlobalAction = tracked("focus.setGlobal", async function setFocusGlobalAction(id: string, global: boolean): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const found = await focusRowClient(id)
  if (!found) return { ok: false, error: "That card is gone." }
  if (!global && !found.row.clientId) {
    // A house row has no Board to fall back to: off the tray means gone.
    await db.delete(focusItems).where(eq(focusItems.id, id))
    await writeOrder(null, (await focusOrder(null)).filter((x) => x !== id))
  } else {
    // Elevated: joins the end of the tray's order; the next drop there places it.
    await db.update(focusItems).set({ global, globalPosition: null }).where(eq(focusItems.id, id))
  }
  await writeGlobalOrder(await globalOrder())
  touch(found.client?.slug ?? null)
  return { ok: true }
})

/**
 * A card dragged onto the dashboard tray from Needs attention. The record
 * joins its client's set (a global note is always on its client too — the
 * rule from 23 Sep) or the house set when it has no client, is elevated,
 * and takes the dropped place in the tray's order.
 */
export const addGlobalFocusAction = tracked("focus.addGlobal", async function addGlobalFocusAction(input: {
  clientId: string | null
  clientSlug: string | null
  refKind: FocusKind
  refId: string
  target?: FocusTarget
}): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!isFocusKind(input.refKind)) return { ok: false, error: "Unknown kind." }
  const existing = await db.query.focusItems.findFirst({
    where: and(eq(focusItems.refKind, input.refKind), eq(focusItems.refId, input.refId)),
  })
  let id = existing?.id
  if (!id) {
    const order = await focusOrder(input.clientId)
    const [row] = await db
      .insert(focusItems)
      .values({ userId: user.id, clientId: input.clientId, refKind: input.refKind, refId: input.refId, position: order.length, global: true })
      .returning({ id: focusItems.id })
    id = row.id
  } else if (!existing?.global) {
    await db.update(focusItems).set({ global: true, globalPosition: null }).where(eq(focusItems.id, id))
  }
  const mode = await currentMode()
  await writeGlobalOrder(placeInOrder(await globalOrder(), id, input.target ?? { queue: null }, mode))
  touch(input.clientSlug)
  return { ok: true }
})

/** A card moved within the dashboard tray — into a slot, or to a place in the queue. */
export const moveGlobalFocusAction = tracked("focus.moveGlobal", async function moveGlobalFocusAction(id: string, target: FocusTarget): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const found = await focusRowClient(id)
  if (!found || !found.row.global) return { ok: false, error: "That card is gone." }
  const mode = await currentMode()
  await writeGlobalOrder(placeInOrder(await globalOrder(), id, target, mode))
  touch(found.client?.slug ?? null)
  return { ok: true }
})

/**
 * ✓ on a post-it. Completes the record it points at — the task, the ticket,
 * the deliverable — then drops the row; the next queued card moves up on
 * its own because positions are relative. Mail has no "done", so it is
 * archived in the inbox instead.
 */
export const completeFocusAction = tracked("focus.complete", async function completeFocusAction(id: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const found = await focusRowClient(id)
  if (!found) return { ok: false, error: "That card is gone." }
  const { row } = found
  let result: Result = { ok: true }
  if (row.refKind === "task") result = pass(await setTaskDone(row.refId, true))
  else if (row.refKind === "ticket") result = pass(await setTicketState(row.refId, "closed"))
  else if (row.refKind === "deliverable") result = pass(await setDeliverableStatusAction(row.refId, "done"))
  else if (row.refKind === "mail") result = pass(await setInboxItemState(`mail:${row.refId}`, "archived", null))
  if (!result.ok) return result
  await db.delete(focusItems).where(eq(focusItems.id, id))
  await writeOrder(found.row.clientId, (await focusOrder(found.row.clientId)).filter((x) => x !== id))
  touch(found.client?.slug ?? null)
  return { ok: true }
})

/**
 * A post-it dragged down into a Board column. The row leaves focus; a task
 * also takes the column's meaning (a date this week, no date, parked on the
 * client, or done). Other kinds only leave focus — a ticket has no horizon.
 */
export const deferFocusAction = tracked("focus.defer", async function deferFocusAction(id: string, horizon: Horizon): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const found = await focusRowClient(id)
  if (!found) return { ok: false, error: "That card is gone." }
  if (found.row.refKind === "task") {
    const r = await moveTaskHorizonAction(found.row.refId, horizon)
    if (!r.ok) return r
  }
  await db.delete(focusItems).where(eq(focusItems.id, id))
  await writeOrder(found.row.clientId, (await focusOrder(found.row.clientId)).filter((x) => x !== id))
  touch(found.client?.slug ?? null)
  return { ok: true }
})

/** A Board card dropped in another column — the column's rule, written. */
export const moveTaskHorizonAction = tracked("focus.moveTaskHorizon", async function moveTaskHorizonAction(
  taskId: string,
  horizon: Horizon,
  current?: { dueOn: string | null }
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const today = isoDay(new Date())
  if (horizon === "done") return pass(await setTaskDone(taskId, true))
  // Anything leaving Done reopens; anything leaving Waiting un-parks.
  const reopened = pass(await setTaskStageAction(taskId, "queue"))
  if (!reopened.ok) return reopened
  const cleared = pass(await setTaskSnoozeAction(taskId, null))
  if (!cleared.ok) return cleared
  if (horizon === "waiting") return pass(await setTaskStageAction(taskId, "waiting"))
  if (horizon === "later") return pass(await setTaskDueAction(taskId, null))
  // This week: keep a date that already lands inside the week, else Sunday.
  const end = weekEnd(today)
  if (current?.dueOn && current.dueOn <= end) return { ok: true }
  return pass(await setTaskDueAction(taskId, end))
})
