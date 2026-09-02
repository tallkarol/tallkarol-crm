import { NextResponse } from "next/server"
import { db } from "@/db"
import { pushSubscriptions } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * A browser opting in. Session-authenticated — this is the CRM in a browser,
 * not a widget — and upserted on the endpoint so a re-subscribe is a refresh,
 * not a duplicate.
 */
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 })

  let body: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Send the subscription JSON." }, { status: 400 })
  }
  const endpoint = body.endpoint?.trim()
  const p256dh = body.keys?.p256dh
  const auth = body.keys?.auth
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: "That subscription is missing its keys." }, { status: 400 })
  }

  await db
    .insert(pushSubscriptions)
    .values({
      userId: user.id,
      endpoint,
      p256dh,
      auth,
      userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? "",
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh, auth, revokedAt: null, failCount: 0 },
    })

  return NextResponse.json({ ok: true })
}
