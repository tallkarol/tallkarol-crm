"use server"

import { revalidatePath } from "next/cache"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import {
  enableSmartsheetWebhook,
  saveSmartsheetConfig,
  syncSupportTickets,
} from "@/lib/smartsheet"

export async function connectSheet(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const sheetId = String(formData.get("sheetId") || "").trim()
  const clientId = String(formData.get("clientId") || "")
  if (!/^\d{5,}$/.test(sheetId)) return
  await saveSmartsheetConfig({ sheetId, clientId: clientId || null })
  await syncSupportTickets()
  revalidatePath(ROUTES.support)
}

export async function refreshTickets() {
  const user = await getSessionUser()
  if (!user) return
  await syncSupportTickets()
  revalidatePath(ROUTES.support)
}

export async function enableInstantSync() {
  const user = await getSessionUser()
  if (!user) return
  await enableSmartsheetWebhook()
  revalidatePath(ROUTES.support)
}
