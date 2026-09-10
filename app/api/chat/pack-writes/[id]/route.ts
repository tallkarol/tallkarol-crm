import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { chatMessages, chatToolCalls } from "@/db/schema"
import { authenticateTimeRequest, readJson, readString, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * The worker reports what happened to a claimed pack write.
 *
 *   { "file": "clients/zemvelo/relationship.md", "commit": "a1b2c3d", "changed": true }   landed
 *   { "file": "…", "commit": "", "changed": false }                                        already there
 *   { "error": "relationship.md has no \"## PROMISES\" section." }                          failed
 *
 * Only the worker holding the claim (`approved`, `result.claimedBy` equal to
 * the `worker` in the body) can settle the row; anything else is a 409, so
 * a late report from a worker whose claim went stale and was retried by
 * another cannot overwrite the retry's outcome.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const worker = readString(body, "worker")
  const call = await db.query.chatToolCalls.findFirst({
    where: and(eq(chatToolCalls.id, params.id), eq(chatToolCalls.name, "propose_pack_line")),
  })
  if (!call) return NextResponse.json({ error: "Unknown pack write." }, { status: 404 })
  if (call.status !== "approved") {
    return NextResponse.json({ error: `Already ${call.status}.` }, { status: 409 })
  }
  const claim = (call.result ?? {}) as Record<string, unknown>
  if (!worker || claim.claimedBy !== worker) {
    return NextResponse.json(
      { error: `Claimed by ${String(claim.claimedBy ?? "nobody")}, not ${worker ?? "you"}.` },
      { status: 409 }
    )
  }

  const error = readString(body, "error")
  if (error) {
    await db
      .update(chatToolCalls)
      .set({ status: "failed", ranAt: new Date(), error: error.slice(0, 2000) })
      .where(eq(chatToolCalls.id, call.id))
    revalidatePath("/chat")
    return NextResponse.json({ status: "failed" })
  }

  const file = readString(body, "file")
  if (!file) {
    return NextResponse.json({ error: "Send `file` and `commit`, or `error`." }, { status: 400 })
  }
  const outcome = {
    ...claim,
    file,
    commit: readString(body, "commit") ?? "",
    changed: body.changed !== false,
  }
  await db
    .update(chatToolCalls)
    .set({ status: "ran", ranAt: new Date(), result: outcome })
    .where(eq(chatToolCalls.id, call.id))
  await db.insert(chatMessages).values({
    threadId: call.threadId,
    role: "tool",
    agent: "propose_pack_line",
    body: JSON.stringify({ file, commit: outcome.commit, changed: outcome.changed }),
  })
  revalidatePath("/chat")
  return NextResponse.json({ status: "ran" })
}
