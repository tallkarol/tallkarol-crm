import { and, asc, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  chatMessages,
  chatThreads,
  chatToolCalls,
  chatTurns,
} from "@/db/schema"
import type { ChatToolCall, ChatTurn } from "@/db/schema"
import { budgetState, gate } from "@/lib/chat/budget"
import {
  ladderFor,
  modelFor,
  nextRung,
  priceCents,
  type JobType,
  type ModelKey,
  type TokenUsage,
} from "@/lib/chat/models"
import { toolByName, type ToolContext } from "@/lib/chat/tools"

/**
 * The life of a turn.
 *
 * A user message queues one. The CRM picks the model BEFORE queueing, so the
 * routing decision, the budget gate and the ladder position are all recorded
 * whether or not a worker ever shows up. The worker claims the row, runs the
 * agent through the Cursor SDK, and posts the result back — see CHAT.md and
 * scripts/chat-worker.ts.
 *
 * Escalation appends a turn rather than mutating one, so the ladder trace in
 * the UI is the billing record read in order.
 */

/* ---------- routing ---------- */

const RULES: { job: JobType; test: RegExp }[] = [
  { job: "debug", test: /\b(debug|why is|root cause|still failing|broken since)\b/i },
  { job: "build_fix", test: /\b(build|compile|bundler|dependency|npm run)\b.*\b(fail|broke|broken|red|error)\b/i },
  { job: "code_tested", test: /\b(implement|add|build|refactor|fix)\b.*\b(feature|component|endpoint|block|page|calculator|form)\b/i },
  { job: "security_review", test: /\b(security|vulnerab|xss|csrf|injection|secrets?)\b/i },
  { job: "review_critical", test: /\breview\b.*\b(before (we )?(ship|merge|deploy)|production|prod)\b/i },
  { job: "review", test: /\b(review|look over|check my)\b/i },
  { job: "architecture", test: /\b(architecture|design (the|a) system|plan the|approach for)\b/i },
  { job: "writing", test: /\b(draft|write|rewrite|post|article|copy)\b/i },
  { job: "content_edit", test: /\b(edit|update|reword|tweak)\b.*\b(copy|page|content|wording)\b/i },
  { job: "report", test: /\b(report|insights|analytics)\b.*\b(run|generate|refresh|monthly)\b/i },
]

/**
 * Which ladder a request belongs on.
 *
 * Deliberately a keyword pass, not a model call: routing runs on every
 * message, and spending a model to decide which model to spend is the kind of
 * overhead this whole design exists to avoid. It biases to `chat`, which is
 * the cheapest rung and never escalates, so a miss costs almost nothing and
 * shows up as a bad answer rather than a bad bill.
 */
export function classify(text: string): JobType {
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.job
  }
  return "chat"
}

export type Routing = {
  job: JobType
  rung: number
  model: ModelKey
  /** Set when the budget gate moved us off the model the ladder asked for. */
  downgradedFrom?: ModelKey
  notice?: string
}

/** Pick the rung, then let the budget have the last word. */
export async function route(
  job: JobType,
  rung = 0,
  opts: { escalation?: boolean } = {}
): Promise<Routing> {
  const ladder = ladderFor(job)
  const want = ladder.rungs[rung] ?? ladder.rungs[0]
  const budget = await budgetState()
  const decision = gate(want, budget, opts)

  if (decision.allowed) return { job, rung, model: want }
  return {
    job,
    rung,
    model: decision.fallback,
    downgradedFrom: want,
    notice: decision.reason,
  }
}

/* ---------- threads ---------- */

export async function ensureThread(
  userId: string,
  threadId?: string | null
): Promise<string> {
  if (threadId) {
    const existing = await db.query.chatThreads.findFirst({
      where: and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)),
    })
    if (existing) return existing.id
  }
  const [row] = await db
    .insert(chatThreads)
    .values({ userId, title: "" })
    .returning({ id: chatThreads.id })
  return row.id
}

/** First thing said becomes the thread's name, trimmed to something listable. */
function titleFrom(text: string): string {
  const line = text.trim().split("\n")[0] ?? ""
  return line.length > 72 ? `${line.slice(0, 71)}…` : line
}

/* ---------- sending ---------- */

export type SendResult = {
  threadId: string
  messageId: string
  turn: ChatTurn
  routing: Routing
}

export async function send(input: {
  userId: string
  threadId?: string | null
  text: string
}): Promise<SendResult> {
  const text = input.text.trim()
  if (!text) throw new Error("Nothing to send.")

  const threadId = await ensureThread(input.userId, input.threadId)
  const job = classify(text)
  const routing = await route(job, 0)
  const spec = modelFor(routing.model)

  const [message] = await db
    .insert(chatMessages)
    .values({ threadId, role: "user", agent: "Karol", body: text })
    .returning()

  const [turn] = await db
    .insert(chatTurns)
    .values({
      threadId,
      messageId: message.id,
      status: "queued",
      jobType: job,
      model: routing.model,
      effort: spec.effort,
      pool: spec.pool,
      fast: false, // never for queued work — Composer Fast is a 6x tax
      rung: routing.rung,
    })
    .returning()

  await db
    .update(chatThreads)
    .set({
      lastMessageAt: new Date(),
      title: sql`case when ${chatThreads.title} = '' then ${titleFrom(text)} else ${chatThreads.title} end`,
    })
    .where(eq(chatThreads.id, threadId))

  return { threadId, messageId: message.id, turn, routing }
}

