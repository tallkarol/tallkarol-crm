import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { SURFACE_FILTERS, WHO_FILTERS, type SurfaceFilter, type WhoFilter } from "@/lib/activity/summary/filters"
import { streamEvents } from "@/lib/activity/summary/stream"

export const dynamic = "force-dynamic"

/** The Stream's live poll: events newer than `after`, same filters as the page. Admin only. */
export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 })

  const params = new URL(request.url).searchParams
  const surface = params.get("surface")
  const who = params.get("who")
  const events = await streamEvents(
    {
      surface: SURFACE_FILTERS.includes(surface as SurfaceFilter) ? (surface as SurfaceFilter) : "all",
      who: WHO_FILTERS.includes(who as WhoFilter) ? (who as WhoFilter) : "all",
      test: params.get("test") === "1",
    },
    { afterId: Number(params.get("after")) || 0, limit: 100 }
  )
  return NextResponse.json({ events })
}
