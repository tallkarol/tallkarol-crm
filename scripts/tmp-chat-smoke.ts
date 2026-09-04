import { eq } from "drizzle-orm"
import { db } from "@/db"
import { chatThreads, clients, users } from "@/db/schema"
import { budgetState, formatCents } from "@/lib/chat/budget"
import { classify } from "@/lib/chat/turns"
import {
  claimTurn,
  completeTurn,
  decideToolCall,
  escalate,
  failTurn,
  invokeTool,
  send,
  threadDetail,
} from "@/lib/chat/turns"

/** Temporary. Exercises the chat spine end to end, then deletes its thread. */

let failures = 0
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`)
}

async function main() {
  const admin = await db.query.users.findFirst({ where: eq(users.role, "admin") })
  if (!admin) throw new Error("no admin user")
  console.log(`acting as ${admin.email}\n`)

  const client = await db.query.clients.findFirst()
  const slug = client?.slug ?? "unknown"

  /* --- routing --- */
  check("classify: work history → chat", classify("what did I work on for x in june") === "chat")
  check("classify: 'why is … failing' → debug", classify("why is the UWD build still failing") === "debug")
  check("classify: security → security_review", classify("check this for xss") === "security_review")

  /* --- send --- */
  const first = await send({
    userId: admin.id,
    text: `what did I work on for ${slug} in June 2026`,
  })
  const threadId = first.threadId
  check("send queued a turn", first.turn.status === "queued")
  check("routed to the chat rung", first.turn.model === "composer-2.5", first.turn.model)
  check("billed to the cursor pool", first.turn.pool === "cursor")

  /* --- claim --- */
  const claimed = await claimTurn("smoke")
  check("worker claimed a turn", claimed?.id === first.turn.id)
  const second = await claimTurn("smoke")
  check("queue empties after claim", second === null || second.id !== first.turn.id)

  /* --- read tools --- */
  const history = await invokeTool({
    userId: admin.id,
    turnId: first.turn.id,
    name: "search_work_history",
    args: { clientSlug: slug, from: "2026-06" },
  })
  check(
    "search_work_history ran",
    history.status === "ran",
    history.status === "ran"
      ? `${(history.result as { total: number }).total} entries`
      : JSON.stringify(history)
  )

  const roster = await invokeTool({
    userId: admin.id,
    turnId: first.turn.id,
    name: "list_clients",
    args: {},
  })
  check(
    "list_clients ran",
    roster.status === "ran",
    roster.status === "ran"
      ? `${(roster.result as { clients: unknown[] }).clients.length} clients`
      : JSON.stringify(roster)
  )

  const sessions = await invokeTool({
    userId: admin.id,
    turnId: first.turn.id,
    name: "search_sessions",
    args: { q: "build" },
  })
  check(
    "search_sessions ran",
    sessions.status === "ran",
    sessions.status === "ran"
      ? `${(sessions.result as { sessions: unknown[] }).sessions.length} sessions`
      : JSON.stringify(sessions)
  )

  /* --- a write parks, it does not run --- */
  const task = await invokeTool({
    userId: admin.id,
    turnId: first.turn.id,
    name: "create_task",
    args: { title: "smoke test — delete me", clientSlug: slug },
  })
  check("create_task parked as pending", task.status === "pending")
  check(
    "preview rendered for the card",
    task.status === "pending" && Array.isArray((task.preview as { fields?: unknown[] })?.fields)
  )

  /* --- completing prices the turn --- */
  const done = await completeTurn({
    turnId: first.turn.id,
    body: "Here is what I found.",
    usage: { inputTokens: 12_000, outputTokens: 800, cacheReadTokens: 4_000, cacheWriteTokens: 0 },
  })
  // composer-2.5: 12k@$0.50 + 0.8k@$2.50 + 4k@$0.20 = $0.0088 = 0.88c
  check("turn priced from the registry", Math.abs(done.costCents - 0.88) < 0.01, `${done.costCents.toFixed(4)}c`)

  /* --- rejecting a write leaves nothing behind --- */
  const detail = await threadDetail(admin.id, threadId)
  const pending = (detail?.calls ?? []).find((c) => c.status === "pending")
  check("pending call is visible to the page", Boolean(pending))
  if (pending) {
    const rejected = await decideToolCall({
      userId: admin.id,
      callId: pending.id,
      approve: false,
    })
    check("reject settles the call", rejected.ok && rejected.call.status === "rejected")
    const again = await decideToolCall({
      userId: admin.id,
      callId: pending.id,
      approve: true,
    })
    check("a settled call cannot be re-run", !again.ok)
  }

  /* --- escalation --- */
  const debug = await send({ userId: admin.id, threadId, text: "why is the UWD build still failing" })
  check("debug routed to the top Cursor rung", debug.turn.model === "grok-4.6-xhigh", debug.turn.model)

  await failTurn(debug.turn.id, "repro still fails")
  const noDetector = await escalate(debug.turn.id, "")
  check("escalation records the detector", noDetector?.detector === "")

  const promoted = await escalate(debug.turn.id, "repro still fails")
  check("promoted a rung", promoted?.rung === 1)
  check("changed family on the way up", promoted?.model === "opus-5-max", promoted?.model ?? "none")
  check("switched pool", promoted?.pool === "other")
  check("chained back to the failed turn", promoted?.escalatedFrom === debug.turn.id)

  const spent = await escalate(promoted!.id, "still failing")
  check("ladder refuses to climb past its last rung", spent === null)

  /* --- budget --- */
  const budget = await budgetState()
  check(
    "budget ledger reads back",
    budget.other.limitCents === 40000,
    `other ${formatCents(budget.other.spentCents)}, cursor ${formatCents(budget.cursor.spentCents)}`
  )

  /* --- cleanup --- */
  await db.delete(chatThreads).where(eq(chatThreads.id, threadId))
  const gone = await threadDetail(admin.id, threadId)
  check("cascade cleaned the thread up", gone === null)

  console.log(failures === 0 ? "\nall good" : `\n${failures} failed`)
  process.exit(failures === 0 ? 0 : 1)
}

void main()
