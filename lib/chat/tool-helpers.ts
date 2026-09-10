import { monthEnd } from "@/lib/timesheet"

/**
 * Shared types and argument parsers for chat tools.
 *
 * Kept out of `tools.ts` so inbox/board specs can import them without a
 * cycle through the registry.
 */

export type ToolContext = {
  userId: string
  threadId: string
  idempotencyKey: string
}

export type ToolPreview = {
  title: string
  fields: { label: string; value: string }[]
  note?: string
}

export type ToolSpec = {
  name: string
  description: string
  mutating: boolean
  /**
   * Who performs an approved write. Default `crm`: `run()` executes here,
   * under Karol's user. `worker`: the row parks at `approved` and the Mac
   * claims it through /api/chat/pack-writes — for writes whose target lives
   * on the Mac (pack files). `run()` is never called for those.
   */
  executor?: "crm" | "worker"
  parameters: Record<string, unknown>
  preview?: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolPreview>
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
}

export function str(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

export function num(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key]
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value)
  }
  return undefined
}

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/
export const ISO_MONTH = /^\d{4}-\d{2}$/

/** Accepts "2026-06" or "2026-06-01" and returns an inclusive day range. */
export function range(from?: string, to?: string): { from?: string; to?: string } {
  if (from && ISO_MONTH.test(from)) {
    return { from: `${from}-01`, to: to && ISO_DAY.test(to) ? to : monthEnd(from) }
  }
  return {
    from: from && ISO_DAY.test(from) ? from : undefined,
    to: to && ISO_DAY.test(to) ? to : undefined,
  }
}

export function hoursLabel(hours: number): string {
  return `${hours.toFixed(2)} h`
}
