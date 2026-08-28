"use server"

import { revalidatePath } from "next/cache"
import { and, eq, gte } from "drizzle-orm"
import { db } from "@/db"
import { appSettings, invoices, tasks, timeEntries } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { retainerRateCents, ym } from "@/lib/engagements"
import { ROUTES } from "@/lib/nav"

/**
 * Draft this month's invoice from the timesheet. Numbering follows the house
 * conventions: NNN-M / NNN-Z sequences, GDI-YYYY-MM for GDI-style retainers.
 */
export async function draftRetainerInvoice(retainerId: string) {
  const user = await getSessionUser()
  if (!user) return

  const retainer = await db.query.retainers.findFirst({
    where: (r, { eq: e }) => e(r.id, retainerId),
    with: { client: true },
  })
  if (!retainer) return

  const now = new Date()
  const month = ym(now)
  const all = await db.select().from(invoices)
  const mine = all.filter((i) => i.retainerId === retainerId)

  // One retainer invoice per month — never double-draft.
  if (mine.some((i) => i.issuedOn.slice(0, 7) === month)) return

  const monthStart = `${month}-01`
  const entries = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.retainerId, retainerId), gte(timeEntries.occurredOn, monthStart)))
  const hours = Math.round(entries.reduce((s, e) => s + Number(e.hours), 0) * 100) / 100

  const rate = retainerRateCents(retainer, all)
  if (!rate) return
  // No hours logged: fall back to the retainer's standard month (cap hours).
  const billHours = hours > 0 ? hours : retainer.hoursPerMonth
  const amountCents = Math.round(billHours * rate)

  // Numbering: follow whatever pattern this retainer's invoices already use.
  let number: string
  const seq = mine
    .map((i) => /^(\d{3})-([A-Z])$/.exec(i.number))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(b[1]) - Number(a[1]))[0]
  if (seq) {
    number = `${String(Number(seq[1]) + 1).padStart(3, "0")}-${seq[2]}`
  } else {
    number = `${retainer.name.toUpperCase().replace(/\s+/g, "")}-${month}`
  }

  const label = now.toLocaleDateString("en-US", { month: "long", year: "numeric" })
  await db.insert(invoices).values({
    number,
    clientId: retainer.clientId,
    retainerId: retainer.id,
    issuedOn: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10),
    amountCents,
    hours: String(billHours),
    status: "draft",
    billTo: mine[0]?.billTo ?? "",
    description: `${label} hours${hours > 0 ? " — drafted from timesheet" : " — drafted at standard month"}`,
    notes: "Auto-drafted. Review number, hours, and description before sending.",
  })
  revalidatePath(ROUTES.retainers)
  revalidatePath(ROUTES.retainer(retainer.slug))
  revalidatePath(ROUTES.invoices)
}

const WRITEOFF_KEY = "billing_gap_writeoffs"

export async function writeOffGap(retainerId: string, month: string) {
  const user = await getSessionUser()
  if (!user || !/^\d{4}-\d{2}$/.test(month)) return
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, WRITEOFF_KEY),
  })
  const list: string[] = Array.isArray(row?.value) ? (row.value as string[]) : []
  const key = `${retainerId}:${month}`
  if (!list.includes(key)) list.push(key)
  await db
    .insert(appSettings)
    .values({ key: WRITEOFF_KEY, value: list, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: list, updatedAt: new Date() } })
  revalidatePath(ROUTES.retainers)
}

export async function getWriteoffs(): Promise<string[]> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, WRITEOFF_KEY),
  })
  return Array.isArray(row?.value) ? (row.value as string[]) : []
}

/** Move a task on a retainer work board; "done" flips status, else stage. */
export async function setTaskBoardStage(taskId: string, stage: string) {
  const user = await getSessionUser()
  if (!user) return
  if (stage === "done") {
    await db.update(tasks).set({ status: "done", updatedAt: new Date() }).where(eq(tasks.id, taskId))
  } else if (stage === "queue" || stage === "doing" || stage === "waiting") {
    await db
      .update(tasks)
      .set({ status: "open", boardStage: stage, updatedAt: new Date() })
      .where(eq(tasks.id, taskId))
  }
  revalidatePath(ROUTES.retainers)
  revalidatePath(ROUTES.tasks)
}
