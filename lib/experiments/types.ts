import { addDays } from "@/lib/insights/derive"

/**
 * A page an experiment watches.
 *
 * `role` is what stops a reading being read too generously: `target` is what we
 * changed, `guardrail` is what the change might have stolen from, and `context`
 * is neither but worth seeing.
 */
export type PageSpec = {
  key: string
  label: string
  /** GA4 `pagePath`. Matched with and without a trailing slash. */
  path: string
  role: "target" | "guardrail" | "context"
}

export type FormLocationSpec = {
  key: string
  label: string
}

/** Funnel counts for one page, one form location, or the whole site. */
export type FunnelCounts = {
  sessions: number
  views: number
  ctaClicks: number
  formStarts: number
  formSubmits: number
  leads: number
}

export const EMPTY_FUNNEL: FunnelCounts = {
  sessions: 0,
  views: 0,
  ctaClicks: 0,
  formStarts: 0,
  formSubmits: 0,
  leads: 0,
}

export type ReadingPayload = {
  version: 1
  /** Keyed by `PageSpec.key`. */
  pages: Record<string, FunnelCounts>
  /** Keyed by GA4 `form_location`. Empty until the dimension has data. */
  formLocations: Record<string, FunnelCounts>
  sitewide: FunnelCounts
  /** Enquiries recorded server-side, which do not depend on cookie consent. */
  crmLeads: number | null
  /** Anything that would make these numbers read oddly later. */
  caveats: string[]
}

export const CHECKPOINTS = ["baseline", "d30", "d60", "d90"] as const
export type Checkpoint = (typeof CHECKPOINTS)[number]

export const CHECKPOINT_LABEL: Record<Checkpoint, string> = {
  baseline: "Baseline",
  d30: "+30 days",
  d60: "+60 days",
  d90: "+90 days",
}

const CHECKPOINT_DAYS: Record<Exclude<Checkpoint, "baseline">, number> = {
  d30: 30,
  d60: 60,
  d90: 90,
}

/**
 * The window a checkpoint measures. Baseline is the stored pre-period; the rest
 * run from the day the change shipped to N days later, so each window contains
 * the one before it — cumulative, not sliced, because at these volumes a single
 * 30-day slice is mostly noise.
 */
export function checkpointWindow(
  experiment: { startedOn: string; baselineFrom: string; baselineTo: string },
  checkpoint: Checkpoint
): { from: string; to: string } {
  if (checkpoint === "baseline") {
    return { from: experiment.baselineFrom, to: experiment.baselineTo }
  }
  return {
    from: experiment.startedOn,
    to: addDays(experiment.startedOn, CHECKPOINT_DAYS[checkpoint] - 1),
  }
}

/** A checkpoint is ready to capture once its window has fully elapsed. */
export function checkpointReady(
  experiment: { startedOn: string; baselineFrom: string; baselineTo: string },
  checkpoint: Checkpoint,
  today: string
): boolean {
  return checkpointWindow(experiment, checkpoint).to < today
}

export function isCheckpoint(value: string): value is Checkpoint {
  return (CHECKPOINTS as readonly string[]).includes(value)
}

export function rate(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null
}
