import { CHART } from "@/lib/insights/chart"
import { fmtInt } from "@/lib/insights/derive"
import type { DailyPoint } from "@/lib/insights/types"

const W = 296
const H = 88

function Mini({ title, children, end }: { title: string; children: React.ReactNode; end: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
          {title}
        </p>
        <p className="text-[11px] font-bold tabular-nums text-tk-onyx">{end}</p>
      </div>
      {children}
    </div>
  )
}

/**
 * Clicks and impressions live on very different scales, so they are two
 * small multiples on a shared time axis — never one dual-axis chart.
 */
export function SearchMultiples({ points }: { points: DailyPoint[] }) {
  const clicks = points.map((p) => p.clicks)
  const impressions = points.map((p) => p.impressions)
  const n = points.length
  if (n === 0) return null

  const cMax = Math.max(...clicks, 1) * 1.15
  const gap = 2
  const bw = Math.max((W - (n - 1) * gap) / n, 1.5)
  const iMax = Math.max(...impressions, 1) * 1.12
  const dx = W / Math.max(n - 1, 1)
  const iXY = impressions.map((v, i) => [i * dx, H - (v / iMax) * H] as const)
  const iLine = iXY.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
  const iArea = `M0 ${H} L${iXY.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L")} L${W} ${H} Z`

  const clicksPerDay = clicks[n - 1] ?? 0
  const imprLast = impressions[n - 1] ?? 0

  return (
    <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
      <Mini title="Clicks · daily" end={`${fmtInt(clicksPerDay)} last day`}>
        <svg viewBox={`0 -4 ${W} ${H + 10}`} className="mt-1.5 block w-full" aria-hidden>
          <line x1="0" y1={H} x2={W} y2={H} stroke="rgba(15,22,21,.1)" strokeWidth="1" />
          {clicks.map((v, i) =>
            v > 0 ? (
              <rect
                key={i}
                x={(i * (bw + gap)).toFixed(2)}
                y={(H - (v / cMax) * H).toFixed(2)}
                width={bw.toFixed(2)}
                height={((v / cMax) * H).toFixed(2)}
                rx="2"
                fill={CHART.amber}
              />
            ) : null
          )}
        </svg>
      </Mini>
      <Mini title="Impressions · daily" end={`${fmtInt(imprLast)} last day`}>
        <svg viewBox={`0 -4 ${W} ${H + 10}`} className="mt-1.5 block w-full" aria-hidden>
          <line x1="0" y1={H} x2={W} y2={H} stroke="rgba(15,22,21,.1)" strokeWidth="1" />
          <path d={iArea} fill={CHART.amber} opacity=".12" />
          <polyline
            points={iLine}
            fill="none"
            stroke={CHART.amber}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={W} cy={H - (imprLast / iMax) * H} r="4" fill={CHART.amber} stroke="#fff" strokeWidth="2" />
        </svg>
      </Mini>
    </div>
  )
}
