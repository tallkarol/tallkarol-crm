"use server"

import { eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { clients, type ClientStatus } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import { CLIENT_STATUSES } from "@/lib/work"

export async function updateClientNotes(
  clientId: string,
  notes: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const row = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
  })
  if (!row) return { ok: false, error: "No such client." }

  await db
    .update(clients)
    .set({ notes: notes.slice(0, 5000), updatedAt: new Date() })
    .where(eq(clients.id, clientId))

  revalidatePath(ROUTES.client(row.slug))
  return { ok: true }
}

export async function updateClientStatus(
  clientId: string,
  status: ClientStatus
): Promise<{ ok: boolean; error?: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!CLIENT_STATUSES.includes(status)) {
    return { ok: false, error: "Unknown status." }
  }

  const row = await db.query.clients.findFirst({
    where: eq(clients.id, clientId),
  })
  if (!row) return { ok: false, error: "No such client." }

  await db
    .update(clients)
    .set({ status, updatedAt: new Date() })
    .where(eq(clients.id, clientId))

  revalidatePath(ROUTES.clients)
  revalidatePath(ROUTES.client(row.slug))
  return { ok: true }
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

export async function createClient(input: {
  name: string
  status?: ClientStatus
}): Promise<{ ok: boolean; slug?: string; error?: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const name = input.name.trim()
  if (!name) return { ok: false, error: "Name is required." }

  const status = input.status ?? "new"
  if (!CLIENT_STATUSES.includes(status)) {
    return { ok: false, error: "Unknown status." }
  }

  const base = slugify(name) || "client"
  let slug = base
  for (let i = 2; i < 50; i++) {
    const taken = await db.query.clients.findFirst({
      where: eq(clients.slug, slug),
      columns: { id: true },
    })
    if (!taken) break
    slug = `${base}-${i}`
  }

  await db.insert(clients).values({ name, slug, status })
  revalidatePath(ROUTES.clients)
  return { ok: true, slug }
}
