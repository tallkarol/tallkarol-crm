/**
 * Checks for the "where I left off" rules — what each hook event means, when
 * a chat counts as parked, which rows are still worth showing, and how they
 * sort. Nothing here touches a database. Run with `npm run check:leftoff`.
 */

import {
  LEFTOFF_RULES,
  buildPayload,
  clip,
  deriveState,
  eventState,
  isVisible,
  projectFromCwd,
  resumeCommand,
  sortViews,
  toView,
  type NoteFacts,
} from "../lib/leftoff"

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}\n       got  ${a}\n       want ${e}`)
  }
}

const NOW = new Date("2026-09-02T18:00:00.000Z")
const minAgo = (m: number) => new Date(NOW.getTime() - m * 60_000)

function note(over: Partial<NoteFacts> = {}): NoteFacts {
  return {
    sessionRef: "e1d87fb2-0db4-48dc-a848-f8cafe29cd9d",
    surface: "claude",
    title: "Punch lists feature",
    project: "tallkarol",
    cwd: "/Users/karolbuczek/Work/tallkarol",
    branch: "main",
    lastPrompt: "add a where I left off section",
    lastReply: "Plan written; four questions.",
    state: "waiting",
    body: "",
    pinned: false,
    eventAt: minAgo(5),
    startedAt: minAgo(60),
    endedAt: null,
    dismissedAt: null,
    meta: {},
    ...over,
  }
}

console.log("event → state")
check("UserPromptSubmit → working", eventState("UserPromptSubmit"), "working")
check("Stop → waiting", eventState("Stop"), "waiting")
check("Cursor afterAgentResponse keeps working", eventState("afterAgentResponse"), "working")
check("Cursor stop → waiting", eventState("stop"), "waiting")
check("Notification permission_prompt → blocked", eventState("Notification", "permission_prompt"), "blocked")
check("Notification idle_prompt → waiting", eventState("Notification", "idle_prompt"), "waiting")
check("Notification other → touch only", eventState("Notification", "auth_success"), null)
check("SubagentStop → touch only", eventState("SubagentStop"), null)
check("SessionEnd → gone", eventState("SessionEnd"), "gone")
check("gone → gone", eventState("gone"), "gone")
check("note → touch only", eventState("note"), null)

console.log("derived state")
check("waiting 5 min ago stays waiting", deriveState(note(), NOW), "waiting")
check("waiting 29 min ago stays waiting", deriveState(note({ eventAt: minAgo(LEFTOFF_RULES.parkedAfterMin - 1) }), NOW), "waiting")
check("waiting 31 min ago is parked", deriveState(note({ eventAt: minAgo(LEFTOFF_RULES.parkedAfterMin + 1) }), NOW), "parked")
check("blocked 31 min ago is parked", deriveState(note({ state: "blocked", eventAt: minAgo(31) }), NOW), "parked")
check("blocked 2 min ago is blocked", deriveState(note({ state: "blocked", eventAt: minAgo(2) }), NOW), "blocked")
check("working 90 min ago is working", deriveState(note({ state: "working", eventAt: minAgo(90) }), NOW), "working")
check("working 121 min ago lost its Stop → parked", deriveState(note({ state: "working", eventAt: minAgo(LEFTOFF_RULES.lostStopHours * 60 + 1) }), NOW), "parked")
check("gone stays gone however old", deriveState(note({ state: "gone", eventAt: minAgo(1) }), NOW), "gone")
check("manual note never parks", deriveState(note({ surface: "manual", eventAt: minAgo(600) }), NOW), "waiting")
check("unknown stored state reads as waiting", deriveState(note({ state: "weird" }), NOW), "waiting")

console.log("visibility")
check("live row visible", isVisible(note(), NOW), true)
check("dismissed hidden", isVisible(note({ dismissedAt: minAgo(1) }), NOW), false)
check("dismissed but pinned still hidden (dismiss wins)", isVisible(note({ dismissedAt: minAgo(1), pinned: true }), NOW), false)
check("gone 1h ago still shown", isVisible(note({ state: "gone", endedAt: minAgo(60) }), NOW), true)
check("gone 13h ago hidden", isVisible(note({ state: "gone", endedAt: minAgo(13 * 60) }), NOW), false)
check("gone 13h ago but pinned shown", isVisible(note({ state: "gone", endedAt: minAgo(13 * 60), pinned: true }), NOW), true)
check("gone 13h ago with a body shown", isVisible(note({ state: "gone", endedAt: minAgo(13 * 60), body: "finish the widget" }), NOW), true)
check("gone without ended_at hidden", isVisible(note({ state: "gone", endedAt: null }), NOW), false)

console.log("sorting")
const views = [
  toView(note({ sessionRef: "w", state: "working", eventAt: minAgo(1) }), NOW),
  toView(note({ sessionRef: "p", state: "waiting", eventAt: minAgo(45) }), NOW),
  toView(note({ sessionRef: "b", state: "blocked", eventAt: minAgo(3) }), NOW),
  toView(note({ sessionRef: "g", state: "gone", endedAt: minAgo(10), eventAt: minAgo(10) }), NOW),
  toView(note({ sessionRef: "wait-old", state: "waiting", eventAt: minAgo(20) }), NOW),
  toView(note({ sessionRef: "wait-new", state: "waiting", eventAt: minAgo(2) }), NOW),
  toView(note({ sessionRef: "pin", state: "working", eventAt: minAgo(500), pinned: true }), NOW),
]
check(
  "pinned, blocked, parked, waiting (newest first), working, gone",
  sortViews(views).map((v) => v.sessionRef),
  ["pin", "b", "p", "wait-new", "wait-old", "w", "g"]
)

console.log("payload")
const payload = buildPayload(
  [
    note({ sessionRef: "a", state: "waiting", eventAt: minAgo(2) }),
    note({ sessionRef: "b", state: "waiting", eventAt: minAgo(40) }),
    note({ sessionRef: "c", state: "blocked", eventAt: minAgo(1) }),
    note({ sessionRef: "d", state: "working", eventAt: minAgo(1) }),
    note({ sessionRef: "e", state: "waiting", dismissedAt: minAgo(1) }),
    note({ sessionRef: "manual:1", surface: "manual", body: "call Joe", title: "" }),
    note({
      sessionRef: "browser:chrome",
      surface: "browser",
      title: "3 tabs",
      meta: { windows: [{ title: "Railway", tabs: [{ title: "Railway", url: "https://railway.app", active: true }] }] },
    }),
  ],
  NOW
)
check("counts exclude dismissed, manual and browser", payload.counts, { working: 1, waiting: 1, blocked: 1, parked: 1 })
check("browser row leaves the list", payload.notes.some((n) => n.surface === "browser"), false)
check("browser snapshot surfaces separately", payload.browser?.windows[0]?.tabs[0]?.url, "https://railway.app")
check("manual note titled from its body", payload.notes.find((n) => n.surface === "manual")?.title, "call Joe")
check("dismissed row absent", payload.notes.some((n) => n.sessionRef === "e"), false)
check("ago label", payload.notes.find((n) => n.sessionRef === "b")?.ago, "40m")

console.log("helpers")
check("resume command for claude", resumeCommand(note()), "cd '/Users/karolbuczek/Work/tallkarol' && claude --resume e1d87fb2-0db4-48dc-a848-f8cafe29cd9d")
check("resume quotes a single quote", resumeCommand(note({ cwd: "/Users/k/it's" })), "cd '/Users/k/it'\\''s' && claude --resume e1d87fb2-0db4-48dc-a848-f8cafe29cd9d")
check("no resume for cursor", resumeCommand(note({ surface: "cursor", sessionRef: "cursor:abc" })), "")
check("no resume for a junk id", resumeCommand(note({ sessionRef: "x; rm -rf /" })), "")
check("project from cwd", projectFromCwd("/Users/karolbuczek/Work/tallkarol/"), "tallkarol")
check("clip flattens and caps", clip("a\n\n b   c".repeat(200), 10), "a b ca b …")

console.log("")
if (failures) {
  console.log(`${failures} check(s) failed`)
  process.exit(1)
}
console.log("all leftoff checks passed")
