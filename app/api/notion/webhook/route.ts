import { createHmac, timingSafeEqual } from "node:crypto"
import { NextRequest, NextResponse } from "next/server"
import {
  getNotionWebhookToken,
  refreshPage,
  setNotionWebhookToken,
} from "@/lib/notion"

export const dynamic = "force-dynamic"

/**
 * Notion webhook callback. Two shapes arrive here:
 * 1. Verification: { verification_token } — store it, then paste it into the
 *    Notion subscription dialog (npm run notion:webhook-token prints it).
 * 2. Events: signed with X-Notion-Signature (HMAC of the raw body keyed by
 *    that same token). Page events re-mirror just the touched page.
 */
export async function POST(request: NextRequest) {
  const raw = await request.text()
  let body: Record<string, any>
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 })
  }

  if (typeof body.verification_token === "string") {
    await setNotionWebhookToken(body.verification_token)
    console.log("Notion webhook verification token captured.")
    return NextResponse.json({ ok: true })
  }

  const token = await getNotionWebhookToken()
  if (!token) {
    return NextResponse.json({ error: "Not verified yet" }, { status: 503 })
  }
  const signature = request.headers.get("x-notion-signature") ?? ""
  const expected = `sha256=${createHmac("sha256", token).update(raw).digest("hex")}`
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 })
  }

  const entity = body.entity as { id?: string; type?: string } | undefined
  if (!entity?.id || entity.type !== "page") {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const result = await refreshPage(entity.id)
  console.log(
    `Notion ${body.type}: ${result.status}${result.title ? ` — ${result.title}` : ""}`
  )
  return NextResponse.json({ ok: true, ...result })
}
