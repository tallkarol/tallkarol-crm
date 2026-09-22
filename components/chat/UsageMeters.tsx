import { cn } from "@/lib/cn"
import type { UsageRailBar, UsageRailView } from "@/lib/usage/types"

/**
 * The four bars Claude and Cursor draw themselves: weekly Fable / other,
 * monthly Grok / Other. A bar is only filled when that product reported
 * the percent. Anthropic API dollars live on /usage — they have no cap
 * to draw a bar against. The context panel frames these; this is the bars.
 */
export function UsageMeters({ usage }: { usage: UsageRailView }) {
  return (
    <div className="flex flex-col gap-2.5" aria-label="Model usage">
      {usage.bars.map((row) => (
        <Bar key={row.key} row={row} />
      ))}
    </div>
  )
}

function Bar({ row }: { row: UsageRailBar }) {
  const tone = row.pct === null ? "ok" : row.pct >= 90 ? "bad" : row.pct >= 75 ? "warn" : "ok"
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-ui text-[11.5px] font-semibold text-tk-onyx">{row.title}</span>
        <span className="font-mono text-[11px] tabular-nums text-ink-2">{row.value}</span>
      </div>
      <div className="relative mt-1 h-[5px] rounded-full bg-line">
        {row.pct !== null ? (
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : "bg-accent-mark"
            )}
            style={{ width: `${Math.min(100, Math.max(0, row.pct))}%` }}
          />
        ) : null}
      </div>
    </div>
  )
}
