/**
 * Delivery board stages for project workstreams.
 *
 * The sales stages used to live here too, duplicating `LeadStage` in
 * `lib/lead.ts`. They now live there alone, with the leads board — this file
 * is only about the work after a lead is won.
 */
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
