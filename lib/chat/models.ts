import type { ChatPool } from "@/db/schema"

/**
 * The model registry and the escalation ladders.
 *
 * Two pools, and the difference is the whole cost story. Cursor Models
 * (Composer, Grok) carry a large included allowance on Ultra; Other Models
 * (Fable, Opus, Sol) draw on $400 a month. Spillover runs ONE way — an
 * exhausted Cursor pool starts eating the same $400 — so `cursor` is cheap
 * and second in line, never free.
 *
 * Rates are per million tokens, from cursor.com/docs/models-and-pricing.
 * They are here to price our own runs: agent.getUsage() settles late and
 * undercounts subagents, so the ledger in lib/chat/budget.ts prices tokens
 * itself and treats the result as a floor. See CHAT.md.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max" | ""

export type ModelSpec = {
  /** The id passed to the Cursor SDK. */
  id: string
  label: string
  pool: ChatPool
  effort: Effort
  /** Per million tokens. */
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  /**
   * CursorBench 3.2 pass rate and average cost per task. Used for the
   * break-even test below, not for display. Cursor disclosed that a Cursor
   * codebase snapshot reached Grok's training, so Grok's score is the one to
   * verify against our own logged outcomes before trusting it further.
   */
  bench?: { score: number; costPerTask: number }
}

const M = <T extends Record<string, ModelSpec>>(spec: T) => spec

export const MODELS = M({
  "composer-2.5": {
    id: "composer-2.5",
    label: "Composer 2.5",
    pool: "cursor",
    effort: "",
    input: 0.5,
    output: 2.5,
    cacheRead: 0.2,
    cacheWrite: 0.5,
    bench: { score: 56.1, costPerTask: 0.44 },
  },
  "grok-4.6-medium": {
    id: "grok-4.6",
    label: "Grok 4.6 Medium",
    pool: "cursor",
    effort: "medium",
    input: 2,
    output: 6,
    cacheRead: 0.5,
    cacheWrite: 0.5,
    bench: { score: 67.1, costPerTask: 1.28 },
  },
  "grok-4.6-high": {
    id: "grok-4.6",
    label: "Grok 4.6 High",
    pool: "cursor",
    effort: "high",
    input: 2,
    output: 6,
    cacheRead: 0.5,
    cacheWrite: 0.5,
    bench: { score: 69.9, costPerTask: 2.34 },
  },
  "grok-4.6-xhigh": {
    id: "grok-4.6",
    label: "Grok 4.6 XHigh",
    pool: "cursor",
    effort: "xhigh",
    input: 2,
    output: 6,
    cacheRead: 0.5,
    cacheWrite: 0.5,
    bench: { score: 70.8, costPerTask: 2.81 },
  },
  "fable-5.1-xhigh": {
    id: "claude-fable-5.1",
    label: "Fable 5.1 XHigh",
    pool: "other",
    effort: "xhigh",
    input: 10,
    output: 50,
    cacheRead: 0.25,
    cacheWrite: 12.5,
    bench: { score: 72.8, costPerTask: 6.96 },
  },
  "fable-5.1-max": {
    id: "claude-fable-5.1",
    label: "Fable 5.1 Max",
    pool: "other",
    effort: "max",
    input: 10,
    output: 50,
    cacheRead: 0.25,
    cacheWrite: 12.5,
    bench: { score: 73.4, costPerTask: 9.64 },
  },
  "fable-5.1-high": {
    id: "claude-fable-5.1",
    label: "Fable 5.1 High",
    pool: "other",
    effort: "high",
    input: 10,
    output: 50,
    cacheRead: 0.25,
    cacheWrite: 12.5,
    bench: { score: 69.4, costPerTask: 4.8 },
  },
  "opus-5-high": {
    id: "claude-opus-5",
    label: "Opus 5 High",
    pool: "other",
    effort: "high",
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite: 6.25,
    bench: { score: 66.7, costPerTask: 3.91 },
  },
  "opus-5-max": {
    id: "claude-opus-5",
    label: "Opus 5 Max",
    pool: "other",
    effort: "max",
    input: 5,
    output: 25,
    cacheRead: 0.5,
    cacheWrite: 6.25,
    bench: { score: 70.0, costPerTask: 8.23 },
  },
  "sol-max": {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol Max",
    pool: "other",
    effort: "max",
    input: 4,
    output: 20,
    cacheRead: 0.4,
    cacheWrite: 5,
    bench: { score: 67.2, costPerTask: 5.69 },
  },
})

