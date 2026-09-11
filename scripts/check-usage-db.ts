/**
 * The /usage rollups, run against the real database with rows this script
 * plants and then deletes: a Claude turn with tokens, a Cursor turn without,
 * a subagent run with a lane, a Railway snapshot and a typed Claude reading.
 * Asserts the unit rules — NULL never sums to 0, a Cursor row has no tokens,
 * the pace is Claude-only, the newest snapshot wins — and the merge rule of
 * the push route (coalesce: a NULL never erases a value).
 *
 *   npm run check:usage:db
 */

import { and, eq, inArray, sql } from "drizzle-orm"
import { loadLocalEnv } from "../lib/load-env"

loadLocalEnv()

let failures = 0
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`)
  else {
    failures += 1
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

async function main() {
  const { db } = await import("../db")
  const { agentTurns, clients, usageSnapshots } = await import("../db/schema")
  const summary = await import("../lib/usage/summary")
  const snaps = await import("../lib/usage/snapshots")

  const tag = "check-usage-" + Math.random().toString(36).slice(2, 8)
  const host = `check-${tag}`
  const now = new Date()
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000)
  const client = await db.query.clients.findFirst({ columns: { id: true, slug: true }, orderBy: clients.slug })
  if (!client) throw new Error("no clients in the database")
  // The database is live: rollups by client_slug are isolated by planting
  // under a slug no real row carries (client_id still points at a real client).
  const slug = `check-${tag}`
  const longAgo = new Date(now.getTime() - 400 * 86_400_000)

  try {
    /* --- plant turns ------------------------------------------------- */
    await db.insert(agentTurns).values([
      {
        meterRef: `${host}:1`,
        sessionRef: `${tag}-claude`,
        surface: "claude",
        kind: "turn",
        clientId: client.id,
        clientSlug: slug,
        cwd: "/tmp",
        startedAt: at(90),
        endedAt: at(60),
        seconds: 1800,
        model: "claude-fable-5-1",
        effort: "xhigh",
        lane: "skill:artifact-design",
        requests: 12,
        inputTokens: 100,
        cacheWriteTokens: 1000,
        cacheReadTokens: 9000,
        outputTokens: 5000,
        thinkingTokens: 800,
      },
      {
        meterRef: `${host}:2`,
        sessionRef: `${tag}-claude`,
        surface: "claude",
        kind: "subagent",
        agentId: "agent-abc",
        clientId: client.id,
        clientSlug: slug,
        cwd: "/tmp",
        startedAt: at(80),
        endedAt: at(70),
        seconds: 600,
        model: "claude-fable-5-1",
        lane: "agent:general-purpose",
        requests: 3,
        inputTokens: 10,
        cacheWriteTokens: 100,
        cacheReadTokens: 900,
        outputTokens: 700,
        thinkingTokens: 0,
      },
      {
        meterRef: `${host}:3`,
        sessionRef: `cursor:${tag}`,
        surface: "cursor",
        kind: "turn",
        clientId: null,
        clientSlug: "not-a-client",
        cwd: "/tmp",
        startedAt: at(50),
        endedAt: at(40),
        seconds: 600,
        model: "grok-4.6+claude-opus-5",
      },
      {
        // A lone turn 400 days back, where no real row lives: proves pace()'s upper bound.
        meterRef: `${host}:4`,
        sessionRef: `${tag}-old`,
        surface: "claude",
        kind: "turn",
        clientId: null,
        clientSlug: slug,
        cwd: "/tmp",
        startedAt: longAgo,
        endedAt: new Date(longAgo.getTime() + 600_000),
        seconds: 600,
        model: "claude-opus-5",
        requests: 2,
        inputTokens: 1,
        cacheWriteTokens: 1,
        cacheReadTokens: 1,
        outputTokens: 4242,
        thinkingTokens: 0,
      },
    ])

    const w = summary.windowFor(7, now, "Europe/Warsaw")

    /* --- surfaces ---------------------------------------------------- */
    const surfaces = await summary.bySurface(w)
    check("claude surface counts its two rows", surfaces.claude.cur.turns >= 2 && surfaces.claude.cur.outputTokens >= 5700)
    check("cursor surface has hours but no token rows summed", surfaces.cursor.cur.turns >= 1 && surfaces.cursor.cur.noTokenRows >= 1)
    check("subagent runs are counted apart from turns", surfaces.claude.cur.subagentRuns >= 1)

    /* --- client × surface -------------------------------------------- */
    const rows = await summary.byClientSurface(w)
    const claudeRow = rows.find((r) => r.client === slug && r.surface === "claude")
    const cursorRow = rows.find((r) => r.client === "not-a-client" && r.surface === "cursor")
    check("client row sums claude output", !!claudeRow && claudeRow.outputTokens === 5700, `${claudeRow?.outputTokens}`)
    check("hours count parent turns only", !!claudeRow && Math.abs((claudeRow.hours ?? 0) - 0.5) < 0.001 && claudeRow.turns === 1, `${claudeRow?.hours} h, ${claudeRow?.turns} turns`)
    check("cache share is cache reads over all input", !!claudeRow && claudeRow.cacheShare !== null && claudeRow.cacheShare > 0.8, `${claudeRow?.cacheShare?.toFixed(2)}`)
    check("a cursor row keeps its unknown slug and has null tokens", !!cursorRow && cursorRow.outputTokens === null && cursorRow.hours !== null)

    /* --- lanes and models -------------------------------------------- */
    const lanes = await summary.byLane(w)
    check("skill lane and agent lane both appear", lanes.some((l) => l.lane === "skill:artifact-design") && lanes.some((l) => l.lane === "agent:general-purpose"))
    const models = await summary.byModel(w)
    const cursorModel = models.find((m) => m.model === "grok-4.6+claude-opus-5")
    check("a cursor model row carries no tokens", !!cursorModel && cursorModel.outputTokens === null && cursorModel.requests === null)
    const ide = await summary.cursorIdeByPool(w)
    check("a turn on grok+opus lands on the Other pool", ide.other >= 1 && ide.models.includes("claude-opus-5"), JSON.stringify(ide))
    check("an unregistered model is named, not folded into unknown", typeof ide.unregistered === "number" && Array.isArray(ide.unregisteredIds))

    /* --- pace and hours ---------------------------------------------- */
    const p = await summary.pace(now)
    check("5h pace counts the claude rows only", (p.h5.output ?? 0) >= 5700 && (p.h5.requests ?? 0) >= 15 && p.h5.turns >= 1)
    const after = await summary.pace(new Date(longAgo.getTime() + 3_600_000))
    const before = await summary.pace(new Date(longAgo.getTime() - 60_000))
    check("a back-dated pace stops at its own instant", after.h5.output === 4242 && before.h5.output === null, `${after.h5.output} / ${before.h5.output}`)
    const { wallClockToInstant, startOfDayInZone, zoneOffsetMs } = await import("../lib/usage/time")
    const typed = wallClockToInstant("2026-07-01T14:00", "Europe/Warsaw")
    check("a typed wall clock resolves in the workspace zone", typed?.toISOString() === "2026-07-01T12:00:00.000Z", typed?.toISOString())
    const winter = wallClockToInstant("2026-01-15T09:30", "Europe/Warsaw")
    check("and in winter", winter?.toISOString() === "2026-01-15T08:30:00.000Z", winter?.toISOString())
    check("zone offset in summer is +2h", zoneOffsetMs(new Date("2026-07-01T12:00:00Z"), "Europe/Warsaw") === 7_200_000)
    const midnight = startOfDayInZone(new Date("2026-07-01T12:00:00Z"), "Europe/Warsaw")
    check("start of day is local midnight", midnight.toISOString() === "2026-06-30T22:00:00.000Z", midnight.toISOString())
    check("the window starts at local midnight", w.since.toISOString() === startOfDayInZone(w.since, "Europe/Warsaw").toISOString())
    const slots = await summary.byHour(w)
    check("24 hour slots", slots.turns.length === 24 && slots.turns.reduce((a, b) => a + b, 0) >= 3)

    /* --- merge rule of the push route -------------------------------- */
    const keep = (col: string) => sql.raw(`coalesce(excluded.${col}, agent_turns.${col})`)
    await db
      .insert(agentTurns)
      .values({
        meterRef: `${host}:1`,
        sessionRef: `${tag}-claude`,
        surface: "claude",
        kind: "turn",
        cwd: "",
        startedAt: at(90),
        endedAt: at(60),
        seconds: 1800,
        outputTokens: 4000,
        lane: null,
      })
      .onConflictDoUpdate({
        target: agentTurns.meterRef,
        set: {
          outputTokens: keep("output_tokens"),
          lane: keep("lane"),
          model: keep("model"),
          cwd: sql`case when excluded.cwd = '' then agent_turns.cwd else excluded.cwd end`,
        },
      })
    const merged = await db.query.agentTurns.findFirst({ where: eq(agentTurns.meterRef, `${host}:1`) })
    check("a re-push may lower a number", merged?.outputTokens === 4000, `${merged?.outputTokens}`)
    check("a NULL never erases a value", merged?.lane === "skill:artifact-design" && merged?.model === "claude-fable-5-1" && merged?.cwd === "/tmp")

    /* --- snapshots ---------------------------------------------------- */
    await db.insert(usageSnapshots).values([
      {
        source: "railway",
        basis: "cli",
        observedAt: at(600),
        payload: { usage: { currentUsageDollars: 10, estimatedBillDollars: 20, usageLimit: { hardLimit: 25, isOverLimit: false } }, projects: { projects: [] } },
        note: tag,
      },
      {
        source: "railway",
        basis: "cli",
        observedAt: at(5),
        payload: {
          usage: { currentUsageDollars: 26.9, estimatedBillDollars: 42.8, usageLimit: { hardLimit: 25, isOverLimit: true }, lineItems: [{ label: "Memory", currentUsageDollars: 25.8 }] },
          projects: { projects: [{ name: "artist-house", currentUsageDollars: 24.3, share: 0.9 }, { name: "hearty-consideration", currentUsageDollars: 0.2, share: 0.01 }] },
        },
        note: tag,
      },
      { source: "claude_max", basis: "manual", observedAt: at(30), payload: { five_hour_pct: 38, seven_day_pct: 61, resets_5h: "16:00", pace: { h5: { output: 1 } } }, note: tag },
    ])
    const latest = await snaps.latestBySource()
    const railway = latest.railway ? snaps.parseRailway(latest.railway) : null
    check("the newest railway snapshot wins", !!railway && railway.overLimit && railway.usedDollars === 26.9, `${railway?.usedDollars}`)
    check("railway projects map to clients", !!railway && railway.projects[0]?.clientSlug === "artist-house" && railway.projects[1]?.clientSlug === null)
    const claude = latest.claude_max ? snaps.parseClaudeMax(latest.claude_max) : null
    check("a typed claude reading parses", !!claude && claude.fiveHourPct === 38 && claude.resets5h === "16:00" && !snaps.isStale("claude_max", claude.observedAt, now))
    check("a reading older than its window is stale", snaps.isStale("claude_max", at(7 * 60), now) && !snaps.isStale("railway", at(7 * 60), now))
    await db.insert(usageSnapshots).values({ source: "railway", basis: "cli", observedAt: at(-600), payload: { usage: { currentUsageDollars: 999 } }, note: tag })
    const guarded = await snaps.latestBySource()
    check("a future-dated reading never becomes the latest", guarded.railway ? snaps.parseRailway(guarded.railway)?.usedDollars === 26.9 : false)
    check("age labels read like a person wrote them", snaps.ageLabel(30 * 60_000) === "30 min ago" && snaps.ageLabel(3 * 3_600_000) === "3 h ago" && snaps.ageLabel(3 * 86_400_000) === "3 d ago")

    const health = await summary.sourceHealth(w)
    check("source health sees the planted rows", health.turnsInWindow >= 3 && health.cursorRowsNoTokens >= 1 && !!health.lastPush)
  } finally {
    await db.delete(agentTurns).where(inArray(agentTurns.meterRef, [`${host}:1`, `${host}:2`, `${host}:3`, `${host}:4`]))
    await db.delete(usageSnapshots).where(and(eq(usageSnapshots.note, tag)))
    const left = await db.select({ n: sql<number>`count(*)::int` }).from(agentTurns).where(sql`${agentTurns.meterRef} like ${host + "%"}`)
    check("planted rows cleaned up", left[0]?.n === 0)
  }

  console.log(failures ? `\n${failures} failed` : "\nall good")
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
