import { NextResponse } from "next/server"
import { authenticateWidget, unauthorized } from "@/lib/widget-auth"
import { widgetClient } from "@/lib/widget"

export const dynamic = "force-dynamic"

/** One client's tasks, tickets, vitals and flags — the extra-large widget. */
export async function GET(request: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  if (!authenticateWidget(request)) return unauthorized()

  const now = new Date()
  const data = await widgetClient(params.slug, now)
  if (!data) {
    return NextResponse.json({ error: "No such client." }, { status: 404 })
  }

  return NextResponse.json(
    { generatedAt: now.toISOString(), ...data },
    { headers: { "cache-control": "no-store" } }
  )
}
