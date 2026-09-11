import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { chatThreads } from "@/db/schema"
import { authenticateTimeRequest, readJson, readString, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/** The worker hands back a thread's digest: `{ "digest": "…" }`. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const digest = readString(body, "digest")
  if (!digest) return NextResponse.json({ error: "Send `digest`." }, { status: 400 })

  const [row] = await db
    .update(chatThreads)
    .set({ digest: digest.trim().slice(0, 4000), digestedAt: new Date() })
    .where(and(eq(chatThreads.id, params.id), eq(chatThreads.userId, caller.userId)))
    .returning({ id: chatThreads.id })
  if (!row) return NextResponse.json({ error: "Unknown thread." }, { status: 404 })
  return NextResponse.json({ status: "digested" })
}
