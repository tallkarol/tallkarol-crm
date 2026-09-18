import { eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { chatMessages, chatThreads, chatTurns, clients, tasks, users } from "@/db/schema"
import { budgetState, formatCents } from "@/lib/chat/budget"
import { classify } from "@/lib/chat/turns"
import {
  claimHistory,
  claimTurn,
  completeTurn,
  decideToolCall,
  escalate,
  failTurn,
  invokeTool,
  latestThreadFor,
  send,
  staleTurnIds,
  setThreadArchived,
  threadDetail,
} from "@/lib/chat/turns"
import { CLAIM_MESSAGES } from "@/lib/chat/transcript"
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
 * It WRITES: throwaway threads and two scratch tasks, deleted on the way out
 * — in a `finally`, so a failing check cannot leave "smoke test — delete me"
 * on Karol's board. Nothing else in the schema is touched, and every write
 * tool it exercises is rejected rather than confirmed, so no time entry or
 * task is ever created. Claims are scoped to its own thread
 * (`claimTurn(…, { onlyThreadId })`), so a real queued turn is never taken.
 */

let failures = 0
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++
  console.log(`${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`)
}

/** Everything this run made, for the finally. */
const made = { threads: new Set<string>(), tasks: new Set<string>() }

async function cleanup() {
  if (made.tasks.size) await db.delete(tasks).where(inArray(tasks.id, Array.from(made.tasks)))
  if (made.threads.size) await db.delete(chatThreads).where(inArray(chatThreads.id, Array.from(made.threads)))
}

async function main() {
  const admin = await db.query.users.findFirst({ where: eq(users.role, "admin") })
  if (!admin) throw new Error("no admin user")
  console.log(`acting as ${admin.email}\n`)

  const client = await db.query.clients.findFirst()
  const slug = client?.slug ?? "unknown"
  try {
    await run(admin, client, slug)
  } finally {
    await cleanup()
  }
  console.log(failures === 0 ? "\nall good" : `\n${failures} failed`)
  process.exit(failures === 0 ? 0 : 1)
}

