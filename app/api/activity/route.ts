import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { ingestBatch } from "@/lib/activity/ingest"
import { SESSION_COOKIE } from "@/lib/crypto"

export const dynamic = "force-dynamic"

/** Batches are small; anything larger than this is not the probe. */
const MAX_BODY_BYTES = 256_000

/**
 * The probe's beacon. Session-cookie authenticated for admins and portal
 * customers alike. Answers 204 whether or not a module kept the events — the
 * browser has nothing useful to do with the difference.
 */
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0)
  if (length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "That batch is too large." }, { status: 413 })
  }

  let body: unknown
  try {
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "That batch is too large." }, { status: 413 })
    }
    body = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "Send the batch as JSON." }, { status: 400 })
  }

  try {
    const result = await ingestBatch(body, {
      userAgent: request.headers.get("user-agent") ?? "",
      sessionToken: cookies().get(SESSION_COOKIE)?.value,
    })
    if (result.status === 204) return new NextResponse(null, { status: 204 })
    return NextResponse.json(
      { error: result.status === 401 ? "Sign in first." : "That batch has no events list." },
      { status: result.status }
    )
  } catch (err) {
    console.error("activity: ingest failed:", err instanceof Error ? err.message : err)
    return NextResponse.json({ error: "The batch could not be stored." }, { status: 500 })
  }
}
