import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { PORTAL_PREVIEW_COOKIE } from "@/lib/portal"

/**
 * The client panel's Portal link. A GET so it can open in a new tab: sets
 * the same preview cookie Settings → Client Portals sets (see
 * app/(admin)/settings/portals/actions.ts) and lands on /portal as that
 * client. Admins only; a customer session is bounced to their own portal.
 */
export async function GET(request: Request) {
  const user = await getSessionUser()
  const url = new URL(request.url)
  if (!user) return NextResponse.redirect(new URL("/login", url))
  if (user.role !== "admin") return NextResponse.redirect(new URL("/portal", url))
  const clientId = url.searchParams.get("client") ?? ""
  const row = clientId
    ? await db.query.clients.findFirst({ where: eq(clients.id, clientId), columns: { id: true } })
    : null
  if (!row) return NextResponse.redirect(new URL("/clients", url))
  cookies().set(PORTAL_PREVIEW_COOKIE, row.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 4,
  })
  return NextResponse.redirect(new URL("/portal", url))
}