async function run(
  admin: { id: string; email: string },
  client: { id: string; slug: string } | undefined,
  slug: string
) {

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
    hold: "smoke",
    userId: admin.id,
    text: `what did I work on for ${slug} in June 2026`,
  })
  const threadId = first.threadId
  made.threads.add(threadId)
  check("send made a turn", first.turn.status === "queued" || first.turn.status === "claimed")
  check("routed to the chat rung", first.turn.model === "composer-2.5", first.turn.model)
  check("billed to the cursor pool", first.turn.pool === "cursor")

  check("send queued it pre-claimed for this script (`hold`)", first.turn.status === "claimed" && first.turn.claimedBy === "smoke")

  /* --- claim ---
     A real queued row races the launchd worker (it polls production every
     2.5 s), so the claim is exercised on a scratch row and reported as
     skipped, not failed, when the live worker got there first. */
  const [scratch] = await db
    .insert(chatTurns)
    .values({ threadId, messageId: first.messageId, status: "queued", claimedBy: "smoke", jobType: "chat", model: "composer-2.5", pool: "cursor", rung: 0 })
    .returning()
  const claimed = await claimTurn("smoke", { onlyThreadId: threadId })
  if (claimed?.id === scratch.id) {
    check("worker claimed a turn", true)
    check("queue empties after claim", (await claimTurn("smoke", { onlyThreadId: threadId })) === null)
  } else {
    const row = await db.query.chatTurns.findFirst({ where: eq(chatTurns.id, scratch.id) })
    console.log(`- claim skipped: the live worker (${row?.claimedBy || "?"}) took the scratch turn first`)
  }
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.id, scratch.id))

  /* --- a turn a dead worker left behind goes back on the queue --- */
  const [ghost] = await db
    .insert(chatTurns)
    .values({
      threadId,
      messageId: first.messageId,
      status: "running",
      claimedBy: "mac-ghost",
      claimedAt: new Date(Date.now() - 4 * 60_000),
      startedAt: new Date(Date.now() - 4 * 60_000),
      jobType: "chat",
      model: "composer-2.5",
      pool: "cursor",
      rung: 0,
    })
    .returning()
  // The selector, not the update: a requeued row would sit open to the live worker for a moment.
  const stale = await staleTurnIds("smoke")
  check("a stale running turn is due for requeue", stale.includes(ghost.id))
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.id, ghost.id))
  const [fresh] = await db
    .insert(chatTurns)
    .values({ threadId, messageId: first.messageId, status: "claimed", claimedBy: "mac-alive", claimedAt: new Date(), jobType: "chat", model: "composer-2.5", pool: "cursor", rung: 0 })
    .returning()
  check("a turn claimed a moment ago is left alone", !(await staleTurnIds("smoke")).includes(fresh.id))
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.id, fresh.id))

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
  made.tasks.add(rescheduleScratch)
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

  /* --- completing prices the turn, once, and only from the claimant --- */
  const impostor = await completeTurn({ turnId: first.turn.id, body: "not mine", worker: "someone-else" })
  check("a report from another worker is refused", !impostor.ok, impostor.ok ? "" : impostor.reason)
  const done = await completeTurn({
    turnId: first.turn.id,
    body: "Here is what I found.",
    worker: "smoke",
    usage: { inputTokens: 12_000, outputTokens: 800, cacheReadTokens: 4_000, cacheWriteTokens: 0 },
  })
  // composer-2.5: 12k@$0.50 + 0.8k@$2.50 + 4k@$0.20 = $0.0088 = 0.88c
  check("turn priced from the registry", done.ok && Math.abs(done.costCents - 0.88) < 0.01, done.ok ? `${done.costCents.toFixed(4)}c` : done.reason)
  const twice = await completeTurn({ turnId: first.turn.id, body: "Here it is again.", worker: "smoke" })
  check("a second report is refused, not double-posted", !twice.ok)
  check("an error after a success cannot flip the turn", (await failTurn(first.turn.id, "late", "smoke")) === false)
  const replies = (await threadDetail(admin.id, threadId))?.messages.filter((m) => m.role === "assistant" && m.turnId === first.turn.id) ?? []
  check("exactly one reply for the turn", replies.length === 1, String(replies.length))

  /* --- the claim carries the newest rows, the answered message among them --- */
  await db.insert(chatMessages).values(
    Array.from({ length: CLAIM_MESSAGES + 5 }, (_, i) => ({
      threadId,
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      agent: i % 2 === 0 ? "Karol" : "Assistant",
      body: `filler ${i}`,
    }))
  )
  const late = await send({ hold: "smoke", userId: admin.id, threadId, text: "and the newest question?" })
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.id, late.turn.id))
  const carried = await claimHistory(threadId, late.messageId)
  check(`claim carries at most ${CLAIM_MESSAGES} spoken rows`, carried.length <= CLAIM_MESSAGES, String(carried.length))
  check("the newest message is the last one in the claim", carried[carried.length - 1]?.id === late.messageId)
  check("no tool or system rows in the claim", carried.every((m) => m.role === "user" || m.role === "assistant"))

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
  // A different pending card than the one just rejected — that row is settled.
  const twoAtOnce = (detail?.calls ?? []).filter((c) => c.status === "pending" && c.id !== pending?.id)[0]
  if (twoAtOnce) {
    const race = await Promise.all([
      decideToolCall({ userId: admin.id, callId: twoAtOnce.id, approve: false }),
      decideToolCall({ userId: admin.id, callId: twoAtOnce.id, approve: false }),
    ])
    check("two decisions at once: exactly one lands", race.filter((r) => r.ok).length === 1)
  }

  /* --- escalation --- */
  const debug = await send({ hold: "smoke", userId: admin.id, threadId, text: "why is the UWD build still failing" })
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
  made.tasks.add(tmpTask)
  const started = await startTaskThread(admin.id, tmpTask)
  made.threads.add(started.threadId)
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
  const followUp = await send({ hold: "smoke", userId: admin.id, threadId: started.threadId, text: "try the other approach" })
  check("follow-up stays on the task ladder", followUp.turn.jobType === "task", followUp.turn.jobType)
  const cmd = await send({ hold: "smoke", userId: admin.id, threadId: started.threadId, text: "/clock status" })
  check("a /command still wins inside a task thread", cmd.turn.jobType === "skill", cmd.turn.jobType)
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.threadId, started.threadId))
  const state = await threadForTask(tmpTask)
  check("card reads the thread back", state?.threadId === started.threadId && state.latest !== null && !state.replied)
  check("plain thread untouched by the rule", first.turn.jobType === "chat")
  await db.delete(chatThreads).where(eq(chatThreads.taskId, tmpTask))
  await db.delete(tasks).where(eq(tasks.id, tmpTask))
  check("task thread cleaned up", (await threadForTask(tmpTask)) === null)

  /* --- a thread addressed to a desk --- */
  const coach = await send({ hold: "smoke", userId: admin.id, text: "@coach how am I doing this week" })
  made.threads.add(coach.threadId)
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
  // The turn was parked as cancelled above; take it back as a claim so a report may land.
  await db.update(chatTurns).set({ status: "claimed", claimedBy: "smoke" }).where(eq(chatTurns.id, coach.turn.id))
  const replied = await completeTurn({ turnId: coach.turn.id, body: "Thin week. Say no if Monday still stands.", agent: "Coach", worker: "smoke" })
  if (!replied.ok) throw new Error(`could not complete the coach turn: ${replied.reason}`)
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
    hold: "smoke",
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
  const plain = await send({ hold: "smoke", userId: admin.id, threadId: coach.threadId, text: "and what is due?" })
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.threadId, coach.threadId))
  check("the thread keeps its desk", plain.turn.jobType === "persona", plain.turn.jobType)
  const po = await send({
    hold: "smoke",
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
  /* --- the dock addresses a desk without the grammar, and continues its latest thread --- */
  const docked = await send({
    hold: "smoke",
    userId: admin.id,
    text: "what's due before the call?",
    desk: { agent: "client-manager", pack: `clients/${slug}` },
  })
  made.threads.add(docked.threadId)
  await db.update(chatTurns).set({ status: "cancelled" }).where(eq(chatTurns.threadId, docked.threadId))
  const dockedThread = await db.query.chatThreads.findFirst({ where: eq(chatThreads.id, docked.threadId) })
  check(
    "the dock's send pins desk, pack and client",
    dockedThread?.agent === "client-manager" && dockedThread.pack === `clients/${slug}` && dockedThread.clientId === (client?.id ?? null) && dockedThread.title === "what's due before the call?",
    `${dockedThread?.agent} ${dockedThread?.pack}`
  )
  const latest = await latestThreadFor(admin.id, "client-manager", `clients/${slug}`)
  check("latestThreadFor finds the dock's thread", latest?.id === docked.threadId)
  let wrongKind = false
  try {
    await send({ hold: "smoke", userId: admin.id, threadId: docked.threadId, text: "x", desk: { agent: "product-owner", pack: `clients/${slug}` } })
  } catch {
    wrongKind = true
  }
  check("a desk cannot be pinned to a pack of the wrong kind", wrongKind)
  await db.delete(chatThreads).where(eq(chatThreads.id, docked.threadId))

  const cmd2 = await send({ hold: "smoke", userId: admin.id, threadId: coach.threadId, text: "/clock status" })
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

  /* --- archiving settles what was still parked --- */
  const parkedLate = await invokeTool({
    userId: admin.id,
    turnId: late.turn.id,
    name: "create_task",
    args: { title: "smoke test — delete me", clientSlug: slug },
  })
  check("a card parks before the archive test", parkedLate.status === "pending")
  const archived = await setThreadArchived(admin.id, threadId, true)
  check("archiving skips the parked card", archived.skipped >= 1, String(archived.skipped))
  const afterArchive = await threadDetail(admin.id, threadId)
  check(
    "no card left pending in an archived thread",
    (afterArchive?.calls ?? []).every((c) => c.status !== "pending")
  )

  /* --- cleanup (the finally does it; this proves the cascade) --- */
  await db.delete(chatThreads).where(eq(chatThreads.id, threadId))
  made.threads.delete(threadId)
  const gone = await threadDetail(admin.id, threadId)
  check("cascade cleaned the thread up", gone === null)
}

main().catch(async (err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err))
  await cleanup().catch(() => {})
  process.exit(1)
})