/* ---------- the worker's side ---------- */

/**
 * Oldest queued turn, claimed by compare-and-swap: the update only lands if
 * the row is still `queued`, so two workers racing produce one winner and one
 * empty result. The loser retries and takes the next one — cheaper than
 * holding a transaction open across the poll.
 */
export async function claimTurn(worker: string): Promise<ChatTurn | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const next = await db.query.chatTurns.findFirst({
      where: eq(chatTurns.status, "queued"),
      orderBy: [asc(chatTurns.createdAt)],
      columns: { id: true },
    })
    if (!next) return null

    const [claimed] = await db
      .update(chatTurns)
      .set({ status: "claimed", claimedBy: worker, claimedAt: new Date() })
      .where(and(eq(chatTurns.id, next.id), eq(chatTurns.status, "queued")))
      .returning()

    if (claimed) return claimed
  }
  return null
}

export async function markRunning(turnId: string) {
  await db
    .update(chatTurns)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(chatTurns.id, turnId))
}

export type ToolInvocation =
  | { status: "ran"; result: unknown }
  | { status: "pending"; preview: unknown; message: string }
  | { status: "failed"; error: string }

/**
 * A tool the model called, arriving from the worker mid-run.
 *
 * Reads execute here and hand the data straight back. Writes do NOT: they
 * park at `pending` and the model is told so, which is the honest answer —
 * the write really has not happened and will not until Karol confirms. The
 * model can then say so in its reply instead of claiming it filed something.
 */
