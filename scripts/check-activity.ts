/**
 * The pure half of activity logging: route patterns, the props allowlist,
 * the frustration rules and every tuning-note rule. No database.
 *
 *   npm run check:activity
 */
import { CATALOG } from "../lib/activity/catalog"
import {
  createFlipFlopDetector,
  createRageDetector,
  encodeActivityCookie,
  fingerprint,
  isQuickBack,
  parseActivityCookie,
  sessionExpired,
} from "../lib/activity/detect"
import { findings, waitingLine, type FindingInput } from "../lib/activity/findings"
import { formatActive, formatMs, formatShare, humanizeId, toIso, vitalRating } from "../lib/activity/format"
import { KINDS, MODULES, resolveFlags } from "../lib/activity/modules"
import { routeLabel } from "../lib/activity/routes"
import { cleanEnvelope, isSyntheticAgent, makeMatcher, sanitizeEvent, surfaceFromAgent } from "../lib/activity/sanitize"

let failures = 0
let passes = 0
function check(label: string, ok: boolean, detail = "") {
  if (ok) passes += 1
  else {
    failures += 1
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`)
  }
}
const eq = (label: string, actual: unknown, expected: unknown) =>
  check(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`)

/* ------------------------------------------------------------------ registry */
{
  const keys = MODULES.map((m) => m.key)
  eq("ten modules, in tab order", keys, ["pages", "navigation", "controls", "peeks", "actions", "errors", "vitals", "frustration", "devices", "portal"])
  check("every kind is prefixed by a known family", Object.keys(KINDS).every((k) => /^(page|nav|control|peek|action|error|vitals|frustration)\./.test(k)))
  check("action.run is server-only", KINDS["action.run"]?.spec.serverOnly === true)
  const flags = resolveFlags({ pages: false, devices: true })
  eq("stored off wins", flags.pages, false)
  eq("devices stays off while unavailable, whatever is stored", flags.devices, false)
  eq("portal is on by default (recorded from day one)", flags.portal, true)
  eq("controls default on", flags.controls, true)
}

/* ------------------------------------------------------------------ routes */
{
  const match = makeMatcher(CATALOG.routes)
  check("catalog has routes", CATALOG.routes.length > 50, `${CATALOG.routes.length}`)
  eq("root", match("/").pattern, "/")
  eq("static beats dynamic", match("/timesheet/review").pattern, "/timesheet/review")
  eq("dynamic slug", match("/projects/dqs"), { pattern: "/projects/[slug]", params: { slug: "dqs" } })
  eq("nested dynamic", match("/timesheet/gdi/2026-09").pattern, "/timesheet/[client]/[month]")
  eq("query and hash ignored", match("/tasks?peek=task:abc#x").pattern, "/tasks")
  eq("trailing slash", match("/tasks/").pattern, "/tasks")
  eq("encoded segment decodes", match("/invoices/029-M").params, { number: "029-M" })
  eq("portal route kept", match("/portal").pattern, "/portal")
  const unknown = makeMatcher(["/tasks"])("/nowhere/2f1c9a3e-1111-2222-3333-444455556666/edit")
  eq("unmatched id segment collapses", unknown.pattern, "/nowhere/[id]/edit")
  eq("labels: dashboard", routeLabel("/"), "Dashboard")
  eq("labels: sidebar name wins", routeLabel("/support"), "Tickets")
  eq("labels: child row", routeLabel("/timesheet/review"), "Timesheet · Review")
  eq("labels: slug singular", routeLabel("/projects/[slug]"), "Projects · project")
  eq("labels: named param", routeLabel("/insights/[site]"), "Analytics · site")
}

/* ------------------------------------------------------------------ sanitize */
{
  const now = new Date("2026-09-13T10:00:00Z")
  const match = makeMatcher(CATALOG.routes)
  const base = { kind: "page.view", at: now.getTime() - 1000, path: "/projects/dqs", durationMs: 812.4, props: { view: "abc123", via: "palette" } }
  const ok = sanitizeEvent(base, { now, from: "browser", match })
  eq("page.view keeps declared props and adds params from the path", ok.event?.props, { view: "abc123", via: "palette", params: { slug: "dqs" } })
  eq("route pattern stored, not the path", ok.event?.route, "/projects/[slug]")
  eq("duration rounded", ok.event?.durationMs, 812)
  eq("module resolved", ok.event?.module, "pages")

  const sneaky = sanitizeEvent({ ...base, props: { ...base.props, title: "Call Rebecca", params: { slug: "forged" } } }, { now, from: "browser", match })
  eq("undeclared prop dropped and named", sneaky.dropped, ["page.view.title"])
  eq("params never trusted from the payload", (sneaky.event?.props as { params?: unknown }).params, { slug: "dqs" })

  const badEnum = sanitizeEvent({ ...base, props: { via: "teleport" } }, { now, from: "browser", match })
  eq("invalid enum dropped", badEnum.dropped, ["page.view.via"])

  eq("unknown kind refused", sanitizeEvent({ kind: "page.hack" }, { now, from: "browser", match }).event, null)
  eq("server-only kind refused from a browser", sanitizeEvent({ kind: "action.run", target: "x" }, { now, from: "browser", match }).refused, "action.run is server-only")
  check("server-only kind accepted from the server", sanitizeEvent({ kind: "action.run", target: "task.setStatus", ok: false }, { now, from: "server", match }).event?.ok === false)

  const future = sanitizeEvent({ ...base, at: now.getTime() + 3_600_000 }, { now, from: "browser", match })
  eq("future time clamped to now", future.event?.occurredAt.toISOString(), now.toISOString())
  const ancient = sanitizeEvent({ ...base, at: now.getTime() - 3 * 86_400_000 }, { now, from: "browser", match })
  eq("time more than a day behind clamped to a day", ancient.event?.occurredAt.getTime(), now.getTime() - 86_400_000)

  const noDuration = sanitizeEvent({ kind: "peek.open", path: "/tasks", durationMs: 5, ok: true, target: "x", props: { peek: "task", id: "t1" } }, { now, from: "browser", match })
  eq("fields a kind does not declare are nulled", [noDuration.event?.durationMs, noDuration.event?.ok, noDuration.event?.target], [null, null, null])

  const back = sanitizeEvent({ kind: "frustration.quickback", path: "/clients/mineralife", props: { stayedMs: 1200, to: "/clients" } }, { now, from: "browser", match })
  eq("route-typed prop becomes a pattern", back.event?.props, { stayedMs: 1200, to: "/clients" })
  const typed = sanitizeEvent({ kind: "control.use", path: "/tasks", target: "tasks.quickadd", props: { chars: 31, sent: true, value: "x".repeat(200) } }, { now, from: "browser", match })
  eq("string props capped", String((typed.event?.props as { value: string }).value).length, 60)
  eq("number clamped into range", sanitizeEvent({ kind: "nav.palette", path: "/", props: { chars: 99999 } }, { now, from: "browser", match }).event?.props, { chars: 500 })

  const env = cleanEnvelope({ session: "abc123xyz", surface: "phone", viewport: "phone" }, "Mozilla/5.0")
  eq("envelope keeps a valid browser reading", env, { session: "abc123xyz", surface: "phone", viewport: "phone", synthetic: false })
  eq("bad session id", cleanEnvelope({ session: "x; drop table" }, "").session, "unknown")
  eq("mac app from UA", surfaceFromAgent("Mozilla/5.0 TallKarol/1.0"), "mac_app")
  check("headless Chrome is synthetic", isSyntheticAgent("Mozilla/5.0 HeadlessChrome/152.0"))
  check("webdriver flag is synthetic", cleanEnvelope({ synthetic: true }, "Mozilla/5.0").synthetic)
}

/* ------------------------------------------------------------------ detect */
{
  const rage = createRageDetector()
  eq("rage: first click", rage("a", 0, 10, 10), null)
  eq("rage: second click", rage("a", 300, 12, 11), null)
  eq("rage: third click inside a second fires", rage("a", 600, 14, 9), 3)
  eq("rage: fourth click does not fire again", rage("a", 800, 14, 9), null)
  const slow = createRageDetector()
  slow("a", 0, 0, 0)
  slow("a", 700, 0, 0)
  eq("rage: gap over a second resets", slow("a", 1800, 0, 0), null)
  const far = createRageDetector()
  far("a", 0, 0, 0)
  far("a", 100, 0, 0)
  eq("rage: a click 40px away is a different spot", far("a", 200, 40, 0), null)
  const other = createRageDetector()
  other("a", 0, 0, 0)
  other("a", 100, 0, 0)
  eq("rage: a different element resets", other("b", 200, 0, 0), null)

  check("quick back: back within 4 s", isQuickBack("back", 3999))
  check("quick back: not at 4 s", !isQuickBack("back", 4000))
  check("quick back: a link is not Back", !isQuickBack("link", 500))

  const flip = createFlipFlopDetector()
  eq("flip: first value", flip("t", "board", 0), null)
  eq("flip: second value", flip("t", "list", 1000), null)
  eq("flip: back to the first fires", flip("t", "board", 2000), { value: "list", gapMs: 1000 })
  const seeded = createFlipFlopDetector()
  eq("flip: seeded with data-track-from", seeded("s", "waiting", 0, "moving"), null)
  eq("flip: back to the seeded value fires", seeded("s", "moving", 5000, undefined), { value: "waiting", gapMs: 5000 })
  const slowFlip = createFlipFlopDetector()
  slowFlip("t", "a", 0)
  slowFlip("t", "b", 1000)
  eq("flip: outside 60 s is a decision, not a flip-flop", slowFlip("t", "a", 62_000), null)
  const same = createFlipFlopDetector()
  same("t", "a", 0)
  eq("flip: re-clicking the same value is not a change", same("t", "a", 100), null)

  check("session: expired after 30 min", sessionExpired(0, 30 * 60_000 + 1))
  check("session: alive at 29 min", !sessionExpired(0, 29 * 60_000))
  eq("fingerprint stable", fingerprint("TypeError: x|a.js:1"), fingerprint("TypeError: x|a.js:1"))
  check("fingerprint differs", fingerprint("a") !== fingerprint("b"))
  eq("cookie round trip", parseActivityCookie(encodeActivityCookie("s1abc2", "phone", "phone")), { session: "s1abc2", surface: "phone", viewport: "phone" })
  eq("cookie garbage", parseActivityCookie("nonsense"), null)
}

/* ------------------------------------------------------------------ format */
{
  eq("ms", formatMs(240), "240 ms")
  eq("seconds with a decimal", formatMs(2400), "2.4 s")
  eq("seconds whole", formatMs(18_000), "18 s")
  eq("minutes and seconds", formatMs(221_000), "3m 41s")
  eq("active hours", formatActive(1257 * 60_000), "20h 57m")
  eq("active minutes", formatActive(48 * 60_000), "48m")
  eq("share under 1%", formatShare(1, 400), "<1%")
  eq("humanize action", humanizeId("task.setStatus"), "Task · set status")
  eq("vital rating good", vitalRating("inp", 180), "good")
  eq("vital rating needs work", vitalRating("lcp", 3100), "needs-improvement")
  eq("vital rating poor", vitalRating("cls", 0.3), "poor")
  eq("postgres timestamptz text → ISO", toIso("2026-09-12 23:02:23.45+00"), "2026-09-12T23:02:23.450Z")
  eq("offset with minutes", toIso("2026-09-12 23:02:23+05:30"), "2026-09-12T17:32:23.000Z")
  eq("a Date passes through", toIso(new Date("2026-09-12T10:00:00Z")), "2026-09-12T10:00:00.000Z")
  eq("garbage is null", toIso("not a date"), null)
}

/* ------------------------------------------------------------------ findings */
{
  const input: FindingInput = {
    trackedDays: 45,
    windowDays: 7,
    unopenedNav: [{ label: "Scaffolds" }, { label: "Slinks" }, { label: "Contracts" }, { label: "Notebooks" }, { label: "Worksheets" }],
    navByPage: [
      { label: "projects", views: 57, palette: 46, sidebar: 3, sidebarClicks30d: 4 },
      { label: "Tasks", views: 412, palette: 49, sidebar: 157, sidebarClicks30d: 600 },
    ],
    actions: [
      { label: "Task · set status", runs: 212, failed: 0, p95Ms: 2400, waitedMs: 221_000, lastMessage: null },
      { label: "Meetings · move", runs: 21, failed: 7, p95Ms: 4600, waitedMs: 55_000, lastMessage: "Cal.com events can't be moved from the CRM" },
    ],
    rage: [{ label: "home.week.card", page: "Dashboard", clicks: 9 }],
    quickBacks: [{ page: "Clients · client", backs: 11, views: 36 }],
    unusedControls: [{ label: "Tasks · layout · week" }],
    phonePages: [{ page: "Timesheet · Review", views: 96, phone: 65, outside: 60 }],
  }
  const out = findings(input)
  eq("every rule fires on a rich month", out.findings.map((f) => f.rule), [
    "nav.unopened",
    "nav.bypassed",
    "speed.waited",
    "actions.failing",
    "friction.rage",
    "friction.quickback",
    "control.unused",
    "surface.phone",
  ])
  eq("nothing waiting after 45 days", out.waiting.length, 0)
  const unopened = out.findings[0]
  eq("unopened sentence", `${unopened.lead} ${unopened.rest}`, "Five sidebar rows went unopened for 30 days: Scaffolds, Slinks, Contracts, Notebooks and Worksheets.")
  eq("bypass picks the palette-heavy page", out.findings[1].lead, "You open projects through ⌘K 81% of the time.")
  eq("slowest waiting action", out.findings[2].lead, "Task · set status waits 2.4 s at p95.")
  eq("failing action quotes its message", out.findings[3].rest, "Last message: “Cal.com events can't be moved from the CRM”")
  eq("phone page mentions outside arrivals", out.findings[7].rest, "68% of its visits come from the phone, most of them straight from outside the CRM.")

  const young = findings({ ...input, trackedDays: 2 })
  eq("day two: only the one-day rules fire", young.findings.map((f) => f.rule), ["actions.failing", "friction.rage"])
  eq("day two: six rules wait", young.waiting.length, 6)
  eq("waiting line", waitingLine(young.waiting), "6 rules are still collecting (2 need 3 days, 2 need 7 days, 2 need 30 days; 2 days so far).")

  const quiet = findings({ ...input, rage: [{ label: "x", page: "Tasks", clicks: 4 }], actions: [], phonePages: [], quickBacks: [], unusedControls: [], unopenedNav: [], navByPage: [] })
  eq("below thresholds: nothing", quiet.findings.length, 0)
}

console.log(`${passes} passed, ${failures} failed`)
if (failures) process.exit(1)
