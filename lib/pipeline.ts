import type { Inquiry } from "@/db/schema"
import { meetingIsUpcoming, readLead } from "@/lib/lead"

/** Sales pipeline stages with win probability for weighted totals. */
export const SALES_STAGES = [
  { id: "needs-look", label: "Needs look", prob: 10 },
  { id: "fit", label: "Fit", prob: 35 },
  { id: "meeting", label: "Meeting booked", prob: 60 },
  { id: "sent", label: "Proposal sent", prob: 80 },
  { id: "closed", label: "Closed", prob: 100 },
] as const
export type SalesStageId = (typeof SALES_STAGES)[number]["id"]

export function isSalesStage(value: unknown): value is SalesStageId {
  return SALES_STAGES.some((s) => s.id === value)
}

export type PipelineState = {
  stage: SalesStageId
  valueCents: number | null
  stageChangedAt: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/**
 * Board placement for a lead. An explicit drag (payload.pipeline.stage) wins;
 * otherwise the stage is derived from the existing lead state, so the board
 * is populated correctly the first time it renders.
 */
export function readPipeline(row: Inquiry): PipelineState {
  const payload = row.payload
  const raw = isRecord(payload) && isRecord(payload.pipeline) ? payload.pipeline : {}
  const explicit = isSalesStage(raw.stage) ? raw.stage : null

  let derived: SalesStageId = "needs-look"
  const lead = readLead(payload)
  if (row.status === "closed") derived = "closed"
  else if (lead.sends.length > 0) derived = "sent"
  else if (meetingIsUpcoming(lead.meetingAt)) derived = "meeting"
  else if (lead.qualification === "fit") derived = "fit"

  return {
    stage: explicit ?? derived,
    valueCents: typeof raw.valueCents === "number" ? raw.valueCents : null,
    stageChangedAt:
      typeof raw.stageChangedAt === "string" ? raw.stageChangedAt : null,
  }
}

export function mergePipelinePayload(
  payload: unknown,
  patch: Partial<PipelineState>
): Record<string, unknown> {
  const base = isRecord(payload) ? { ...payload } : {}
  const current = isRecord(base.pipeline) ? base.pipeline : {}
  return { ...base, pipeline: { ...current, ...patch } }
}

/** Delivery board stages for project workstreams. */
export const WORKSTREAM_STAGES = [
  { id: "building", label: "Building" },
  { id: "review", label: "Under review" },
  { id: "feedback", label: "Implementing feedback" },
  { id: "approved", label: "Approved" },
  { id: "live", label: "Live" },
] as const

export function ordinal(n: number) {
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : n % 10 === 1
        ? "st"
        : n % 10 === 2
          ? "nd"
          : n % 10 === 3
            ? "rd"
            : "th"
  return `${n}${suffix}`
}
