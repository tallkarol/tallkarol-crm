/**
 * Activity logging against the real database, with rows this script plants
 * and then deletes: a browser batch through ingestBatch() (with a temporary
 * session row, so attribution runs for real), server action runs, and two
 * events aged past the raw window for the rollup. Every query the page uses
 * runs once and is checked against the planted rows.
 *
 * Planted rows live under a route no real page has (/__check/<tag>) and the
 * phone surface, so a real click elsewhere during the run cannot move the
 * numbers being asserted. The ingest counters are restored afterwards.
 *
 *   npm run check:activity:db
 */

import { loadLocalEnv } from "../lib/load-env"

loadLocalEnv()

// Letters only: a segment with a digit in it is collapsed to [id] by the route
// matcher, which is right for real paths and wrong for a planted one.
const tag = Array.from({ length: 6 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join("")
// Speed leaves the `local` deploy out (the dev server shares this database), so
// planted rows carry a stand-in commit instead.
process.env.RAILWAY_GIT_COMMIT_SHA = `chk${tag}`

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
  const { activityDaily, activityEvents, appSettings, sessions, users } = await import("../db/schema")
  const { and, eq, like, sql } = await import("drizzle-orm")
  const { hashToken, newToken } = await import("../lib/crypto")
  const { ingestBatch } = await import("../lib/activity/ingest")
  const { insertEvents } = await import("../lib/activity/store")
  const { rollupActivity } = await import("../lib/activity/rollup")
  const { parseFilters } = await import("../lib/activity/summary/filters")
  const overview = await import("../lib/activity/summary/overview")
  const pages = await import("../lib/activity/summary/pages")
  const controls = await import("../lib/activity/summary/controls")
  const friction = await import("../lib/activity/summary/friction")
  const speed = await import("../lib/activity/summary/speed")
  const stream = await import("../lib/activity/summary/stream")
  const modules = await import("../lib/activity/summary/modules")

  const route = `/__check/${tag}`
  const session = `chk${tag}`
  const now = new Date()
  const tz = "Europe/Warsaw"
  const f = parseFilters({ days: "7", surface: "phone", who: "admin" }, now, tz)

  const admin = await db.query.users.findFirst({ where: eq(users.role, "admin") })
  if (!admin) throw new Error("no admin user in the database")
  const token = newToken()
  const [temp] = await db
    .insert(sessions)
    .values({ userId: admin.id, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + 10 * 60_000) })
    .returning({ id: sessions.id })
  const ingestBefore = await db.query.appSettings.findFirst({ where: eq(appSettings.key, "activity_ingest") })

  try {
    const before = await overview.readings(f)
    const [{ maxId }] = (await db.execute(sql`select coalesce(max(id), 0)::int as "maxId" from activity_events`)) as unknown as { maxId: number }[]

    /* ---------------------------------------------------------- ingest */
    const at = now.getTime() - 60_000
    const result = await ingestBatch(
      {
        session,
        surface: "phone",
        viewport: "phone",
        events: [
          { kind: "page.view", at, path: route, durationMs: 900, props: { view: "v1", via: "palette" } },
          { kind: "page.leave", at: at + 1000, path: route, durationMs: 120_000, props: { view: "v1", reason: "navigate", title: "never stored" } },
          { kind: "control.use", at: at + 2000, path: route, target: `check.${tag}.layout`, props: { value: "board" } },
          { kind: "frustration.rage", at: at + 3000, path: route, target: `check.${tag}.card`, props: { clicks: 4 } },
          { kind: "error.client", at: at + 4000, path: route, props: { message: `check ${tag}`, fingerprint: `f${tag}`, source: "check.ts:1" } },
          { kind: "peek.open", at: at + 5000, path: route, props: { peek: "task", id: "t1" } },
          { kind: "peek.close", at: at + 9000, path: route, durationMs: 4000, props: { peek: "task", acted: true } },
          { kind: "action.run", at: at + 6000, path: route, target: "forged.fromBrowser" },
          { kind: "page.nonsense", at: at + 7000, path: route },
        ],
      },
      { userAgent: "Mozilla/5.0 (iPhone) check-activity-db", sessionToken: token },
      now
    )
    check("ingest answers 204 for a signed-in session", result.status === 204, JSON.stringify(result))
    check("seven events stored, two refused", result.stored === 7 && result.refused === 2, `${result.stored} stored, ${result.refused} refused`)
    check("undeclared prop dropped and counted", result.dropped === 1)

    const unauth = await ingestBatch({ events: [] }, { userAgent: "", sessionToken: "not-a-session" }, now)
    check("an unknown session is refused", unauth.status === 401)

    const leave = await db.query.activityEvents.findFirst({ where: and(eq(activityEvents.session, session), eq(activityEvents.kind, "page.leave")) })
    check("stored row carries no undeclared keys", !!leave && !("title" in (leave.props as object)), JSON.stringify(leave?.props))
    check("attribution: user, role, surface", leave?.userId === admin.id && leave?.role === "admin" && leave?.surface === "phone")
    check("route kept as the pattern it matched", leave?.route === route)

    /* ---------------------------------------------------------- server action runs */
    const actionRuns = [
      { durationMs: 100, ok: true },
      { durationMs: 200, ok: true },
      { durationMs: 3000, ok: false, message: `refused ${tag}` },
    ]
    await insertEvents(
      actionRuns.map((run, i) => ({
        event: {
          kind: "action.run",
          module: "actions" as const,
          occurredAt: new Date(at + 10_000 + i),
          route,
          target: `check.${tag}.save`,
          durationMs: run.durationMs,
          ok: run.ok,
          props: run.message ? { message: run.message } : {},
        },
        envelope: { session, surface: "phone" as const, viewport: "phone" as const, synthetic: false },
        who: { userId: admin.id, role: "admin" as const, clientId: null },
      }))
    )

    /* ---------------------------------------------------------- every query */
    const after = await overview.readings(f)
    check("readings: +1 view", after.cur.views - before.cur.views === 1, `${before.cur.views} → ${after.cur.views}`)
    check("readings: +2 min active", after.cur.activeMs - before.cur.activeMs === 120_000)
    check("readings: +3 actions, +1 failed", after.cur.actions - before.cur.actions === 3 && after.cur.failed - before.cur.failed === 1)
    check("readings: +1 friction, +1 error", after.cur.friction - before.cur.friction === 1 && after.cur.errors - before.cur.errors === 1)

    const days = await overview.activeByDay(f)
    check("active by day covers the window", days.days.length === 7 && days.bySurface.phone.reduce((a, b) => a + b, 0) >= 120_000)
    const grid = await overview.heat(f)
    check("heat grid is 7 × 24 and holds the planted minutes", grid.length === 7 && grid[0].length === 24 && grid.flat().reduce((a, b) => a + b, 0) >= 120_000)

    const via = await overview.viaByRoute(f)
    const viaRow = via.find((r) => r.route === route)
    check("via: arrived by ⌘K", viaRow?.via.palette === 1 && viaRow?.views === 1, JSON.stringify(viaRow))

    const pageList = await pages.pageRows(f)
    const page = pageList.find((p) => p.route === route)
    check("pages: views, active, median visit, phone", page?.views === 1 && page?.activeMs === 120_000 && page?.medianVisitMs === 120_000 && page?.phone === 1, JSON.stringify(page))
    check("pages: per-day series has the view", page?.perDay.reduce((a, b) => a + b, 0) === 1)

    const next = await pages.nextPages(f, [route])
    check("next pages: a single view ends the session", next[0]?.next[0]?.route === null && next[0]?.total === 1, JSON.stringify(next))

    const sidebar = await pages.sidebarUse()
    check("sidebar use lists the nav rows", sidebar.length > 20 && sidebar.every((r) => r.href.startsWith("/")))

    const ctl = await controls.controlsSummary(f)
    const ctlRow = ctl.rows.find((r) => r.target === `check.${tag}.layout`)
    check("controls: use counted with its value", ctlRow?.uses === 1 && ctlRow?.values[0]?.value === "board", JSON.stringify(ctlRow))

    const peekList = await controls.peekRows(f)
    check("peeks: open, close and acted", peekList.some((p) => p.peek === "task" && p.opens >= 1 && p.acted >= 1))

    const fr = await friction.frictionSummary(f)
    check("friction: rage row", fr.rage.some((r) => r.target === `check.${tag}.card`))
    check("friction: failed action with its message", fr.failedActions.some((a) => a.target === `check.${tag}.save` && a.failed === 1 && a.lastMessage === `refused ${tag}`))
    check("friction: error grouped by fingerprint", fr.errors.some((e) => e.fingerprint === `f${tag}` && e.n === 1))

    const timings = await speed.actionTimings(f, 200)
    const timing = timings.find((t) => t.target === `check.${tag}.save`)
    check("speed: runs, median, waited", timing?.runs === 3 && timing?.p50Ms === 200 && timing?.waitedMs === 3300, JSON.stringify(timing))
    const pageSpeed = await speed.pageSpeed(f, 200)
    check("speed: ready after a click (⌘K counts as a click)", pageSpeed.find((p) => p.route === route)?.readyP75 === 900)
    const deploys = await speed.deployComparisons(f, `check.${tag}.save`)
    check("speed: deploy comparison runs", Array.isArray(deploys))

    const events = await stream.streamEvents({ surface: "phone", who: "admin", test: false }, { afterId: maxId })
    check("stream: newest events after an id", events.filter((e) => e.session === session).length === 10, `${events.length}`)

    const stats = await modules.moduleStats(f)
    check("modules: per-module counts", (stats.pages?.events ?? 0) >= 2 && (stats.actions?.events ?? 0) >= 3)
    const storage = await modules.storageFacts(f)
    check("modules: storage facts", storage.stored >= 10 && storage.tableBytes > 0)

    /* ---------------------------------------------------------- rollup */
    const old = new Date(now.getTime() - 100 * 86_400_000)
    const envelope = { session, surface: "phone" as const, viewport: "phone" as const, synthetic: false }
    const who = { userId: admin.id, role: "admin" as const, clientId: null }
    const oldEvent = (durationMs: number) => ({
      kind: "page.leave",
      module: "pages" as const,
      occurredAt: old,
      route,
      target: null,
      durationMs,
      ok: null,
      props: { view: "old", reason: "tick" },
    })
    await insertEvents([
      { event: oldEvent(1000), envelope, who },
      { event: oldEvent(3000), envelope, who },
      { event: oldEvent(5000), envelope: { ...envelope, synthetic: true }, who },
    ])
    const rolled = await rollupActivity(now)
    check("rollup: folded and deleted the aged rows", rolled.rolled >= 1 && rolled.deleted >= 3, JSON.stringify(rolled))
    const daily = await db.select().from(activityDaily).where(eq(activityDaily.route, route))
    check("rollup: one daily row, verification traffic left out", daily.length === 1 && daily[0].count === 2 && daily[0].sumMs === 4000, JSON.stringify(daily))
    const again = await rollupActivity(now)
    check("rollup: a second run has nothing to do", again.rolled === 0 && again.deleted === 0)
  } finally {
    await db.delete(activityEvents).where(like(activityEvents.route, "/__check/%"))
    await db.delete(activityDaily).where(like(activityDaily.route, "/__check/%"))
    if (temp) await db.delete(sessions).where(eq(sessions.id, temp.id))
    if (ingestBefore) {
      await db.update(appSettings).set({ value: ingestBefore.value, updatedAt: ingestBefore.updatedAt }).where(eq(appSettings.key, "activity_ingest"))
    } else {
      await db.delete(appSettings).where(eq(appSettings.key, "activity_ingest"))
    }
    const [{ left }] = (await db.execute(sql`select count(*)::int as "left" from activity_events where route like '/__check/%'`)) as unknown as { left: number }[]
    check("cleanup: nothing planted is left", left === 0)
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed")
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
