import { NextResponse } from "next/server"
import { loadWaiting } from "@/lib/waiting-data"
import { authenticateWidget, unauthorized } from "@/lib/widget-auth"

export const dynamic = "force-dynamic"

/**
 * The decision queue: every row where Karol is the bottleneck and one tap
 * moves it, ranked, in one flat array.
 *
 * ONE endpoint on purpose. Eight kinds already live behind five different
 * routes; a Mac app that wanted them would need five cases, five refresh
 * cadences and its own opinion about how to rank them against each other.
 * This is that opinion, served once — `lib/waiting.ts` owns it, and the
 * browser strip reads the same shape.
 *
 * Read-only. Every write a row offers is named in its own `verbs` array and
 * points at an endpoint that already existed; nothing here mutates anything.
 *
 * `counts` and `total` describe everything that qualified, `items` is cut to
 * `WAITING_RULES.maxItems` — so a caller can say "+9 more" instead of
 * mistaking the cap for the truth. Answers 200 with an empty `items` on a
 * clear desk; a quiet day is not a 404.
 */
export async function GET(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  return NextResponse.json(await loadWaiting(), {
    headers: { "cache-control": "no-store" },
  })
}
