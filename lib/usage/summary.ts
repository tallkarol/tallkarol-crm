import { and, gte, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import { agentTurns, chatThreads, chatTurns, clients } from "@/db/schema"
import { MODELS } from "@/lib/chat/models"
import { dayInZone, startOfDayInZone } from "@/lib/usage/time"
import type { DayClientSeries, WhereMetric } from "@/lib/usage/types"

export type { DayClientSeries, WhereMetric } from "@/lib/usage/types"
export { WHERE_METRICS } from "@/lib/usage/types"

/**
 * The /usage rollups. Everything here is a SQL group-by over agent_turns
 * (the Mac's metered turns) and chat_turns (the CRM's own), bucketed in the
 * workspace timezone at read time — nothing is stored twice. Three units
 * never sum into one figure: hours (both Mac surfaces), tokens (Claude Code
 * only), dollars (CRM chat at registry rates). NULL tokens stay NULL: a
 * Cursor turn, or a Claude turn whose transcript was gone, counts toward
 * hours and turns and toward "rows without tokens", never toward a sum.
 */

export type Window = { days: number; since: Date; until: Date; prevSince: Date; tz: string }

/**
 * `days` whole calendar days in the workspace zone, today included: since
 * is local midnight of (today − days + 1), so the first bar of the chart is
 * a full day, not the hours after now's time of day. The previous window
 * is the `days` calendar days before that.
 */
export function windowFor(days: number, now: Date, tz: string): Window {
  const until = now
  const today = startOfDayInZone(now, tz)
  const since = startOfDayInZone(new Date(today.getTime() - (days - 1) * 86_400_000 + 3_600_000), tz)
  const prevSince = startOfDayInZone(new Date(since.getTime() - days * 86_400_000 + 3_600_000), tz)
  return { days, since, until, prevSince, tz }
}

export function windowDays(raw: string | null | undefined): number {
  const n = Number(raw)
  return n === 30 ? 30 : n === 90 ? 90 : 7
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0)
const maybe = (v: unknown) => (v === null || v === undefined ? null : Number(v))

/* ------------------------------------------------------------- surfaces */

export type SurfaceTotals = {
  /** Parent-turn time only — a subagent runs inside its turn's wall clock. */
  hours: number
  turns: number
  subagentRuns: number
  sessions: number
  requests: number
  outputTokens: number
  /** Rows whose tokens are unknown — Cursor, or a transcript that was gone. */
  noTokenRows: number
}

/** Seconds of parent turns; subagent rows would double-count the wall clock. */
const TURN_SECONDS = sql<string>`coalesce(sum(case when ${agentTurns.kind} = 'turn' then ${agentTurns.seconds} else 0 end), 0) / 3600.0`

export type ChatTotals = { turns: number; cents: number }

export type BySurface = {
  claude: { cur: SurfaceTotals; prev: SurfaceTotals }
  cursor: { cur: SurfaceTotals; prev: SurfaceTotals }
  chat: { cur: ChatTotals; prev: ChatTotals }
}

const EMPTY: SurfaceTotals = { hours: 0, turns: 0, subagentRuns: 0, sessions: 0, requests: 0, outputTokens: 0, noTokenRows: 0 }

async function surfaceTotals(since: Date, until: Date): Promise<Record<string, SurfaceTotals>> {
  const rows = await db
    .select({
      surface: agentTurns.surface,
      hours: TURN_SECONDS,
      turns: sql<number>`sum(case when ${agentTurns.kind} = 'turn' then 1 else 0 end)::int`,
      subagentRuns: sql<number>`sum(case when ${agentTurns.kind} = 'subagent' then 1 else 0 end)::int`,
      sessions: sql<number>`count(distinct ${agentTurns.sessionRef})::int`,
      requests: sql<string>`coalesce(sum(${agentTurns.requests}), 0)`,
      outputTokens: sql<string>`coalesce(sum(${agentTurns.outputTokens}), 0)`,
      noTokenRows: sql<number>`sum(case when ${agentTurns.outputTokens} is null then 1 else 0 end)::int`,
    })
    .from(agentTurns)
    .where(and(gte(agentTurns.startedAt, since), lt(agentTurns.startedAt, until)))
    .groupBy(agentTurns.surface)
  const out: Record<string, SurfaceTotals> = {}
  for (const r of rows) {
    out[r.surface] = {
      hours: num(r.hours),
      turns: r.turns,
      subagentRuns: r.subagentRuns,
      sessions: r.sessions,
      requests: num(r.requests),
      outputTokens: num(r.outputTokens),
      noTokenRows: r.noTokenRows,
    }
  }
  return out
}

async function chatTotals(since: Date, until: Date): Promise<ChatTotals> {
  const [row] = await db
    .select({
      turns: sql<number>`count(*)::int`,
      cents: sql<string>`coalesce(sum(${chatTurns.costCents}), 0)`,
    })
    .from(chatTurns)
    .where(and(gte(chatTurns.createdAt, since), lt(chatTurns.createdAt, until), sql`${chatTurns.status} = 'done'`))
  return { turns: row?.turns ?? 0, cents: num(row?.cents) }
}

export async function bySurface(w: Window): Promise<BySurface> {
  const [cur, prev, chatCur, chatPrev] = await Promise.all([
    surfaceTotals(w.since, w.until),
    surfaceTotals(w.prevSince, w.since),
    chatTotals(w.since, w.until),
    chatTotals(w.prevSince, w.since),
  ])
  return {
    claude: { cur: cur.claude ?? EMPTY, prev: prev.claude ?? EMPTY },
    cursor: { cur: cur.cursor ?? EMPTY, prev: prev.cursor ?? EMPTY },
    chat: { cur: chatCur, prev: chatPrev },
  }
}

/* ---------------------------------------------------------------- where */

const NO_CLIENT = "no client"

function dayList(w: Window): string[] {
  const out: string[] = []
  const last = dayInZone(w.until, w.tz)
  for (let t = w.since.getTime() + 3_600_000; t < w.until.getTime() + 86_400_000; t += 86_400_000) {
    const d = dayInZone(new Date(t), w.tz)
    if (d > last) break
    if (!out.includes(d)) out.push(d)
  }
  return out
}

export async function byDayClient(w: Window): Promise<DayClientSeries> {
  const dayOf = (col: unknown) => sql<string>`to_char(${col} at time zone ${w.tz}, 'YYYY-MM-DD')`
  const [mac, chat] = await Promise.all([
    db
      .select({
        day: dayOf(agentTurns.startedAt),
        client: sql<string>`coalesce(${agentTurns.clientSlug}, ${NO_CLIENT})`,
        surface: agentTurns.surface,
        hours: TURN_SECONDS,
        output: sql<string>`coalesce(sum(${agentTurns.outputTokens}), 0)`,
      })
      .from(agentTurns)
      .where(and(gte(agentTurns.startedAt, w.since), lt(agentTurns.startedAt, w.until)))
      .groupBy(sql`1`, sql`2`, agentTurns.surface),
    db
      .select({
        day: dayOf(chatTurns.createdAt),
        client: sql<string>`coalesce(${clients.slug}, ${NO_CLIENT})`,
        cents: sql<string>`coalesce(sum(${chatTurns.costCents}), 0)`,
      })
      .from(chatTurns)
      .innerJoin(chatThreads, sql`${chatThreads.id} = ${chatTurns.threadId}`)
      .leftJoin(clients, sql`${clients.id} = ${chatThreads.clientId}`)
      .where(and(gte(chatTurns.createdAt, w.since), lt(chatTurns.createdAt, w.until), sql`${chatTurns.status} = 'done'`))
      .groupBy(sql`1`, sql`2`),
  ])
  const values: DayClientSeries["values"] = { output: {}, hours: {}, chat: {} }
  const clientSet = new Set<string>()
  const add = (metric: WhereMetric, day: string, client: string, v: number) => {
    if (!v) return
    clientSet.add(client)
    values[metric][day] ??= {}
    values[metric][day][client] = (values[metric][day][client] ?? 0) + v
  }
  for (const r of mac) {
    add("hours", r.day, r.client, num(r.hours))
    if (r.surface === "claude") add("output", r.day, r.client, num(r.output))
  }
  for (const r of chat) add("chat", r.day, r.client, num(r.cents) / 100)
  const list = Array.from(clientSet).sort((a, b) => (a === NO_CLIENT ? 1 : b === NO_CLIENT ? -1 : a.localeCompare(b)))
  return { days: dayList(w), clients: list, values }
}

/* ------------------------------------------------------------ breakdowns */

export type ClientSurfaceRow = {
  client: string
  surface: "claude" | "cursor" | "chat"
  hours: number | null
  turns: number
  prevTurns: number
  outputTokens: number | null
  /** cache reads over all input, 0..1; null when unknown */
  cacheShare: number | null
  dollars: number | null
}

export async function byClientSurface(w: Window): Promise<ClientSurfaceRow[]> {
  const macQuery = (since: Date, until: Date) =>
    db
      .select({
        client: sql<string>`coalesce(${agentTurns.clientSlug}, ${NO_CLIENT})`,
        surface: agentTurns.surface,
        hours: TURN_SECONDS,
        turns: sql<number>`sum(case when ${agentTurns.kind} = 'turn' then 1 else 0 end)::int`,
        output: sql<string | null>`sum(${agentTurns.outputTokens})`,
        cacheRead: sql<string | null>`sum(${agentTurns.cacheReadTokens})`,
        allInput: sql<string | null>`sum(${agentTurns.inputTokens} + ${agentTurns.cacheWriteTokens} + ${agentTurns.cacheReadTokens})`,
      })
      .from(agentTurns)
      .where(and(gte(agentTurns.startedAt, since), lt(agentTurns.startedAt, until)))
      .groupBy(sql`1`, agentTurns.surface)
  const chatQuery = (since: Date, until: Date) =>
    db
      .select({
        client: sql<string>`coalesce(${clients.slug}, ${NO_CLIENT})`,
        turns: sql<number>`count(*)::int`,
        cents: sql<string>`coalesce(sum(${chatTurns.costCents}), 0)`,
      })
      .from(chatTurns)
      .innerJoin(chatThreads, sql`${chatThreads.id} = ${chatTurns.threadId}`)
      .leftJoin(clients, sql`${clients.id} = ${chatThreads.clientId}`)
      .where(and(gte(chatTurns.createdAt, since), lt(chatTurns.createdAt, until), sql`${chatTurns.status} = 'done'`))
      .groupBy(sql`1`)
  const [mac, macPrev, chat, chatPrev] = await Promise.all([
    macQuery(w.since, w.until),
    macQuery(w.prevSince, w.since),
    chatQuery(w.since, w.until),
    chatQuery(w.prevSince, w.since),
  ])
  const prevTurns = new Map<string, number>()
  for (const r of macPrev) prevTurns.set(`${r.client}|${r.surface}`, r.turns)
  for (const r of chatPrev) prevTurns.set(`${r.client}|chat`, r.turns)
  const rows: ClientSurfaceRow[] = mac.map((r) => {
    const cacheRead = maybe(r.cacheRead)
    const allInput = maybe(r.allInput)
    return {
      client: r.client,
      surface: r.surface === "cursor" ? "cursor" : "claude",
      hours: num(r.hours),
      turns: r.turns,
      prevTurns: prevTurns.get(`${r.client}|${r.surface}`) ?? 0,
      outputTokens: r.surface === "cursor" ? null : maybe(r.output),
      cacheShare: cacheRead !== null && allInput ? cacheRead / allInput : null,
      dollars: null,
    }
  })
  for (const r of chat) {
    rows.push({
      client: r.client,
      surface: "chat",
      hours: null,
      turns: r.turns,
      prevTurns: prevTurns.get(`${r.client}|chat`) ?? 0,
      outputTokens: null,
      cacheShare: null,
      dollars: num(r.cents) / 100,
    })
  }
  return rows.sort((a, b) => a.client.localeCompare(b.client) || a.surface.localeCompare(b.surface))
}

export type LaneRow = { lane: string; turns: number; outputTokens: number | null; dollars: number | null }

export async function byLane(w: Window): Promise<LaneRow[]> {
  const [mac, chat] = await Promise.all([
    db
      .select({
        lane: sql<string>`coalesce(${agentTurns.lane}, 'no lane')`,
        turns: sql<number>`count(*)::int`,
        output: sql<string | null>`sum(${agentTurns.outputTokens})`,
      })
      .from(agentTurns)
      .where(and(gte(agentTurns.startedAt, w.since), lt(agentTurns.startedAt, w.until)))
      .groupBy(sql`1`),
    db
      .select({
        lane: sql<string>`case when ${chatThreads.agent} <> '' then 'persona:' || ${chatThreads.agent} else 'job:' || ${chatTurns.jobType} end`,
        turns: sql<number>`count(*)::int`,
        cents: sql<string>`coalesce(sum(${chatTurns.costCents}), 0)`,
      })
      .from(chatTurns)
      .innerJoin(chatThreads, sql`${chatThreads.id} = ${chatTurns.threadId}`)
      .where(and(gte(chatTurns.createdAt, w.since), lt(chatTurns.createdAt, w.until), sql`${chatTurns.status} = 'done'`))
      .groupBy(sql`1`),
  ])
  const rows: LaneRow[] = mac.map((r) => ({ lane: r.lane, turns: r.turns, outputTokens: maybe(r.output), dollars: null }))
  for (const r of chat) rows.push({ lane: r.lane, turns: r.turns, outputTokens: null, dollars: num(r.cents) / 100 })
  return rows.sort((a, b) => b.turns - a.turns)
}

export type ModelRow = {
  model: string
  surface: "claude" | "cursor" | "chat"
  requests: number | null
  inputTokens: number | null
  cacheReadTokens: number | null
  cacheWriteTokens: number | null
  outputTokens: number | null
  thinkingTokens: number | null
  turns: number
  dollars: number | null
}

export async function byModel(w: Window): Promise<ModelRow[]> {
  const [mac, chat] = await Promise.all([
    db
      .select({
        model: sql<string>`coalesce(${agentTurns.model}, 'unknown')`,
        surface: agentTurns.surface,
        turns: sql<number>`count(*)::int`,
        requests: sql<string | null>`sum(${agentTurns.requests})`,
        input: sql<string | null>`sum(${agentTurns.inputTokens})`,
        cacheRead: sql<string | null>`sum(${agentTurns.cacheReadTokens})`,
        cacheWrite: sql<string | null>`sum(${agentTurns.cacheWriteTokens})`,
        output: sql<string | null>`sum(${agentTurns.outputTokens})`,
        thinking: sql<string | null>`sum(${agentTurns.thinkingTokens})`,
      })
      .from(agentTurns)
      .where(and(gte(agentTurns.startedAt, w.since), lt(agentTurns.startedAt, w.until)))
      .groupBy(sql`1`, agentTurns.surface),
    db
      .select({
        model: chatTurns.model,
        turns: sql<number>`count(*)::int`,
        input: sql<string>`coalesce(sum(${chatTurns.inputTokens}), 0)`,
        cacheRead: sql<string>`coalesce(sum(${chatTurns.cacheReadTokens}), 0)`,
        cacheWrite: sql<string>`coalesce(sum(${chatTurns.cacheWriteTokens}), 0)`,
        output: sql<string>`coalesce(sum(${chatTurns.outputTokens}), 0)`,
        cents: sql<string>`coalesce(sum(${chatTurns.costCents}), 0)`,
      })
      .from(chatTurns)
      .where(and(gte(chatTurns.createdAt, w.since), lt(chatTurns.createdAt, w.until), sql`${chatTurns.status} = 'done'`))
      .groupBy(chatTurns.model),
  ])
  const rows: ModelRow[] = mac.map((r) => ({
    model: r.model,
    surface: r.surface === "cursor" ? "cursor" : "claude",
    requests: maybe(r.requests),
    inputTokens: maybe(r.input),
    cacheReadTokens: maybe(r.cacheRead),
    cacheWriteTokens: maybe(r.cacheWrite),
    outputTokens: maybe(r.output),
    thinkingTokens: maybe(r.thinking),
    turns: r.turns,
    dollars: null,
  }))
  for (const r of chat) {
    rows.push({
      model: r.model,
      surface: "chat",
      requests: null,
      inputTokens: num(r.input),
      cacheReadTokens: num(r.cacheRead),
      cacheWriteTokens: num(r.cacheWrite),
      outputTokens: num(r.output),
      thinkingTokens: null,
      turns: r.turns,
      dollars: num(r.cents) / 100,
    })
  }
  return rows.sort((a, b) => (b.outputTokens ?? 0) - (a.outputTokens ?? 0) || b.turns - a.turns)
}

/* ----------------------------------------------------------------- when */

export type HourSlots = { turns: number[]; outputTokens: number[] }

export async function byHour(w: Window): Promise<HourSlots> {
  const hourOf = (col: unknown) => sql<number>`extract(hour from ${col} at time zone ${w.tz})::int`
  const [mac, chat] = await Promise.all([
    db
      .select({
        hour: hourOf(agentTurns.startedAt),
        turns: sql<number>`count(*)::int`,
        output: sql<string>`coalesce(sum(case when ${agentTurns.surface} = 'claude' then ${agentTurns.outputTokens} end), 0)`,
      })
      .from(agentTurns)
      .where(and(gte(agentTurns.startedAt, w.since), lt(agentTurns.startedAt, w.until)))
      .groupBy(sql`1`),
    db
      .select({ hour: hourOf(chatTurns.createdAt), turns: sql<number>`count(*)::int` })
      .from(chatTurns)
      .where(and(gte(chatTurns.createdAt, w.since), lt(chatTurns.createdAt, w.until), sql`${chatTurns.status} = 'done'`))
      .groupBy(sql`1`),
  ])
  const turns = new Array(24).fill(0) as number[]
  const outputTokens = new Array(24).fill(0) as number[]
  for (const r of mac) {
    turns[r.hour] += r.turns
    outputTokens[r.hour] += num(r.output)
  }
  for (const r of chat) turns[r.hour] += r.turns
  return { turns, outputTokens }
}

/* ----------------------------------------------------------------- pace */

export type Pace = {
  /** null when no row in the window carries tokens — unknown, not zero */
  output: number | null
  requests: number | null
  cacheRead: number | null
  hours: number
  turns: number
  noTokenRows: number
  through: Date | null
}

async function paceSince(since: Date, until: Date): Promise<Pace> {
  const [row] = await db
    .select({
      output: sql<string | null>`sum(${agentTurns.outputTokens})`,
      requests: sql<string | null>`sum(${agentTurns.requests})`,
      cacheRead: sql<string | null>`sum(${agentTurns.cacheReadTokens})`,
      hours: TURN_SECONDS,
      turns: sql<number>`coalesce(sum(case when ${agentTurns.kind} = 'turn' then 1 else 0 end), 0)::int`,
      noTokenRows: sql<number>`coalesce(sum(case when ${agentTurns.outputTokens} is null then 1 else 0 end), 0)::int`,
      through: sql<string | null>`max(${agentTurns.endedAt})`,
    })
    .from(agentTurns)
    .where(and(gte(agentTurns.startedAt, since), lt(agentTurns.startedAt, until), sql`${agentTurns.surface} = 'claude'`))
  return {
    output: maybe(row?.output),
    requests: maybe(row?.requests),
    cacheRead: maybe(row?.cacheRead),
    hours: num(row?.hours),
    turns: row?.turns ?? 0,
    noTokenRows: row?.noTokenRows ?? 0,
    through: row?.through ? new Date(row.through) : null,
  }
}

/**
 * Trailing 5-hour and 7-day Claude Code usage on the Mac as of `at`. Pace,
 * not the cap. A back-dated reading gets the pace up to its own instant,
 * not up to now — that pair is what calibration needs.
 */
export async function pace(at: Date): Promise<{ h5: Pace; d7: Pace }> {
  const [h5, d7] = await Promise.all([
    paceSince(new Date(at.getTime() - 5 * 3_600_000), at),
    paceSince(new Date(at.getTime() - 7 * 86_400_000), at),
  ])
  return { h5, d7 }
}

/* --------------------------------------------------------------- cursor */

export type CursorIdePools = {
  cursor: number
  other: number
  /** Turns that wrote no code — Cursor recorded no model for them. */
  unknown: number
  /** Turns on a model the registry does not know; the ids, so the gap is visible. */
  unregistered: number
  unregisteredIds: string[]
  models: string[]
}

/** Cursor IDE turns in the window by the pool their model draws on. */
export async function cursorIdeByPool(w: Window): Promise<CursorIdePools> {
  const rows = await db
    .select({ model: agentTurns.model, turns: sql<number>`count(*)::int` })
    .from(agentTurns)
    .where(
      and(gte(agentTurns.startedAt, w.since), lt(agentTurns.startedAt, w.until), sql`${agentTurns.surface} = 'cursor'`, sql`${agentTurns.kind} = 'turn'`)
    )
    .groupBy(agentTurns.model)
  const poolOf = new Map<string, string>()
  for (const spec of Object.values(MODELS) as { id: string; pool: string }[]) {
    if (spec.id && !poolOf.has(spec.id)) poolOf.set(spec.id, spec.pool)
  }
  const out: CursorIdePools = { cursor: 0, other: 0, unknown: 0, unregistered: 0, unregisteredIds: [], models: [] }
  for (const r of rows) {
    const ids = (r.model ?? "").split("+").filter(Boolean)
    if (!ids.length) {
      out.unknown += r.turns
      continue
    }
    const pools = ids.map((id) => poolOf.get(id) ?? null)
    if (pools.includes("other")) {
      out.other += r.turns
      for (const id of ids) if (poolOf.get(id) === "other" && !out.models.includes(id)) out.models.push(id)
    } else if (pools.includes("cursor")) {
      out.cursor += r.turns
    } else {
      out.unregistered += r.turns
      for (const id of ids) if (!out.unregisteredIds.includes(id)) out.unregisteredIds.push(id)
    }
  }
  return out
}

/* -------------------------------------------------------------- sources */

export type SourceHealth = {
  lastPush: Date | null
  lastClaudeTurn: Date | null
  lastCursorTurn: Date | null
  lastChatTurn: Date | null
  cursorRowsNoTokens: number
  claudeRowsNoTokens: number
  turnsInWindow: number
  chatTurnsInWindow: number
}

export async function sourceHealth(w: Window): Promise<SourceHealth> {
  // A Date inside a raw sql`` fragment has no column to type it, so the
  // driver cannot bind it; pass the ISO string and cast.
  const since = sql`${w.since.toISOString()}::timestamptz`
  const [[mac], [chat]] = await Promise.all([
    db
      .select({
        lastPush: sql<string | null>`max(${agentTurns.pushedAt})`,
        lastClaude: sql<string | null>`max(case when ${agentTurns.surface} = 'claude' then ${agentTurns.endedAt} end)`,
        lastCursor: sql<string | null>`max(case when ${agentTurns.surface} = 'cursor' then ${agentTurns.endedAt} end)`,
        cursorNoTokens: sql<number>`coalesce(sum(case when ${agentTurns.surface} = 'cursor' and ${agentTurns.outputTokens} is null and ${agentTurns.startedAt} >= ${since} then 1 else 0 end), 0)::int`,
        claudeNoTokens: sql<number>`coalesce(sum(case when ${agentTurns.surface} = 'claude' and ${agentTurns.outputTokens} is null and ${agentTurns.startedAt} >= ${since} then 1 else 0 end), 0)::int`,
        inWindow: sql<number>`coalesce(sum(case when ${agentTurns.startedAt} >= ${since} then 1 else 0 end), 0)::int`,
      })
      .from(agentTurns),
    db
      .select({
        last: sql<string | null>`max(${chatTurns.createdAt})`,
        inWindow: sql<number>`coalesce(sum(case when ${chatTurns.createdAt} >= ${since} then 1 else 0 end), 0)::int`,
      })
      .from(chatTurns),
  ])
  const d = (v: unknown) => (v ? new Date(v as string) : null)
  return {
    lastPush: d(mac?.lastPush),
    lastClaudeTurn: d(mac?.lastClaude),
    lastCursorTurn: d(mac?.lastCursor),
    lastChatTurn: d(chat?.last),
    cursorRowsNoTokens: mac?.cursorNoTokens ?? 0,
    claudeRowsNoTokens: mac?.claudeNoTokens ?? 0,
    turnsInWindow: mac?.inWindow ?? 0,
    chatTurnsInWindow: chat?.inWindow ?? 0,
  }
}
