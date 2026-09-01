"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"

export async function updateClientNotes(
  clientId: string,
  notes: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const row = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
  })
  if (!row) return { ok: false, error: "No such client." }

  await db
    .update(clients)
    .set({ notes: notes.slice(0, 5000), updatedAt: new Date() })
    .where(eq(clients.id, clientId))

  revalidatePath(ROUTES.client(row.slug))
  return { ok: true }
}
