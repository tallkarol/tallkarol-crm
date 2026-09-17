import { dollars } from "@/lib/usage/format"
import {
  ageLabel,
  ageMs,
  latestBySource,
  parseClaudeMax,
  parseCursor,
} from "@/lib/usage/snapshots"
import type { UsageRailBar, UsageRailView } from "@/lib/usage/types"

const DAY = 86_400_000
/** Weekly Claude figures stay useful until the window they describe ends. */
const CLAUDE_WEEK_FRESH_MS = 7 * DAY
/** Cursor's cycle is a month; ten days matches the dashboard tile. */
const CURSOR_FRESH_MS = 10 * DAY

/**
 * The four bars the vendors themselves draw: Claude's weekly Fable cap
 * (50% of the Max week) and the rest of that week, Cursor's monthly Grok
 * / Cursor-models pool and the $400 Other-models pool. Percents only when
 * that product reported them.
 */
export async function usageRail(now = new Date()): Promise<UsageRailView> {
  const snaps = await latestBySource().catch(() => ({}) as Awaited<ReturnType<typeof latestBySource>>)
  const claude = snaps.claude_max ? parseClaudeMax(snaps.claude_max) : null
  const cursor = snaps.cursor_dashboard ? parseCursor(snaps.cursor_dashboard) : null

  const claudeAge = claude ? ageLabel(ageMs(claude.observedAt, now)) : ""
  const claudeFresh = claude ? ageMs(claude.observedAt, now) <= CLAUDE_WEEK_FRESH_MS : false
  const cursorAge = cursor ? ageLabel(ageMs(cursor.observedAt, now)) : ""
  const cursorFresh = cursor ? ageMs(cursor.observedAt, now) <= CURSOR_FRESH_MS : false

  const fablePct = claude?.fableWeekPct ?? null
  const otherWeekPct = claude?.otherWeekPct ?? null
  const grokPct = cursor?.cursorModelsPct ?? null
  const otherUsd = cursor?.otherModelsUsd ?? null
  const otherPool = cursor?.otherModelsPoolUsd ?? null
  const otherPct =
    cursor?.otherModelsPct ??
    (otherUsd !== null && otherPool ? (otherUsd / otherPool) * 100 : null)
  const resets = claude?.resets7d ? ` · ${claude.resets7d}` : ""
  const cycle = cursor?.cycleEnd ? ` · ${cursor.cycleEnd}` : ""

  const bars: UsageRailBar[] = [
    {
      key: "claude-fable",
      title: "Claude · Fable",
      pct: claudeFresh ? fablePct : null,
      hasReading: fablePct !== null,
      age: claudeAge,
      value: claudeFresh && fablePct !== null ? `${Math.round(fablePct)}%${resets}` : fablePct !== null ? `last ${claudeAge}` : "no reading",
    },
    {
      key: "claude-other",
      title: "Claude · other",
      pct: claudeFresh ? otherWeekPct : null,
      hasReading: otherWeekPct !== null,
      age: claudeAge,
      value: claudeFresh && otherWeekPct !== null ? `${Math.round(otherWeekPct)}%${resets}` : otherWeekPct !== null ? `last ${claudeAge}` : "no reading",
    },
    {
      key: "cursor-grok",
      title: "Cursor · Grok",
      pct: cursorFresh ? grokPct : null,
      hasReading: grokPct !== null,
      age: cursorAge,
      value: cursorFresh && grokPct !== null ? `${Math.round(grokPct)}%${cycle}` : grokPct !== null ? `last ${cursorAge}` : "no reading",
    },
    {
      key: "cursor-other",
      title: "Cursor · Other",
      pct: cursorFresh ? otherPct : null,
      hasReading: otherPct !== null || otherUsd !== null,
      age: cursorAge,
      value:
        cursorFresh && otherUsd !== null
          ? `${dollars(otherUsd, otherUsd < 10 ? 2 : 0)}${otherPool ? ` of ${dollars(otherPool, 0)}` : ""}`
          : cursorFresh && otherPct !== null
            ? `${Math.round(otherPct)}%`
            : otherPct !== null || otherUsd !== null
              ? `last ${cursorAge}`
              : "no reading",
    },
  ]

  return { bars }
}