export type ModelKey = keyof typeof MODELS

/**
 * Rungs that are dominated on CursorBench — beaten on BOTH score and price
 * by something in the cheaper pool — and therefore must never appear in a
 * ladder. Kept as a list rather than a comment so the test can assert it.
 *
 *   Fable 5.1 Low/Medium/High and Opus 5 Low/Medium/High/XHigh all lose to
 *   Grok 4.6 High or XHigh, which also bills to the larger allowance.
 *
 * `fable-5.1-high` survives in the registry for ONE job — brand-voice
 * writing — where CursorBench does not apply because the work is short and
 * judged on prose, not on a test suite.
 */
export const DOMINATED_FOR_CODE: readonly ModelKey[] = [
  "fable-5.1-high",
  "opus-5-high",
]

export type JobType =
  | "chat"
  | "trivial_edit"
  | "content_edit"
  | "build_fix"
  | "code_tested"
  | "debug"
  | "review"
  | "review_critical"
  | "security_review"
  | "architecture"
  | "writing"
  | "report"

export type Ladder = {
  job: JobType
  label: string
  /** Cheapest first. One entry means no ladder: go straight there. */
  rungs: readonly ModelKey[]
  /** What promotes a turn. Empty means nothing can — the tier is the answer. */
  detector: string
  /** Hard cap on escalations regardless of rungs listed. */
  maxEscalations: number
  note: string
}

/**
 * A rung only earns its place when the cheap attempt costs less than the
 * expensive one times the odds the cheap one works — otherwise you pay twice
 * for the privilege. `breakEven` states the ratio the cheap rung has to clear;
 * `laddersAreSound` checks every configured pair against it.
 *
 * Ladders exist only where a machine can tell us the attempt failed for free.
 * Security review, architecture and brand voice have no such detector — a
 * missed finding is silent — so they go straight to the tier that should
 * have run first.
 */
export const LADDERS: Record<JobType, Ladder> = {
  chat: {
    job: "chat",
    label: "Chat and read-only questions",
    rungs: ["composer-2.5"],
    detector: "",
    maxEscalations: 0,
    note: "Latency hurts more than spend when someone is waiting.",
  },
  trivial_edit: {
    job: "trivial_edit",
    label: "Trivial edits, renames, links",
    rungs: ["composer-2.5", "grok-4.6-high"],
    detector: "lint, build",
    maxEscalations: 1,
    note: "Real-world success here runs far above the benchmark's hard tasks.",
  },
  content_edit: {
    job: "content_edit",
    label: "Content edit",
    rungs: ["composer-2.5", "grok-4.6-high"],
    detector: "terminology and schema validators",
    maxEscalations: 1,
    note: "Client vocabulary rules are mechanical — catch them without a model.",
  },
  build_fix: {
    job: "build_fix",
    label: "Build or dependency fix",
    rungs: ["composer-2.5", "grok-4.6-high"],
    detector: "compiler exit code",
    maxEscalations: 1,
    note: "Run the build first. Most failures never need a frontier model.",
  },
  code_tested: {
    job: "code_tested",
    label: "Code change with tests",
    rungs: ["grok-4.6-medium", "grok-4.6-xhigh", "fable-5.1-max"],
    detector: "test suite",
    maxEscalations: 2,
    note: "Raise effort first, change family last — a high-effort failure means the approach was wrong.",
  },
  debug: {
    job: "debug",
    label: "Hard debugging",
    rungs: ["grok-4.6-xhigh", "opus-5-max"],
    detector: "repro still fails",
    maxEscalations: 1,
    note: "Ends on a different family on purpose.",
  },
  review: {
    job: "review",
    label: "Routine review",
    rungs: ["grok-4.6-xhigh"],
    detector: "",
    maxEscalations: 0,
    note: "A different family from the writer, still on the larger allowance.",
  },
  review_critical: {
    job: "review_critical",
    label: "Review that matters",
    rungs: ["sol-max"],
    detector: "",
    maxEscalations: 0,
    note: "Highest issue recall of the families we have.",
  },
  security_review: {
    job: "security_review",
    label: "Security review",
    rungs: ["opus-5-max"],
    detector: "",
    maxEscalations: 0,
    note: "A missed finding produces no signal, so a cheap first pass proves nothing.",
  },
  architecture: {
    job: "architecture",
    label: "Architecture and planning",
    rungs: ["opus-5-max"],
    detector: "",
    maxEscalations: 0,
    note: "Failure surfaces days later, long past any detector.",
  },
  writing: {
    job: "writing",
    label: "Brand-voice writing",
    rungs: ["fable-5.1-high"],
    detector: "",
    maxEscalations: 0,
    note: "Short jobs. Judging the prose costs what escalating would save.",
  },
  report: {
    job: "report",
    label: "Report assembly",
    rungs: ["composer-2.5", "grok-4.6-high"],
    detector: "section schema",
    maxEscalations: 1,
    note: "Only the closing narrative goes to a premium model.",
  },
}

