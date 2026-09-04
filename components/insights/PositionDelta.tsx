/**
 * Search-position movement chip. Position is inverted (lower = better), so an
 * improvement renders ▲ with the number of places gained.
 */
import { CHART } from "@/lib/insights/chart"

export function PositionDelta({
  position,
  prevPosition,
}: {
  position: number
  prevPosition: number | null
}) {
  if (prevPosition == null) {
    return (
      <span className="inline-block rounded bg-tk-teal/10 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-tk-teal">
        New
      </span>
    )
  }
  const moved = prevPosition - position
  if (Math.abs(moved) < 0.05) {
    return <span className="text-[11px] font-medium text-ink-3">—</span>
  }
  const better = moved > 0
  return (
    <span
      className="inline-block rounded px-1.5 py-px text-[10px] font-bold tabular-nums"
      style={
        better
          ? { color: CHART.good, background: "rgba(27,107,58,.09)" }
          : { color: CHART.bad, background: "rgba(166,34,40,.08)" }
      }
      title={`Position ${prevPosition.toFixed(1)} → ${position.toFixed(1)}`}
    >
      {better ? "▲" : "▼"} {Math.abs(moved).toFixed(1)}
    </span>
  )
}
