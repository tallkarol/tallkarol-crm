import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { pushSubscriptions } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 })

  let endpoint = ""
  try {
    endpoint = String((await request.json())?.endpoint ?? "").trim()
  } catch {
    // fall through to 400
  }
  if (!endpoint) return NextResponse.json({ error: "Send the endpoint." }, { status: 400 })

  await db
    .update(pushSubscriptions)
    .set({ revokedAt: new Date() })
    .where(eq(pushSubscriptions.endpoint, endpoint))

  return NextResponse.json({ ok: true })
}
