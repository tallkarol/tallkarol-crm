"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { tasks } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"

export async function toggleTask(id: string, done: boolean) {
  const user = await getSessionUser()
  if (!user) return
  await db
    .update(tasks)
    .set({ status: done ? "done" : "open", updatedAt: new Date() })
    .where(eq(tasks.id, id))
  revalidatePath(ROUTES.tasks)
  revalidatePath(ROUTES.home)
}

export async function addTask(title: string, clientId: string | null) {
  const user = await getSessionUser()
  if (!user) return
  const trimmed = title.trim()
  if (!trimmed) return
  await db.insert(tasks).values({ title: trimmed, clientId })
  revalidatePath(ROUTES.tasks)
}

export async function setTaskDue(id: string, dueOn: string | null) {
  const user = await getSessionUser()
  if (!user) return
  if (dueOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return
  await db
    .update(tasks)
    .set({ dueOn, updatedAt: new Date() })
    .where(eq(tasks.id, id))
  revalidatePath(ROUTES.tasks)
}
