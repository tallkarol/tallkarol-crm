"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { notionLinks } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import { syncLink } from "@/lib/notion"

export async function syncNotebook(linkId: string) {
  const user = await getSessionUser()
  if (!user || user.role !== "admin") return

  const link = await db.query.notionLinks.findFirst({
    where: eq(notionLinks.id, linkId),
    with: { client: true },
  })
  if (!link) return

  try {
    await syncLink(link)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(notionLinks)
      .set({ lastError: message.slice(0, 500) })
      .where(eq(notionLinks.id, link.id))
  }

  revalidatePath(ROUTES.notebooks)
  if (link.client) revalidatePath(ROUTES.notebook(link.client.slug))
}