export async function invokeTool(input: {
  userId: string
  turnId: string
  name: string
  args: Record<string, unknown>
}): Promise<ToolInvocation> {
  const turn = await db.query.chatTurns.findFirst({
    where: eq(chatTurns.id, input.turnId),
  })
  if (!turn) return { status: "failed", error: "Unknown turn." }

  const spec = toolByName(input.name)
  if (!spec) return { status: "failed", error: `No tool named ${input.name}.` }

  const [row] = await db
    .insert(chatToolCalls)
    .values({
      threadId: turn.threadId,
      turnId: turn.id,
      name: spec.name,
      args: input.args,
      mutating: spec.mutating,
      status: spec.mutating ? "pending" : "ran",
    })
    .returning()

  if (spec.mutating) {
    const ctx: ToolContext = {
      userId: input.userId,
      threadId: turn.threadId,
      idempotencyKey: row.idempotencyKey,
    }
    const preview = spec.preview ? await spec.preview(input.args, ctx) : null
    await db
      .update(chatToolCalls)
      .set({ preview })
      .where(eq(chatToolCalls.id, row.id))
    return {
      status: "pending",
      preview,
      message:
        "Proposed, not done. Karol sees a preview and has to confirm it. Tell him what you are about to write and stop.",
    }
  }

  try {
    const result = await spec.run(input.args, {
      userId: input.userId,
      threadId: turn.threadId,
      idempotencyKey: row.idempotencyKey,
    })
    await db
      .update(chatToolCalls)
      .set({ result: result as never, ranAt: new Date() })
      .where(eq(chatToolCalls.id, row.id))
    return { status: "ran", result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(chatToolCalls)
      .set({ status: "failed", error: message.slice(0, 2000) })
      .where(eq(chatToolCalls.id, row.id))
    return { status: "failed", error: message }
  }
}

/** The worker posts the assistant's reply and what the run cost. */
export async function completeTurn(input: {
  turnId: string
  body: string
  usage?: Partial<TokenUsage>
}) {
  const turn = await db.query.chatTurns.findFirst({
    where: eq(chatTurns.id, input.turnId),
  })
  if (!turn) throw new Error("Unknown turn.")

  const usage: TokenUsage = {
    inputTokens: input.usage?.inputTokens ?? 0,
    outputTokens: input.usage?.outputTokens ?? 0,
    cacheReadTokens: input.usage?.cacheReadTokens ?? 0,
    cacheWriteTokens: input.usage?.cacheWriteTokens ?? 0,
  }
  const cents = priceCents(turn.model as ModelKey, usage)

  const [message] = await db
    .insert(chatMessages)
    .values({
      threadId: turn.threadId,
      role: "assistant",
      agent: "Assistant",
      body: input.body,
      turnId: turn.id,
    })
    .returning()

  await db
    .update(chatTurns)
    .set({
      status: "done",
      finishedAt: new Date(),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      costCents: cents.toFixed(4),
    })
    .where(eq(chatTurns.id, turn.id))

  await db
    .update(chatThreads)
    .set({ lastMessageAt: new Date() })
    .where(eq(chatThreads.id, turn.threadId))

  return { messageId: message.id, costCents: cents }
}

export async function failTurn(turnId: string, error: string) {
  await db
    .update(chatTurns)
    .set({ status: "failed", finishedAt: new Date(), error: error.slice(0, 2000) })
    .where(eq(chatTurns.id, turnId))
}

/**
 * Promote a failed turn one rung.
 *
 * Only a detector may call this. A turn that never executed — auth, config,
 * a dropped connection — is not evidence the model was too small, so the
 * worker retries the same rung instead and this is not reached.
 */
export async function escalate(
  turnId: string,
  detector: string
): Promise<ChatTurn | null> {
  const turn = await db.query.chatTurns.findFirst({
    where: eq(chatTurns.id, turnId),
  })
  if (!turn) return null

  const job = turn.jobType as JobType
  const next = nextRung(job, turn.rung)
  if (!next) return null

  const routing = await route(job, turn.rung + 1, { escalation: true })
  const spec = modelFor(routing.model)

  const [created] = await db
    .insert(chatTurns)
    .values({
      threadId: turn.threadId,
      messageId: turn.messageId,
      status: "queued",
      jobType: job,
      model: routing.model,
      effort: spec.effort,
      pool: spec.pool,
      fast: false,
      rung: turn.rung + 1,
      escalatedFrom: turn.id,
      detector: detector.slice(0, 200),
    })
    .returning()

  return created
}

/* ---------- approvals ---------- */

export type ApprovalOutcome =
  | { ok: true; call: ChatToolCall; result: unknown }
  | { ok: false; error: string }

export async function decideToolCall(input: {
  userId: string
  callId: string
  approve: boolean
}): Promise<ApprovalOutcome> {
  const call = await db.query.chatToolCalls.findFirst({
    where: eq(chatToolCalls.id, input.callId),
  })
  if (!call) return { ok: false, error: "Unknown tool call." }
  if (call.status !== "pending") {
    return { ok: false, error: `Already ${call.status}.` }
  }

  const thread = await db.query.chatThreads.findFirst({
    where: and(
      eq(chatThreads.id, call.threadId),
      eq(chatThreads.userId, input.userId)
    ),
  })
  if (!thread) return { ok: false, error: "Not your thread." }

  if (!input.approve) {
    const [rejected] = await db
      .update(chatToolCalls)
      .set({ status: "rejected", decidedAt: new Date() })
      .where(eq(chatToolCalls.id, call.id))
      .returning()
    return { ok: true, call: rejected, result: null }
  }

  const spec = toolByName(call.name)
  if (!spec) return { ok: false, error: `No tool named ${call.name}.` }

  const ctx: ToolContext = {
    userId: input.userId,
    threadId: call.threadId,
    idempotencyKey: call.idempotencyKey,
  }

  try {
    const result = await spec.run(call.args as Record<string, unknown>, ctx)
    const [ran] = await db
      .update(chatToolCalls)
      .set({
        status: "ran",
        decidedAt: new Date(),
        ranAt: new Date(),
        result: result as never,
      })
      .where(eq(chatToolCalls.id, call.id))
      .returning()

    await db.insert(chatMessages).values({
      threadId: call.threadId,
      role: "tool",
      agent: spec.name,
      body: JSON.stringify(result),
    })

    return { ok: true, call: ran, result }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(chatToolCalls)
      .set({ status: "failed", decidedAt: new Date(), error: message.slice(0, 2000) })
      .where(eq(chatToolCalls.id, call.id))
    return { ok: false, error: message }
  }
}

export async function pendingApprovals(userId: string) {
  return db
    .select({
      call: chatToolCalls,
      threadTitle: chatThreads.title,
    })
    .from(chatToolCalls)
    .innerJoin(chatThreads, eq(chatToolCalls.threadId, chatThreads.id))
    .where(
      and(eq(chatToolCalls.status, "pending"), eq(chatThreads.userId, userId))
    )
    .orderBy(asc(chatToolCalls.createdAt))
}

/* ---------- reading ---------- */

export async function listThreads(userId: string, limit = 30) {
  return db.query.chatThreads.findMany({
    where: and(eq(chatThreads.userId, userId), isNull(chatThreads.archivedAt)),
    orderBy: [desc(chatThreads.lastMessageAt)],
    limit,
  })
}

export async function threadDetail(userId: string, threadId: string) {
  const thread = await db.query.chatThreads.findFirst({
    where: and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)),
  })
  if (!thread) return null

  const [messages, turns, calls] = await Promise.all([
    db.query.chatMessages.findMany({
      where: eq(chatMessages.threadId, threadId),
      orderBy: [asc(chatMessages.createdAt)],
    }),
    db.query.chatTurns.findMany({
      where: eq(chatTurns.threadId, threadId),
      orderBy: [asc(chatTurns.createdAt)],
    }),
    db.query.chatToolCalls.findMany({
      where: eq(chatToolCalls.threadId, threadId),
      orderBy: [asc(chatToolCalls.createdAt)],
    }),
  ])

  return { thread, messages, turns, calls }
}
