import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { sendTest } from "@/lib/notify"

export const dynamic = "force-dynamic"

/** The Settings page's button: straight to every device, no catalog. */
export async function POST() {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 })
  const report = await sendTest()
  return NextResponse.json({ ok: report.sent > 0, ...report })
}
