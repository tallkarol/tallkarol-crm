"use server"

import { and, eq, gte, isNull, lt } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { clients, invoices, timeEntries } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import {
  hoursToString,
  invoiceNumberFor,
  monthBounds,
  monthEnd,
  monthLong,
  parseHoursInput,
  sumHours,
} from "@/lib/timesheet"
import { formatMoney } from "@/lib/work"

export type TimeEntryInput = {
  id?: string
  clientId: string
  occurredOn: string
  startedAt: string
  endedAt: string
  hours: string
  summary: string
}

function revalidateWork() {
  revalidatePath("/timesheet")
  revalidatePath("/invoices")
  revalidatePath("/retainers")
  revalidatePath("/clients")
}

function isIsoDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export async function saveTimeEntry(
  input: TimeEntryInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  if (!isIsoDay(input.occurredOn)) {
    return { ok: false, error: "Date is not valid." }
  }
  const hours = parseHoursInput(input.hours)
  if (hours == null) return { ok: false, error: "Hours must be 0–24." }

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, input.clientId),
    with: { retainers: true },
  })
  if (!client) return { ok: false, error: "Client not found." }

  const retainer =
    client.retainers.find((row) => row.status === "active") ??
    client.retainers[0] ??
    null

  const values = {
    clientId: client.id,
    retainerId: retainer?.id ?? null,
    occurredOn: input.occurredOn,
    startedAt: input.startedAt.trim(),
    endedAt: input.endedAt.trim(),
    hours: hoursToString(hours),
    summary: input.summary.trim(),
  }

  if (input.id) {
    const existing = await db.query.timeEntries.findFirst({
      where: eq(timeEntries.id, input.id),
    })
    if (!existing) return { ok: false, error: "Row not found." }
    await db.update(timeEntries).set(values).where(eq(timeEntries.id, input.id))
    revalidateWork()
    return { ok: true, id: input.id }
  }

  const [created] = await db.insert(timeEntries).values(values).returning({
    id: timeEntries.id,
  })
  revalidateWork()
  return { ok: true, id: created.id }
}

export async function deleteTimeEntry(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  await db.delete(timeEntries).where(eq(timeEntries.id, id))
  revalidateWork()
  return { ok: true }
}

export async function createInvoiceFromTimesheet(input: {
  clientId: string
  month: string
}): Promise<{ ok: true; number: string } | { ok: false; error: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!/^\d{4}-\d{2}$/.test(input.month)) {
    return { ok: false, error: "Month is not valid." }
  }

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, input.clientId),
    with: { retainers: true },
  })
  if (!client) return { ok: false, error: "Client not found." }

  const retainer =
    client.retainers.find((row) => row.status === "active") ??
    client.retainers[0] ??
    null
  const rateCents = retainer?.rateCents
  if (!retainer || rateCents == null) {
    return { ok: false, error: "Set an hourly rate on the retainer first." }
  }

  const { start, end } = monthBounds(input.month)
  const entries = await db.query.timeEntries.findMany({
    where: and(
      eq(timeEntries.clientId, client.id),
      gte(timeEntries.occurredOn, start),
      lt(timeEntries.occurredOn, end),
      isNull(timeEntries.invoiceId)
    ),
  })
  if (entries.length === 0) {
    return { ok: false, error: "No unbilled hours in this month." }
  }

  const hours = sumHours(entries.map((row) => row.hours))
  if (hours <= 0) {
    return { ok: false, error: "No unbilled hours in this month." }
  }

  const number = invoiceNumberFor(client.slug, input.month)
  const taken = await db.query.invoices.findFirst({
    where: eq(invoices.number, number),
  })
  if (taken) {
    return { ok: false, error: `${number} already exists.` }
  }

  const amountCents = Math.round(hours * rateCents)
  const hoursLabel = hoursToString(hours)
  const period = monthLong(input.month)

  await db.transaction(async (tx) => {
    const [invoice] = await tx
      .insert(invoices)
      .values({
        number,
        clientId: client.id,
        retainerId: retainer.id,
        issuedOn: monthEnd(input.month),
        amountCents,
        hours: hoursLabel,
        status: "draft",
        billTo: client.name,
        description: `${period} hours`,
        notes: `1099. ${Number(hoursLabel)} hr at ${formatMoney(rateCents)}/hr.`,
      })
      .returning({ id: invoices.id })

    await tx
      .update(timeEntries)
      .set({ invoiceId: invoice.id })
      .where(
        and(
          eq(timeEntries.clientId, client.id),
          gte(timeEntries.occurredOn, start),
          lt(timeEntries.occurredOn, end),
          isNull(timeEntries.invoiceId)
        )
      )
  })

  revalidateWork()
  return { ok: true, number }
}
