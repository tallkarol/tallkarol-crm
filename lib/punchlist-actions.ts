"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { punchlistItems } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { CLIENT_PAGES, ROUTES } from "@/lib/nav"
import { stateToTask, type ItemState } from "@/lib/punchlist"
import {
  acceptDraft,
  requestTestRun,
  setItemTest,
  setListStatus,
} from "@/lib/punchlists"
import { setTaskDone, setTaskStage } from "@/lib/task-actions"
import { tracked } from "@/lib/activity/tracked"

/**
 * Browser-side mutations for punch lists. Single-argument shapes so they can
 * be handed to client components bound (`action.bind(null, id)`) — the same
 * rule as `task-peek-actions.ts`.
 */

type Result = { ok: boolean; error?: string }

function touch() {
  // The list's own page is inside its client; refresh them all rather than look the client up.
  revalidatePath(CLIENT_PAGES, "layout")
  revalidatePath(ROUTES.tasks)
  revalidatePath(ROUTES.home)
}

/** The state circle: writes the item's task, never the item. */
export const setItemStateAction = tracked("punchlist.setItemStateAction", async function setItemStateAction(itemId: string, state: ItemState): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const item = await db.query.punchlistItems.findFirst({
    where: eq(punchlistItems.id, itemId),
  })
  if (!item) return { ok: false, error: "That item is gone." }
  if (!item.taskId) return { ok: false, error: "Accept the draft first — this item has no task yet." }

  const move = stateToTask(state)
  const result = move.done
    ? await setTaskDone(item.taskId, true)
    : await setTaskStage(item.taskId, move.stage ?? "queue")
  if (!result.ok) return result
  touch()
  return { ok: true }
})

export const acceptDraftAction = tracked("punchlist.acceptDraftAction", async function acceptDraftAction(id: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const result = await acceptDraft(id, user.id)
  if (!result.ok) return { ok: false, error: result.error }
  touch()
  return { ok: true }
})

export const setListStatusAction = tracked("punchlist.setListStatusAction", async function setListStatusAction(
  id: string,
  status: "open" | "void"
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  await setListStatus(id, status)
  touch()
  return { ok: true }
})

export const requestTestAction = tracked("punchlist.requestTestAction", async function requestTestAction(itemId: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const result = await requestTestRun(itemId, user.id)
  if (!result.ok) return { ok: false, error: result.error }
  touch()
  return { ok: true }
})

/** `raw` is the JSON text from the editor; empty clears the test. */
export const setItemTestAction = tracked("punchlist.setItemTestAction", async function setItemTestAction(
  itemId: string,
  raw: string
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  let parsed: unknown = null
  const text = raw.trim()
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      return { ok: false, error: "That is not valid JSON." }
    }
  }
  const result = await setItemTest(itemId, parsed)
  if (!result.ok) return { ok: false, error: result.error }
  touch()
  return { ok: true }
})
