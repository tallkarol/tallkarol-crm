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

/* ----------------------------------------------------- confirming blind */

/**
 * Which parked writes may be confirmed from the decision queue, where the
 * only thing on screen is the preview's title.
 *
 * The chat's gate is `ApprovalCard`, and the card shows every field the tool
 * built. A queue row shows one line. So this is not "which tools are safe" —
 * every tool here is safe, that is what the gate is for — it is "which tools
 * say everything they are about to do in their title".
 *
 * Out, and why: `create_calendar_event` puts something where other people can
 * see it; the four `*_punch` tools move billable time and their fields are the
 * whole point; the inbox triage four and `inbox_to_*` file things under a
 * client, which is the field you are checking; `propose_pack_line` writes a
 * sentence into a client's pack, and a sentence cannot be judged by its title.
 * Those rows carry Reject and Open, never Confirm.
 *
 * A table, not a flag on `ToolSpec`, for one boring reason: `lib/waiting-data.ts`
 * needs to read it, `lib/chat/tools-board.ts` already imports that module, and
 * a flag on the spec would close that circle. This file imports nothing that
 * imports it back.
 *
 * `npm run check:waiting` asserts every name here is a real mutating tool, so
 * a rename cannot quietly turn a Confirm button into a dead one.
 */
export const CONFIRM_FROM_STRIP: readonly string[] = [
  "log_time",
  "create_task",
  "complete_task",
  "reschedule_task",
  "dismiss_leftoff",
  "pin_inspiration",
  "refresh_insights",
  "sync_inbox",
  "route_to",
  "solve_task",
  "hand_back",
]

const STRIP_SET = new Set(CONFIRM_FROM_STRIP)

/** True when a queue row may offer Confirm without opening the card. */
export function confirmsFromStrip(toolName: string): boolean {
  return STRIP_SET.has(toolName)
}
