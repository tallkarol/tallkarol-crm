"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { supportTickets, ticketMessages } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import {
  enableSmartsheetWebhook,
  saveSmartsheetConfig,
  syncSupportTickets,
  writeTicketBack,
} from "@/lib/smartsheet"
import { PRIORITIES, TICKET_STATES, type TicketState } from "@/lib/support"

type Result = { ok: boolean; error?: string }

function refresh() {
  revalidatePath(ROUTES.support)
  revalidatePath("/support/[number]", "page")
}

export async function connectSheet(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const sheetId = String(formData.get("sheetId") || "").trim()
  const clientId = String(formData.get("clientId") || "")
  if (!/^\d{5,}$/.test(sheetId)) return
  await saveSmartsheetConfig({ sheetId, clientId: clientId || null })
  await syncSupportTickets()
  refresh()
}

export async function refreshTickets() {
  const user = await getSessionUser()
  if (!user) return
  await syncSupportTickets()
  refresh()
}

export async function enableInstantSync() {
  const user = await getSessionUser()
  if (!user) return
  await enableSmartsheetWebhook()
  refresh()
}

export async function setTicketState(id: string, state: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!(TICKET_STATES as readonly string[]).includes(state)) {
    return { ok: false, error: "Unknown state." }
  }
  await db
    .update(supportTickets)
    .set({
      state: state as TicketState,
      completed: state === "closed",
      updatedAt: new Date(),
    })
    .where(eq(supportTickets.id, id))
  const sheet = await writeTicketBack(id)
  refresh()
  if (!sheet.ok) {
    return { ok: false, error: `Saved here — Smartsheet write failed: ${sheet.error}` }
  }
  return { ok: true }
}

export async function setTicketPriority(id: string, priority: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!(PRIORITIES as readonly string[]).includes(priority)) {
    return { ok: false, error: "Unknown priority." }
  }
  await db
    .update(supportTickets)
    .set({ priority, updatedAt: new Date() })
    .where(eq(supportTickets.id, id))
  refresh()
  return { ok: true }
}

/**
 * Platform is per ticket, not per client — one client can run a Shopify store,
 * a WordPress site, and an internal app, and they break in different ways.
 */
export async function setTicketPlatform(id: string, platform: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  await db
    .update(supportTickets)
    .set({ platform: platform.trim().slice(0, 60), updatedAt: new Date() })
    .where(eq(supportTickets.id, id))
  refresh()
  return { ok: true }
}

export async function setTicketClient(id: string, clientId: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  await db
    .update(supportTickets)
    .set({ clientId: clientId || null, updatedAt: new Date() })
    .where(eq(supportTickets.id, id))
  refresh()
  return { ok: true }
}

/** A note from our side. The first one stops the age column bleeding red. */
export async function addTicketNote(id: string, body: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const text = body.trim()
  if (!text) return { ok: false, error: "Nothing to save." }

  const ticket = await db.query.supportTickets.findFirst({
    where: eq(supportTickets.id, id),
    columns: { id: true, firstResponseAt: true },
  })
  if (!ticket) return { ok: false, error: "That ticket is gone." }

  const now = new Date()
  await db.insert(ticketMessages).values({
    ticketId: id,
    role: "me",
    author: user.name || user.email,
    authorEmail: user.email,
    body: text,
    sentAt: now,
  })
  await db
    .update(supportTickets)
    .set({
      firstResponseAt: ticket.firstResponseAt ?? now,
      updatedAt: now,
    })
    .where(eq(supportTickets.id, id))
  const sheet = await writeTicketBack(id)
  refresh()
  if (!sheet.ok) {
    return { ok: false, error: `Saved here — Smartsheet write failed: ${sheet.error}` }
  }
  return { ok: true }
}

/** Final Resolution — written back to the sheet so the team sees the outcome. */
export async function setTicketResolution(id: string, resolution: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  await db
    .update(supportTickets)
    .set({ resolution: resolution.trim(), updatedAt: new Date() })
    .where(eq(supportTickets.id, id))
  const sheet = await writeTicketBack(id)
  refresh()
  if (!sheet.ok) {
    return { ok: false, error: `Saved here — Smartsheet write failed: ${sheet.error}` }
  }
  return { ok: true }
}

export async function setTicketAssignee(id: string, assignee: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  await db
    .update(supportTickets)
    .set({ assignee: assignee.trim().slice(0, 80), updatedAt: new Date() })
    .where(eq(supportTickets.id, id))
  const sheet = await writeTicketBack(id)
  refresh()
  if (!sheet.ok) {
    return { ok: false, error: `Saved here — Smartsheet write failed: ${sheet.error}` }
  }
  return { ok: true }
}
