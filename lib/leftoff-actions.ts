"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getSessionUser } from "@/lib/auth"
import { convertNote, dismissNote, pinNote, queueReply } from "@/lib/leftoff-data"

/**
 * The dashboard band's verbs. Bound (`action.bind(null, ref)`) before they
 * reach a form — the house rule for anything crossing into a client
 * boundary — and auth-guarded because an action is its own endpoint.
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

export async function replyLeftOffAction(sessionRef: string, formData: FormData): Promise<void> {
  const user = await getSessionUser()
  if (!user) return
  const text = String(formData.get("text") ?? "")
  await queueReply(sessionRef, text)
  revalidatePath("/")
}

export async function convertLeftOffAction(sessionRef: string, to: "task" | "ticket"): Promise<void> {
  const user = await getSessionUser()
  if (!user) return
  const result = await convertNote(sessionRef, to, user.id)
  revalidatePath("/")
  if (result.ok) redirect(result.url)
}
