"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { calendarEvents, meetingNotes, products, punchlists } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { tracked } from "@/lib/activity/tracked"
import { CLIENT_PAGES, ROUTES } from "@/lib/nav"

/**
 * Filing things onto a product (24 Sep 2026): a calendar event, a meeting
 * note, a punch list. Each takes a product id or null (take it off), and
 * refreshes every product room — a row can leave one product for another.
 */

type Result = { ok: true } | { ok: false; error: string }

/** Every page under /products/[slug] — the hub's layout and its rooms. */
const PRODUCT_PAGES = "/products/[slug]"

async function productExists(productId: string | null): Promise<boolean> {
  if (!productId) return true
  const row = await db.query.products.findFirst({ where: eq(products.id, productId), columns: { id: true } })
  return Boolean(row)
}

export const setEventProductAction = tracked("productHub.setEventProductAction", async function setEventProductAction(
  eventId: string,
  productId: string | null
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!(await productExists(productId))) return { ok: false, error: "That product is gone." }
  const [row] = await db
    .update(calendarEvents)
    .set({ productId })
    .where(eq(calendarEvents.id, eventId))
    .returning({ id: calendarEvents.id })
  if (!row) return { ok: false, error: "That event is gone." }
  revalidatePath(PRODUCT_PAGES, "layout")
  return { ok: true }
})

export const setNoteProductAction = tracked("productHub.setNoteProductAction", async function setNoteProductAction(
  noteId: string,
  productId: string | null
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!(await productExists(productId))) return { ok: false, error: "That product is gone." }
  // Only the note's own recorder may refile it, as with its client and project.
  const [row] = await db
    .update(meetingNotes)
    .set({ productId, updatedAt: new Date() })
    .where(and(eq(meetingNotes.id, noteId), eq(meetingNotes.userId, user.id)))
    .returning({ id: meetingNotes.id })
  if (!row) return { ok: false, error: "That note does not exist." }
  revalidatePath(ROUTES.meetingNote(noteId))
  revalidatePath(PRODUCT_PAGES, "layout")
  return { ok: true }
})

export const setPunchlistProductAction = tracked("productHub.setPunchlistProductAction", async function setPunchlistProductAction(
  listId: string,
  productId: string | null
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!(await productExists(productId))) return { ok: false, error: "That product is gone." }
  const [row] = await db
    .update(punchlists)
    .set({ productId, updatedAt: new Date() })
    .where(eq(punchlists.id, listId))
    .returning({ id: punchlists.id })
  if (!row) return { ok: false, error: "That punch list is gone." }
  revalidatePath(PRODUCT_PAGES, "layout")
  revalidatePath(CLIENT_PAGES, "layout")
  return { ok: true }
})
