"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { invoices } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"

/** Edit a draft's numbers before it becomes the sent artifact. */
export async function updateInvoiceDetails(id: string, formData: FormData) {
  const user = await getSessionUser()
  if (!user) return

  const existing = await db.query.invoices.findFirst({
    where: eq(invoices.id, id),
  })
  if (!existing) return

  const number = String(formData.get("number") || "").trim()
  const issuedOn = String(formData.get("issuedOn") || "").trim()
  const amountRaw = String(formData.get("amount") || "").replace(/[$,]/g, "").trim()
  const hoursRaw = String(formData.get("hours") || "").trim()
  const billTo = String(formData.get("billTo") || "").trim()
  const description = String(formData.get("description") || "").trim()

  const amount = Number(amountRaw)
  if (!number || !/^\d{4}-\d{2}-\d{2}$/.test(issuedOn) || !Number.isFinite(amount) || amount <= 0)
    return

  if (number !== existing.number) {
    const clash = await db.query.invoices.findFirst({
      where: eq(invoices.number, number),
    })
    if (clash) return
  }

  const hours = hoursRaw === "" ? null : Number(hoursRaw)
  await db
    .update(invoices)
    .set({
      number,
      issuedOn,
      amountCents: Math.round(amount * 100),
      hours: hours != null && Number.isFinite(hours) && hours > 0 ? String(hours) : null,
      billTo,
      description,
      updatedAt: new Date(),
    })
    .where(eq(invoices.id, id))

  revalidatePath(ROUTES.invoices)
  if (number !== existing.number) redirect(ROUTES.invoice(number))
  revalidatePath(ROUTES.invoice(number))
}