export function modelFor(key: ModelKey): ModelSpec {
  return MODELS[key]
}

export function ladderFor(job: JobType): Ladder {
  return LADDERS[job] ?? LADDERS.chat
}

/** The next rung up, or null when the ladder is spent. */
export function nextRung(job: JobType, rung: number): ModelKey | null {
  const ladder = ladderFor(job)
  if (rung + 1 > ladder.maxEscalations) return null
  return ladder.rungs[rung + 1] ?? null
}

/**
 * The share of attempts the cheap rung must win for the ladder to beat going
 * straight to the expensive one: cost_cheap / cost_expensive.
 */
export function breakEven(cheap: ModelKey, expensive: ModelKey): number | null {
  const a = MODELS[cheap].bench
  const b = MODELS[expensive].bench
  if (!a || !b || b.costPerTask === 0) return null
  return a.costPerTask / b.costPerTask
}

/** Expected cost of "try cheap, escalate on failure", in benchmark dollars. */
export function laddered(cheap: ModelKey, expensive: ModelKey): number | null {
  const a = MODELS[cheap].bench
  const b = MODELS[expensive].bench
  if (!a || !b) return null
  return a.costPerTask + (1 - a.score / 100) * b.costPerTask
}

/**
 * Every adjacent pair in every ladder must clear its break-even, or the rung
 * loses money on average. Exercised by scripts/check-chat.ts.
 */
export function laddersAreSound(): { job: JobType; problem: string }[] {
  const problems: { job: JobType; problem: string }[] = []
  for (const ladder of Object.values(LADDERS)) {
    for (let i = 0; i < ladder.rungs.length - 1; i++) {
      const cheap = ladder.rungs[i]
      const dear = ladder.rungs[i + 1]
      const need = breakEven(cheap, dear)
      const has = MODELS[cheap].bench
      if (need == null || !has) continue
      if (has.score / 100 < need) {
        problems.push({
          job: ladder.job,
          problem: `${MODELS[cheap].label} must win ${(need * 100).toFixed(0)}% to justify escalating to ${MODELS[dear].label}, but scores ${has.score}%.`,
        })
      }
    }
  }
  return problems
}

export type TokenUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export const NO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}

/** Price a run from the registry. Cents, so the ledger stays integral-ish. */
export function priceCents(key: ModelKey, usage: TokenUsage): number {
  const m = MODELS[key]
  if (!m) return 0
  const perToken = (rate: number, tokens: number) => (rate * tokens) / 1_000_000
  const dollars =
    perToken(m.input, usage.inputTokens) +
    perToken(m.output, usage.outputTokens) +
    perToken(m.cacheRead, usage.cacheReadTokens) +
    perToken(m.cacheWrite, usage.cacheWriteTokens)
  return dollars * 100
}
