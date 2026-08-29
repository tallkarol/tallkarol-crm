"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { invoices, projects } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { readLinks } from "@/lib/engagements"
import { ROUTES } from "@/lib/nav"

/** Draft an invoice from a deliverable's fee. Number: CLIENT-LABEL, editable later. */
export async function draftDeliverableInvoice(deliverableId: string) {
  const user = await getSessionUser()
  if (!user) return

  const deliverable = await db.query.deliverables.findFirst({
    where: (d, { eq: e }) => e(d.id, deliverableId),
    with: { project: { with: { client: true } } },
  })
  if (!deliverable?.feeCents || !deliverable.project) return

  const base = `${deliverable.project.client.slug.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${deliverable.label.replace(/\s+/g, "")}`
  const existing = await db.select({ number: invoices.number }).from(invoices)
  const numbers = new Set(existing.map((r) => r.number))
  if (numbers.has(base)) return // already drafted
  const title = deliverable.title || deliverable.label

  await db.insert(invoices).values({
    number: base,
    clientId: deliverable.project.clientId,
    projectId: deliverable.projectId,
    deliverableId: deliverable.id,
    issuedOn: new Date().toISOString().slice(0, 10),
    amountCents: deliverable.feeCents,
    status: "draft",
    description: `${deliverable.label} — ${title}`,
    notes: "Auto-drafted from the deliverable. Review number and description before sending.",
  })
  revalidatePath(ROUTES.projects)
  revalidatePath(ROUTES.project(deliverable.project.slug))
  revalidatePath(ROUTES.invoices)
  revalidatePath(ROUTES.delivery)
}

export async function addProjectLink(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const projectId = String(formData.get("projectId") || "")
  const label = String(formData.get("label") || "").trim()
  let url = String(formData.get("url") || "").trim()
  if (!projectId || !label || !url) return
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`

  const project = await db.query.projects.findFirst({
    where: (p, { eq: e }) => e(p.id, projectId),
  })
  if (!project) return
  const links = [...readLinks(project.links), { label, url }]
  await db.update(projects).set({ links, updatedAt: new Date() }).where(eq(projects.id, projectId))
  revalidatePath(ROUTES.project(project.slug))
}

export async function removeProjectLink(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const projectId = String(formData.get("projectId") || "")
  const index = Number(formData.get("index"))
  const project = await db.query.projects.findFirst({
    where: (p, { eq: e }) => e(p.id, projectId),
  })
  if (!project || !Number.isInteger(index)) return
  const links = readLinks(project.links).filter((_, i) => i !== index)
  await db.update(projects).set({ links, updatedAt: new Date() }).where(eq(projects.id, projectId))
  revalidatePath(ROUTES.project(project.slug))
}
