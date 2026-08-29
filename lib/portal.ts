import { cookies } from "next/headers"
import { and, eq, gt, inArray } from "drizzle-orm"
import { db } from "@/db"
import { clients, portalGrants, sessions, users, type Client } from "@/db/schema"
import { hashToken } from "@/lib/crypto"

export const PORTAL_PREVIEW_COOKIE = "tk_portal_preview"

export type PortalScope = {
  /** admin-preview = Karol looking through a client's eyes from Settings. */
  kind: "customer" | "admin-preview" | "admin-no-preview"
  email: string
  displayName: string
  clients: Client[]
}

/** Session user of ANY role — the portal accepts customers; the CRM does not. */
async function sessionUserAnyRole() {
  const raw = cookies().get("tk_crm_session")?.value
  if (!raw) return null
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(raw)), gt(sessions.expiresAt, new Date())))
    .limit(1)
  return row?.user ?? null
}

export async function portalGrantsFor(email: string) {
  return db.query.portalGrants.findMany({
    where: eq(portalGrants.email, email.toLowerCase()),
    with: { client: true },
  })
}

/**
 * Resolve what the portal should show for this request. Customers see the
 * clients they hold grants for. Admins see whichever client the preview
 * cookie points at (set from Settings → Client Portals), with a banner.
 */
export async function getPortalScope(): Promise<PortalScope | null> {
  const user = await sessionUserAnyRole()
  if (!user) return null
  const displayName = user.name || user.email.split("@")[0]

  if (user.role === "admin") {
    const previewIds = (cookies().get(PORTAL_PREVIEW_COOKIE)?.value ?? "")
      .split(",")
      .filter(Boolean)
    if (previewIds.length === 0) {
      return { kind: "admin-no-preview", email: user.email, displayName, clients: [] }
    }
    const rows = await db.query.clients.findMany({
      where: inArray(clients.id, previewIds),
    })
    return { kind: "admin-preview", email: user.email, displayName, clients: rows }
  }

  const grants = await portalGrantsFor(user.email)
  return {
    kind: "customer",
    email: user.email,
    displayName,
    clients: grants.map((g) => g.client),
  }
}
