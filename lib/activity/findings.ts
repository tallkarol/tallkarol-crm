import { formatMs, formatShare } from "@/lib/activity/format"

/**
 * Tuning notes, PURE — the same shape as lib/attention.ts. Each rule turns
 * summary numbers into one sentence and names itself and its window, so a
 * note can always be traced to the query that produced it.
 *
 * A rule that needs more history than exists says how many days it has
 * instead of guessing: "not opened in 30 days" means nothing on day three.
 * Thresholds live in FINDING_RULES and nowhere else; `npm run check:activity`
 * covers every rule.
 */

export const FINDING_RULES = {
  "nav.unopened": { needsDays: 30, lookbackDays: 30 },
  "nav.bypassed": { needsDays: 7, lookbackDays: 30, minViews: 15, minPaletteShare: 0.6, maxSidebarShare: 0.1 },
  "speed.waited": { needsDays: 3, minRuns: 20, minP95Ms: 1500 },
  "actions.failing": { needsDays: 1, minFailures: 5, minFailureRate: 0.1 },
  "friction.rage": { needsDays: 1, minClicks: 5 },
  "friction.quickback": { needsDays: 3, minBacks: 8, minShare: 0.2 },
  "control.unused": { needsDays: 30, lookbackDays: 30 },
  "surface.phone": { needsDays: 7, minViews: 20, minPhoneShare: 0.5 },
} as const

export type RuleId = keyof typeof FINDING_RULES
export type FindingKind = "nav" | "slow" | "failing" | "friction" | "unused" | "phone"
export type ActivityView = "overview" | "pages" | "controls" | "friction" | "speed" | "stream" | "modules"

export type Finding = {
  rule: RuleId
  kind: FindingKind
  /** tune = an opportunity; hurt = something is costing you. */
  tone: "tune" | "hurt"
  lead: string
  rest: string
  window: string
  view: ActivityView
}

export type WaitingRule = { rule: RuleId; needsDays: number; hasDays: number }

export type FindingInput = {
  /** Whole days since the first recorded event. */
  trackedDays: number
  windowDays: number
  unopenedNav: { label: string }[]
  navByPage: { label: string; views: number; palette: number; sidebar: number; sidebarClicks30d: number }[]
  actions: { label: string; runs: number; failed: number; p95Ms: number | null; waitedMs: number; lastMessage: string | null }[]
  rage: { label: string; page: string; clicks: number }[]
  quickBacks: { page: string; backs: number; views: number }[]
  unusedControls: { label: string }[]
  phonePages: { page: string; views: number; phone: number; outside: number }[]
}

function list(names: string[], max = 5): string {
  const shown = names.slice(0, max)
  const more = names.length - shown.length
  const joined = shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : shown[0] ?? ""
  return more > 0 ? `${shown.join(", ")} and ${more} more` : joined
}

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"]
const countWord = (n: number) => NUMBER_WORDS[n] ?? String(n)

