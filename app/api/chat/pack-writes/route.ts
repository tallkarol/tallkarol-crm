import { NextResponse } from "next/server"
import { and, asc, eq, isNull, or, sql } from "drizzle-orm"
import { db } from "@/db"
import { chatToolCalls } from "@/db/schema"
import { authenticateTimeRequest, readJson, readString, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * The Mac's door for pack writes.
 *
 * A `propose_pack_line` Karol approved sits at `approved` with no result.
 * POST claims the oldest one by compare-and-swap — the same idiom as the
 * turn queue — and hands back what the worker needs to render the identical
 * row and land it: the desk and pack THE CARD SHOWED (pinned in the preview
 * when the line was proposed — the thread may have been re-addressed since,
 * and the line still lands where Karol saw it would), the arguments, the
 * idempotency key the marker is made from, and the preview itself.
 *
 * A claim older than five minutes with no outcome is claimable again: a
 * worker that died mid-write leaves a row the next worker retries, and the
 * marker in the file makes the retry a no-op if the first write did land.
 */
const STALE_MS = 5 * 60_000

type Field = { label: string; value: string }

export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const worker = readString(body, "worker") ?? "unknown"
  const stale = new Date(Date.now() - STALE_MS).toISOString()

  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await db.query.chatToolCalls.findFirst({
      where: and(
        eq(chatToolCalls.status, "approved"),
        eq(chatToolCalls.name, "propose_pack_line"),
        or(isNull(chatToolCalls.result), sql`(${chatToolCalls.result}->>'claimedAt') < ${stale}`)
      ),
      orderBy: [asc(chatToolCalls.decidedAt)],
    })
    if (!next) return NextResponse.json({ write: null })

    const previous = next.result as { claimedAt?: string } | null
    const [claimed] = await db
      .update(chatToolCalls)
      .set({ result: { claimedBy: worker, claimedAt: new Date().toISOString() } })
      .where(
        and(
          eq(chatToolCalls.id, next.id),
          eq(chatToolCalls.status, "approved"),
          previous?.claimedAt
            ? sql`(${chatToolCalls.result}->>'claimedAt') = ${previous.claimedAt}`
            : isNull(chatToolCalls.result)
        )
      )
      .returning()
    if (!claimed) continue

    const fields = (claimed.preview as { fields?: Field[] } | null)?.fields ?? []
    const field = (label: string) => fields.find((f) => f.label === label)?.value ?? ""
    const agent = field("Desk")
    const pack = field("Pack")
    if (!agent || !pack) {
      // A card from before the desk and pack were pinned — refuse rather than guess.
      await db
        .update(chatToolCalls)
        .set({ status: "failed", ranAt: new Date(), error: "The card did not pin a desk and a pack; propose it again." })
        .where(eq(chatToolCalls.id, claimed.id))
      continue
    }
    return NextResponse.json({
      write: {
        id: claimed.id,
        threadId: claimed.threadId,
        agent,
        pack,
        args: claimed.args,
        idempotencyKey: claimed.idempotencyKey,
        preview: claimed.preview,
      },
    })
  }
  return NextResponse.json({ write: null })
}
