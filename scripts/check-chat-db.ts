import { eq } from "drizzle-orm"
import { db } from "@/db"
import { chatThreads, chatTurns, clients, tasks, users } from "@/db/schema"
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
import { leaveFeedback } from "@/lib/chat/feedback"
import { startTaskThread, threadForTask } from "@/lib/chat/task-thread"
import { PERSONAL_CALENDAR_ID, pickCalendarSource } from "@/lib/calendar-write"
import { insertTaskRow } from "@/lib/task-insert"

/**
 * The chat spine, against a real database.
 *
 *   npm run check:chat:db
 *
 * Routing, claiming, both kinds of tool, pricing, approval and the escalation
 * chain — the parts that only fail once Postgres is involved, which no amount
 * of typechecking catches.
 *
 * It WRITES: one throwaway thread, deleted on the way out along with
 * everything that cascades from it. Nothing else in the schema is touched, and
 * the one write tool it exercises is rejected rather than confirmed, so no
 * time entry or task is ever created.
 */

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

  const calendars = [
    { kind: "google", enabled: true, writable: false, label: "Personal", externalId: PERSONAL_CALENDAR_ID },
    { kind: "google", enabled: true, writable: true, label: "Remote", externalId: "karol.remote@gmail.com" },
    { kind: "cal_com", enabled: true, writable: false, label: "Cal.com bookings", externalId: "" },
  ]
  const dest = pickCalendarSource(calendars, null)
  const personal = pickCalendarSource(calendars, "personal")
  const remote = pickCalendarSource(calendars, "Remote")
  check("pickCalendar: empty hint is the destination", !("error" in dest) && dest.source.label === "Remote")
  check(
    "pickCalendar: personal alias hits gmail",
    !("error" in personal) && personal.source.externalId === PERSONAL_CALENDAR_ID
  )
  check("pickCalendar: remote by label", !("error" in remote) && remote.source.label === "Remote")
  check("pickCalendar: unknown is an error, not a silent destination", "error" in pickCalendarSource(calendars, "Outlook"))

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

  const inbox = await invokeTool({
    userId: admin.id,
    turnId: first.turn.id,
    name: "list_inbox",
    args: { lens: "all" },
  })
  check(
    "list_inbox ran",
    inbox.status === "ran",
    inbox.status === "ran"
      ? `${(inbox.result as { items: unknown[] }).items.length} items`
      : JSON.stringify(inbox)
  )

  const leftover = await invokeTool({
    userId: admin.id,
    turnId: first.turn.id,
    name: "list_leftoff",
    args: {},
  })
  check(
    "list_leftoff ran",
    leftover.status === "ran",
    leftover.status === "ran"
      ? `${(leftover.result as { notes: unknown[] }).notes.length} notes`
      : JSON.stringify(leftover)
  )

  const peek = await invokeTool({
    userId: admin.id,
    turnId: first.turn.id,
    name: "peek_agent_mailbox",
    args: { limit: 5 },
  })
  check(
    "peek_agent_mailbox ran",
    peek.status === "ran",
    peek.status === "ran"
      ? (peek.result as { configured?: boolean; error?: string }).configured
        ? `${(peek.result as { messages: unknown[] }).messages.length} headers`
        : (peek.result as { error?: string }).error ?? "token missing"
      : JSON.stringify(peek)
  )

  /* --- a site name has to become a slug, and a wrong slug fails before the card --- */
  const siteList = await invokeTool({ userId: admin.id, turnId: first.turn.id, name: "list_sites", args: {} })
  check(
    "list_sites ran",
    siteList.status === "ran",
    siteList.status === "ran" ? `${(siteList.result as { sites: unknown[] }).sites.length} sites` : JSON.stringify(siteList)
  )
  const wrongSite = await invokeTool({
    userId: admin.id,
    turnId: first.turn.id,
    name: "refresh_insights",
    args: { siteSlug: "my-custom-manufacturer" },
  })
  check(
    "an unknown site slug fails before approval, with a suggestion",
    wrongSite.status === "failed" && /did you mean|list_sites/.test(JSON.stringify(wrongSite)),
    JSON.stringify(wrongSite).slice(0, 160)
  )

  /* --- a write parks, it does not run --- */
  const task = await invokeTool({
    userId: admin.id,
    turnId: first.turn.id,
    name: "create_task",
    args: { title: "smoke test — delete me", clientSlug: slug },
  })
  check("create_task parked as pending", task.status === "pending")

  const calEvent = await invokeTool({
    userId: admin.id,
    turnId: first.turn.id,
    name: "create_calendar_event",
    args: {
      title: "smoke test — delete me",
      startsAt: "2026-09-07T10:00",
      calendar: "personal",
    },
  })
  check("create_calendar_event parked as pending", calEvent.status === "pending")
  check(
    "calendar preview names Personal",
    calEvent.status === "pending" &&
      JSON.stringify(calEvent.preview).includes("Personal")
  )
  check(
    "preview rendered for the card",
    task.status === "pending" && Array.isArray((task.preview as { fields?: unknown[] })?.fields)
  )

  const rescheduleScratch = await insertTaskRow(db, {
    title: "smoke test — delete me",
    userId: admin.id,
    target: {
      clientId: client?.id ?? null,
      projectId: null,
      productId: null,
      retainerId: null,
      deliverableId: null,
    },
    source: "manual",
  })
  const reschedule = await invokeTool({
    userId: admin.id,
    turnId: first.turn.id,
    name: "reschedule_task",
    args: { taskId: rescheduleScratch, dueOn: "2026-12-25" },
  })
  check("reschedule_task parked as pending", reschedule.status === "pending")
  check(
    "reschedule preview shows the new due date",
    reschedule.status === "pending" && JSON.stringify(reschedule.preview).includes("2026-12-25")
  )
  await db.delete(tasks).where(eq(tasks.id, rescheduleScratch))

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
  // The promoted turn is a real queued row on an Other-pool model. A live
  // worker polls this database; park it before one spends Opus on a smoke test.
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.threadId, threadId))

  /* --- a task taken into chat --- */
  const tmpTask = await insertTaskRow(db, {
    title: "smoke solve — delete me",
    userId: admin.id,
    target: {
      clientId: client?.id ?? null,
      projectId: null,
      productId: null,
      retainerId: null,
      deliverableId: null,
    },
    notes: "Throwaway row from check:chat:db.",
    source: "manual",
  })
  const started = await startTaskThread(admin.id, tmpTask)
  // Park the turn before a live worker can claim it and cut a worktree for a smoke test.
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.threadId, started.threadId))
  const taskThread = await threadDetail(admin.id, started.threadId)
  check("task thread remembers its task", taskThread?.thread.taskId === tmpTask)
  check(
    "task thread scoped to the task's client",
    (taskThread?.thread.clientId ?? null) === (client?.id ?? null)
  )
  check("first message is the brief", taskThread?.messages[0]?.body.startsWith("Solve: ") === true)
  check("thread titled from the brief", taskThread?.thread.title.startsWith("Solve: ") === true)
  check("first turn runs on the task ladder", taskThread?.turns[0]?.jobType === "task", taskThread?.turns[0]?.jobType)
  check("task ladder's rung", taskThread?.turns[0]?.model === "grok-4.6-high", taskThread?.turns[0]?.model)
  const again = await startTaskThread(admin.id, tmpTask)
  check("second click lands in the same thread", again.threadId === started.threadId && !again.created)
  const followUp = await send({ userId: admin.id, threadId: started.threadId, text: "try the other approach" })
  check("follow-up stays on the task ladder", followUp.turn.jobType === "task", followUp.turn.jobType)
  const cmd = await send({ userId: admin.id, threadId: started.threadId, text: "/clock status" })
  check("a /command still wins inside a task thread", cmd.turn.jobType === "skill", cmd.turn.jobType)
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.threadId, started.threadId))
  const state = await threadForTask(tmpTask)
  check("card reads the thread back", state?.threadId === started.threadId && state.latest !== null && !state.replied)
  check("plain thread untouched by the rule", first.turn.jobType === "chat")
  await db.delete(chatThreads).where(eq(chatThreads.taskId, tmpTask))
  await db.delete(tasks).where(eq(tasks.id, tmpTask))
  check("task thread cleaned up", (await threadForTask(tmpTask)) === null)

  /* --- a thread addressed to a desk --- */
  const coach = await send({ userId: admin.id, text: "@coach how am I doing this week" })
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.threadId, coach.threadId))
  const addressed = await db.query.chatThreads.findFirst({ where: eq(chatThreads.id, coach.threadId) })
  check(
    "@coach addresses the thread, pins me, marks it private",
    addressed?.agent === "coach" && addressed.pack === "me" && addressed.private === true
  )
  check("the coach runs on the writing ladder", coach.turn.jobType === "writing", coach.turn.jobType)
  check("the address is not the title", addressed?.title === "how am I doing this week", addressed?.title)

  /* --- a pack line parks for the Mac; it is rejected here, never approved --- */
  const journal = await invokeTool({
    userId: admin.id,
    turnId: coach.turn.id,
    name: "propose_pack_line",
    args: { target: "journal", line: "smoke test — delete me" },
  })
  check("propose_pack_line parks as pending", journal.status === "pending", JSON.stringify(journal).slice(0, 160))
  check(
    "the card names the journal file and the row",
    journal.status === "pending" &&
      JSON.stringify(journal.preview).includes("journal/") &&
      JSON.stringify(journal.preview).includes("smoke test — delete me")
  )
  const wrong = await invokeTool({
    userId: admin.id,
    turnId: coach.turn.id,
    name: "propose_pack_line",
    args: { target: "decision", decision: "x", why: "y" },
  })
  check("a target the desk may not write fails visibly", wrong.status === "failed", JSON.stringify(wrong).slice(0, 160))
  const coachDetail = await threadDetail(admin.id, coach.threadId)
  const parked = (coachDetail?.calls ?? []).find((c) => c.status === "pending")
  const settled = parked ? await decideToolCall({ userId: admin.id, callId: parked.id, approve: false }) : null
  check("rejected before the Mac could land it", settled?.ok === true && settled.call.status === "rejected")

  /* --- feedback lands on the reply, filed under the desk --- */
  const replied = await completeTurn({ turnId: coach.turn.id, body: "Thin week. Say no if Monday still stands.", agent: "Coach" })
  const fb = await leaveFeedback({ userId: admin.id, messageId: replied.messageId, kind: "down", note: "smoke — too terse" })
  check("feedback carries the desk and pack", fb.agent === "coach" && fb.pack === "me" && fb.kind === "down")
  let refusedUser = false
  try {
    await leaveFeedback({ userId: admin.id, messageId: coach.messageId, kind: "example", note: "" })
  } catch {
    refusedUser = true
  }
  check("feedback on Karol's own message is refused", refusedUser)

  /* --- a handoff only along an edge --- */
  const noEdge = await invokeTool({
    userId: admin.id,
    turnId: coach.turn.id,
    name: "route_to",
    args: { desk: "copywriter", brief: "smoke — delete me" },
  })
  check("coach cannot hand to anyone", noEdge.status === "failed", JSON.stringify(noEdge).slice(0, 120))
  const handed = await send({
    userId: admin.id,
    threadId: coach.threadId,
    text: `@client-manager ${slug} what did we promise them`,
  })
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.threadId, coach.threadId))
  const switched = await db.query.chatThreads.findFirst({ where: eq(chatThreads.id, coach.threadId) })
  check(
    "switching desks pins the client pack and drops private",
    switched?.agent === "client-manager" &&
      switched.pack === `clients/${slug}` &&
      switched.clientId === (client?.id ?? null) &&
      switched.private === false,
    `${switched?.agent} ${switched?.pack}`
  )
  check("still on the persona ladder", handed.turn.jobType === "persona", handed.turn.jobType)
  const toPm = await invokeTool({
    userId: admin.id,
    turnId: handed.turn.id,
    name: "route_to",
    args: { desk: "pm", brief: "smoke — they need a build by the 20th; delete me" },
  })
  check("client manager hands to the pm, parked", toPm.status === "pending", JSON.stringify(toPm).slice(0, 160))
  check(
    "the handoff card carries the pack",
    toPm.status === "pending" && JSON.stringify(toPm.preview).includes(`${slug} (client)`)
  )
  const handoffCall = (await threadDetail(admin.id, coach.threadId))?.calls.find((c) => c.name === "route_to" && c.status === "pending")
  if (handoffCall) {
    const dropped = await decideToolCall({ userId: admin.id, callId: handoffCall.id, approve: false })
    check("handoff rejected, no thread opened", dropped.ok && dropped.call.status === "rejected")
  }
  const plain = await send({ userId: admin.id, threadId: coach.threadId, text: "and what is due?" })
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.threadId, coach.threadId))
  check("the thread keeps its desk", plain.turn.jobType === "persona", plain.turn.jobType)
  const po = await send({
    userId: admin.id,
    threadId: coach.threadId,
    text: "/as product-owner nosuchproduct what comes next",
  })
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.threadId, coach.threadId))
  const unpinned = await db.query.chatThreads.findFirst({ where: eq(chatThreads.id, coach.threadId) })
  check(
    "an unknown slug leaves a different-kind desk unpinned",
    unpinned?.agent === "product-owner" && unpinned.pack === "",
    `${unpinned?.agent} "${unpinned?.pack}"`
  )
  check("the product owner runs on judgment", po.turn.jobType === "judgment", po.turn.jobType)
  const cmd2 = await send({ userId: admin.id, threadId: coach.threadId, text: "/clock status" })
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.threadId, coach.threadId))
  check("a /command still wins inside a desk thread", cmd2.turn.jobType === "skill", cmd2.turn.jobType)
  await db.delete(chatThreads).where(eq(chatThreads.id, coach.threadId))

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