export function findings(input: FindingInput): { findings: Finding[]; waiting: WaitingRule[] } {
  const out: Finding[] = []
  const waiting: WaitingRule[] = []
  const windowLabel = `${input.windowDays} days`
  const ready = (rule: RuleId) => {
    const needs = FINDING_RULES[rule].needsDays
    if (input.trackedDays >= needs) return true
    waiting.push({ rule, needsDays: needs, hasDays: input.trackedDays })
    return false
  }

  if (ready("nav.unopened") && input.unopenedNav.length) {
    const n = input.unopenedNav.length
    out.push({
      rule: "nav.unopened",
      kind: "nav",
      tone: "tune",
      lead: `${countWord(n)} sidebar ${n === 1 ? "row went" : "rows went"} unopened for 30 days:`,
      rest: `${list(input.unopenedNav.map((r) => r.label))}.`,
      window: "30 days",
      view: "pages",
    })
  }

  if (ready("nav.bypassed")) {
    const r = FINDING_RULES["nav.bypassed"]
    const hit = input.navByPage
      .filter((p) => p.views >= r.minViews && p.palette / p.views >= r.minPaletteShare && p.sidebar / p.views <= r.maxSidebarShare)
      .sort((a, b) => b.palette - a.palette)[0]
    if (hit) {
      out.push({
        rule: "nav.bypassed",
        kind: "nav",
        tone: "tune",
        lead: `You open ${hit.label} through ⌘K ${formatShare(hit.palette, hit.views)} of the time.`,
        rest: `Its sidebar row was clicked ${hit.sidebarClicks30d} ${hit.sidebarClicks30d === 1 ? "time" : "times"} in 30 days.`,
        window: "30 days",
        view: "overview",
      })
    }
  }

  if (ready("speed.waited")) {
    const r = FINDING_RULES["speed.waited"]
    const hit = input.actions
      .filter((a) => a.runs >= r.minRuns && (a.p95Ms ?? 0) >= r.minP95Ms)
      .sort((a, b) => b.waitedMs - a.waitedMs)[0]
    if (hit) {
      out.push({
        rule: "speed.waited",
        kind: "slow",
        tone: "hurt",
        lead: `${hit.label} waits ${formatMs(hit.p95Ms)} at p95.`,
        rest: `Across ${hit.runs} runs that is ${formatMs(hit.waitedMs)} of waiting, more than any other action this often.`,
        window: windowLabel,
        view: "speed",
      })
    }
  }

  if (ready("actions.failing")) {
    const r = FINDING_RULES["actions.failing"]
    const hit = input.actions
      .filter((a) => a.failed >= r.minFailures && a.runs > 0 && a.failed / a.runs >= r.minFailureRate)
      .sort((a, b) => b.failed - a.failed)[0]
    if (hit) {
      out.push({
        rule: "actions.failing",
        kind: "failing",
        tone: "hurt",
        lead: `${hit.label} failed ${hit.failed} of ${hit.runs} times.`,
        rest: hit.lastMessage ? `Last message: “${hit.lastMessage}”` : "It threw without a message.",
        window: windowLabel,
        view: "friction",
      })
    }
  }

  if (ready("friction.rage")) {
    const hit = input.rage.filter((x) => x.clicks >= FINDING_RULES["friction.rage"].minClicks).sort((a, b) => b.clicks - a.clicks)[0]
    if (hit) {
      out.push({
        rule: "friction.rage",
        kind: "friction",
        tone: "hurt",
        lead: `${hit.clicks} rage clicks on ${hit.label}.`,
        rest: `All on ${hit.page}. Something there looks clickable and isn't answering fast enough, or at all.`,
        window: windowLabel,
        view: "friction",
      })
    }
  }

  if (ready("friction.quickback")) {
    const r = FINDING_RULES["friction.quickback"]
    const hit = input.quickBacks
      .filter((q) => q.backs >= r.minBacks && q.views > 0 && q.backs / q.views >= r.minShare)
      .sort((a, b) => b.backs - a.backs)[0]
    if (hit) {
      out.push({
        rule: "friction.quickback",
        kind: "friction",
        tone: "hurt",
        lead: `${hit.page} sends you straight back ${formatShare(hit.backs, hit.views)} of the time.`,
        rest: `${hit.backs} of ${hit.views} visits ended with Back inside 4 seconds.`,
        window: windowLabel,
        view: "pages",
      })
    }
  }

  if (ready("control.unused") && input.unusedControls.length) {
    const n = input.unusedControls.length
    out.push({
      rule: "control.unused",
      kind: "unused",
      tone: "tune",
      lead: `${countWord(n)} instrumented ${n === 1 ? "control has" : "controls have"} no uses in 30 days:`,
      rest: `${list(input.unusedControls.map((c) => c.label), 3)}.`,
      window: "30 days",
      view: "controls",
    })
  }

  if (ready("surface.phone")) {
    const r = FINDING_RULES["surface.phone"]
    const hit = input.phonePages
      .filter((p) => p.views >= r.minViews && p.phone / p.views >= r.minPhoneShare)
      .sort((a, b) => b.phone - a.phone)[0]
    if (hit) {
      out.push({
        rule: "surface.phone",
        kind: "phone",
        tone: "tune",
        lead: `${hit.page} is a phone page.`,
        rest:
          `${formatShare(hit.phone, hit.views)} of its visits come from the phone` +
          (hit.outside / hit.views >= 0.5 ? ", most of them straight from outside the CRM." : "."),
        window: windowLabel,
        view: "pages",
      })
    }
  }

  return { findings: out, waiting }
}

/** The one-line summary under the notes: how many rules are still collecting. */
export function waitingLine(waiting: WaitingRule[]): string | null {
  if (!waiting.length) return null
  const byNeed = new Map<number, number>()
  waiting.forEach((w) => byNeed.set(w.needsDays, (byNeed.get(w.needsDays) ?? 0) + 1))
  const parts = Array.from(byNeed.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([days, n]) => `${n} ${n === 1 ? "needs" : "need"} ${days} ${days === 1 ? "day" : "days"}`)
  return `${waiting.length} ${waiting.length === 1 ? "rule is" : "rules are"} still collecting (${parts.join(", ")}; ${waiting[0].hasDays} ${waiting[0].hasDays === 1 ? "day" : "days"} so far).`
}
