"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { portalGrants, sessions, users } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { PORTAL_PREVIEW_COOKIE } from "@/lib/portal"

const PORTALS_PATH = "/settings/portals"

export async function addPortalGrant(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const email = String(formData.get("email") || "").trim().toLowerCase()
  const clientId = String(formData.get("clientId") || "")
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !clientId) return
  await db
    .insert(portalGrants)
    .values({ email, clientId })
    .onConflictDoNothing()
  revalidatePath(PORTALS_PATH)
}

/** Revoking the last grant also ends any live sessions for that customer. */
export async function removePortalGrant(grantId: string) {
  const user = await getSessionUser()
  if (!user) return
  const grant = await db.query.portalGrants.findFirst({
    where: eq(portalGrants.id, grantId),
  })
  if (!grant) return
  await db.delete(portalGrants).where(eq(portalGrants.id, grantId))

  const remaining = await db.query.portalGrants.findMany({
    where: eq(portalGrants.email, grant.email),
  })
  if (remaining.length === 0) {
    const customer = await db.query.users.findFirst({
      where: and(eq(users.email, grant.email), eq(users.role, "customer")),
    })
    if (customer) {
      await db.delete(sessions).where(eq(sessions.userId, customer.id))
    }
  }
  revalidatePath(PORTALS_PATH)
}

export async function previewPortal(clientId: string) {
  const user = await getSessionUser()
  if (!user) return
  cookies().set(PORTAL_PREVIEW_COOKIE, clientId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4,
  })
  redirect("/portal")
}

/** Preview several clients at once — how a multi-client contact sees it. */
export async function previewPortalCombined(clientIds: string[]) {
  const user = await getSessionUser()
  if (!user || clientIds.length === 0) return
  const rows = await db.query.clients.findMany()
  const valid = clientIds.filter((id) => rows.some((c) => c.id === id))
  if (valid.length === 0) return
  cookies().set(PORTAL_PREVIEW_COOKIE, valid.join(","), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4,
  })
  redirect("/portal")
}

export async function killPortalSessions() {
  const user = await getSessionUser()
  if (!user) return
  const customers = await db.query.users.findMany({
    where: eq(users.role, "customer"),
  })
  if (customers.length) {
    await db.delete(sessions).where(inArray(sessions.userId, customers.map((c) => c.id)))
  }
  revalidatePath(PORTALS_PATH)
}
