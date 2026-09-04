"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { db } from "@/db"
import { supportTickets } from "@/db/schema"
import { getPortalScope, PORTAL_PREVIEW_COOKIE } from "@/lib/portal"

/** Portal ticket → the same queue the console works. No Smartsheet needed. */
export async function submitPortalTicket(formData: FormData) {
  const scope = await getPortalScope()
  if (!scope || scope.clients.length === 0) return

  const clientId = String(formData.get("clientId") || "")
  const client = scope.clients.find((c) => c.id === clientId) ?? scope.clients[0]
  const title = String(formData.get("title") || "").trim().slice(0, 200)
  const description = String(formData.get("description") || "").trim().slice(0, 4000)
  const priorityRaw = String(formData.get("priority") || "Medium")
  const priority = ["Medium", "High", "Urgent"].includes(priorityRaw) ? priorityRaw : "Medium"
  if (!title) return

  const year = new Date().getFullYear()
  const existing = await db.query.supportTickets.findMany({
    columns: { number: true },
  })
  const seq =
    existing
      .map((t) => /^(\d{4})-P(\d{3})$/.exec(t.number))
      .filter((m): m is RegExpExecArray => m !== null && Number(m[1]) === year)
      .reduce((max, m) => Math.max(max, Number(m[2])), 0) + 1

  await db.insert(supportTickets).values({
    source: "portal",
    externalId: crypto.randomUUID(),
    number: `${year}-P${String(seq).padStart(3, "0")}`,
    title,
    description,
    priority,
    status: "New",
    state: "open",
    submittedBy: scope.displayName,
    submittedOn: new Date().toISOString().slice(0, 10),
    contactEmail: scope.email,
    clientId: client.id,
  })
  revalidatePath("/portal/tickets")
  revalidatePath("/support")
}

export async function exitPortalPreview() {
  cookies().set(PORTAL_PREVIEW_COOKIE, "", { path: "/", maxAge: 0 })
  redirect("/settings/portals")
}
