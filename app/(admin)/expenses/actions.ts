"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { expenses } from "@/db/schema"
import { ROUTES } from "@/lib/nav"

export async function addExpense(formData: FormData) {
  const occurredOn = String(formData.get("occurredOn") || "").trim()
  const vendor = String(formData.get("vendor") || "").trim()
  const amount = Number(String(formData.get("amount") || "").replace(/[$,]/g, ""))
  const category = String(formData.get("category") || "uncategorized")
  const clientId = String(formData.get("clientId") || "")
  const description = String(formData.get("description") || "").trim()

  if (!occurredOn || !vendor || !Number.isFinite(amount) || amount <= 0) return

  await db.insert(expenses).values({
    occurredOn,
    vendor,
    description,
    amountCents: Math.round(amount * 100),
    category,
    clientId: clientId || null,
  })
  revalidatePath(ROUTES.expenses)
}

export async function mapExpenseClient(formData: FormData) {
  const id = String(formData.get("id") || "")
  const clientId = String(formData.get("clientId") || "")
  if (!id) return
  await db
    .update(expenses)
    .set({ clientId: clientId || null, updatedAt: new Date() })
    .where(eq(expenses.id, id))
  revalidatePath(ROUTES.expenses)
}

export async function deleteExpense(formData: FormData) {
  const id = String(formData.get("id") || "")
  if (!id) return
  await db.delete(expenses).where(eq(expenses.id, id))
  revalidatePath(ROUTES.expenses)
}
