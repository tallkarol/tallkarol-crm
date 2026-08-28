import { CHART } from "@/lib/insights/chart"
import { fmtDay } from "@/lib/insights/derive"
import type { DailyPoint } from "@/lib/insights/types"

const W = 640
const H = 150

/** Static daily chart for the print report — no hover, one measure. */
export function PrintTrend({
  points,
  metric,
  label,
  series,
}: {
  points: DailyPoint[]
  metric: "sessions" | "clicks"
  label: string
  series: "teal" | "amber"
}) {
  const values = points.map((p) => p[metric])
  if (values.length < 2) return null
  const color = series === "teal" ? CHART.teal : CHART.amber
  const yMax = Math.max(...values, 1) * 1.15
  const dx = W / (values.length - 1)
  const y = (v: number) => H - (v / yMax) * H
  const xy = values.map((v, i) => [i * dx, y(v)] as const)
  const line = xy.map(([x, yy]) => `${x.toFixed(2)},${yy.toFixed(2)}`).join(" ")
  const area = `M0 ${H} L${xy.map(([x, yy]) => `${x.toFixed(2)} ${yy.toFixed(2)}`).join(" L")} L${W} ${H} Z`
  const ticks = [0, 1, 2, 3].map((k) => Math.round((k * (values.length - 1)) / 3))
  const last = values[values.length - 1]

  return (
    <svg
      viewBox={`-6 -14 ${W + 44} ${H + 34}`}
      className="block w-full"
      role="img"
      aria-label={`Daily ${label} across the period`}
    >
      {[0.33, 0.66, 1].map((f) => (
        <line
          key={f}
          x1="0"
          y1={H - H * f}
          x2={W}
          y2={H - H * f}
          stroke={CHART.grid}
          strokeWidth="1"
        />
      ))}
      <line x1="0" y1={H} x2={W} y2={H} stroke="rgba(15,22,21,.12)" strokeWidth="1" />
      <path d={area} fill={color} opacity=".1" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={W} cy={y(last)} r="4" fill={color} stroke="#fff" strokeWidth="2" />
      <text x={W + 8} y={y(last) + 3} fontSize="10" fontWeight="700" fill="#0F1615">
        {last.toLocaleString("en-US")}
      </text>
      {ticks.map((i) => (
        <text
          key={i}
          x={i * dx}
          y={H + 15}
          fontSize="9"
          fill={CHART.axisText}
          textAnchor={i === 0 ? "start" : "middle"}
        >
          {points[i] ? fmtDay(points[i].date) : ""}
        </text>
      ))}
    </svg>
  )
}
