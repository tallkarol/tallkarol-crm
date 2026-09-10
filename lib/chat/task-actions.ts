"use server"

import { revalidatePath } from "next/cache"
import { getSessionUser } from "@/lib/auth"
import { startTaskThread } from "@/lib/chat/task-thread"
import { ROUTES } from "@/lib/nav"

/**
 * The task card's "Solve in chat".
 *
 * Returns the thread so the button can go there — `PrimaryAction` keeps only
 * `ok`, which is why the card has its own control. Bound with the task id
 * before it crosses into the client component, like every other card action.
 */
export async function solveTaskAction(
  taskId: string
): Promise<{ ok: true; threadId: string; created: boolean } | { ok: false; error: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  try {
    const result = await startTaskThread(user.id, taskId)
    revalidatePath("/chat")
    revalidatePath(ROUTES.tasks)
    return { ok: true, ...result }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
