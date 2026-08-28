"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import {
  deliverables,
  invoices,
  projects,
  tasks,
  type Cadence,
  type DeliverableStatus,
  type FeeStatus,
  type InvoiceStatus,
  type ProjectStatus,
} from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"

/**
 * Mutations behind the dashboard peek cards. Every card action lands here:
 * auth-guarded, enum-validated, and revalidating both the dashboard and the
 * entity's own pages so the row you acted on updates everywhere at once.
 */

function touch(paths: string[]) {
  for (const path of paths) revalidatePath(path)
}

const INVOICE_STATUSES: InvoiceStatus[] = ["draft", "sent", "paid"]

export async function setInvoiceStatusAction(id: string, status: InvoiceStatus) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  if (!INVOICE_STATUSES.includes(status)) {
    return { ok: false as const, error: "Bad status." }
  }
  const [row] = await db
    .update(invoices)
    .set({ status, updatedAt: new Date() })
    .where(eq(invoices.id, id))
    .returning()
  if (!row) return { ok: false as const, error: "Invoice not found." }
  touch([ROUTES.home, ROUTES.invoices, ROUTES.invoice(row.number), ROUTES.revenue])
  return { ok: true as const }
}

export async function setInvoiceNotesAction(id: string, notes: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  const [row] = await db
    .update(invoices)
    .set({ notes: notes.slice(0, 4000), updatedAt: new Date() })
    .where(eq(invoices.id, id))
    .returning()
  if (!row) return { ok: false as const, error: "Invoice not found." }
  touch([ROUTES.home, ROUTES.invoices, ROUTES.invoice(row.number)])
  return { ok: true as const }
}

const DELIVERABLE_STATUSES: DeliverableStatus[] = [
  "pending",
  "done",
  "invoiced",
  "paid",
]

export async function setDeliverableStatusAction(
  id: string,
  status: DeliverableStatus
) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  if (!DELIVERABLE_STATUSES.includes(status)) {
    return { ok: false as const, error: "Bad status." }
  }
  const [row] = await db
    .update(deliverables)
    .set({ status })
    .where(eq(deliverables.id, id))
    .returning()
  if (!row) return { ok: false as const, error: "Deliverable not found." }
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, row.projectId),
  })
  touch([ROUTES.home, ROUTES.projects, project ? ROUTES.project(project.slug) : ROUTES.projects])
  return { ok: true as const }
}

const PROJECT_STATUSES: ProjectStatus[] = [
  "waiting_on_content",
  "in_progress",
  "complete",
]
const FEE_STATUSES: FeeStatus[] = ["agreed", "deposit_paid", "paid"]

export async function setProjectStatusAction(id: string, status: ProjectStatus) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  if (!PROJECT_STATUSES.includes(status)) {
    return { ok: false as const, error: "Bad status." }
  }
  const [row] = await db
    .update(projects)
    .set({ status, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning()
  if (!row) return { ok: false as const, error: "Project not found." }
  touch([ROUTES.home, ROUTES.projects, ROUTES.project(row.slug)])
  return { ok: true as const }
}

export async function setProjectFeeStatusAction(id: string, status: FeeStatus) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  if (!FEE_STATUSES.includes(status)) {
    return { ok: false as const, error: "Bad status." }
  }
  const [row] = await db
    .update(projects)
    .set({ feeStatus: status, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning()
  if (!row) return { ok: false as const, error: "Project not found." }
  touch([ROUTES.home, ROUTES.projects, ROUTES.project(row.slug)])
  return { ok: true as const }
}

export async function setProjectNotesAction(id: string, notes: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  const [row] = await db
    .update(projects)
    .set({ notes: notes.slice(0, 4000), updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning()
  if (!row) return { ok: false as const, error: "Project not found." }
  touch([ROUTES.home, ROUTES.projects, ROUTES.project(row.slug)])
  return { ok: true as const }
}

export async function setTaskNotesAction(id: string, notes: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  const [row] = await db
    .update(tasks)
    .set({ notes: notes.slice(0, 4000), updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()
  if (!row) return { ok: false as const, error: "Task not found." }
  touch([ROUTES.home, ROUTES.tasks])
  return { ok: true as const }
}

export async function setTaskTitleAction(id: string, title: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  const trimmed = title.trim().slice(0, 300)
  if (!trimmed) return { ok: false as const, error: "A task needs a title." }
  const [row] = await db
    .update(tasks)
    .set({ title: trimmed, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()
  if (!row) return { ok: false as const, error: "Task not found." }
  touch([ROUTES.home, ROUTES.tasks])
  return { ok: true as const }
}

export async function setTaskStatusAction(id: string, done: boolean) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  const [row] = await db
    .update(tasks)
    .set({ status: done ? "done" : "open", updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()
  if (!row) return { ok: false as const, error: "Task not found." }
  touch([ROUTES.home, ROUTES.tasks])
  return { ok: true as const }
}

const CADENCES: Cadence[] = ["none", "weekly", "monthly"]

export async function setTaskCadenceAction(id: string, cadence: Cadence) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  if (!CADENCES.includes(cadence)) {
    return { ok: false as const, error: "Bad cadence." }
  }
  const [row] = await db
    .update(tasks)
    .set({ cadence, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()
  if (!row) return { ok: false as const, error: "Task not found." }
  touch([ROUTES.home, ROUTES.tasks])
  return { ok: true as const }
}

export async function setTaskDueAction(id: string, dueOn: string | null) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  if (dueOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) {
    return { ok: false as const, error: "Bad date." }
  }
  const [row] = await db
    .update(tasks)
    .set({ dueOn, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()
  if (!row) return { ok: false as const, error: "Task not found." }
  touch([ROUTES.home, ROUTES.tasks])
  return { ok: true as const }
}
