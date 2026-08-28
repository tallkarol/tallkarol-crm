import { resample } from "@/lib/insights/derive"

const W = 76
const H = 24

/** Tiny area+line trend, resampled to 12 points. Server-rendered, zero JS. */
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  const points = resample(values, 12)
  if (points.length < 2) return <div className="mt-2 h-6" aria-hidden />
  const max = Math.max(...points, 1) * 1.15
  const dx = W / (points.length - 1)
  const xy = points.map((v, i) => [i * dx, H - (v / max) * H] as const)
  const line = xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
  const area = `M0 ${H} L${xy
    .map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" L")} L${W} ${H} Z`
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className="mt-2 h-6 w-full"
      aria-hidden
    >
      <path d={area} fill={color} opacity=".1" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
