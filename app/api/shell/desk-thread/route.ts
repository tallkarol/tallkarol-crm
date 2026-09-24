import { NextResponse } from "next/server"
import { loadDeskThread } from "@/lib/chat/dock-actions"

export const dynamic = "force-dynamic"

/** The open desk thread's 3s/8s poll, as a GET — see ../clock/route.ts for why. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const result = await loadDeskThread({
    threadId: url.searchParams.get("thread") ?? "",
    agent: url.searchParams.get("agent") ?? "",
    pack: url.searchParams.get("pack") ?? "",
  })
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } })
}
