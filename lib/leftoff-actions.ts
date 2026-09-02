"use server"

import { revalidatePath } from "next/cache"
import { getSessionUser } from "@/lib/auth"
import { dismissNote, pinNote } from "@/lib/leftoff-data"

/**
 * The dashboard band's two verbs. Bound (`action.bind(null, ref)`) before
 * they reach a form — the house rule for anything crossing into a client
 * boundary — and auth-guarded because the band renders only behind login but
 * an action is its own endpoint.
 */

export async function dismissLeftOffAction(sessionRef: string): Promise<void> {
  const user = await getSessionUser()
  if (!user) return
  await dismissNote(sessionRef)
  revalidatePath("/")
}

export async function pinLeftOffAction(sessionRef: string, pinned: boolean): Promise<void> {
  const user = await getSessionUser()
  if (!user) return
  await pinNote(sessionRef, pinned)
  revalidatePath("/")
}
