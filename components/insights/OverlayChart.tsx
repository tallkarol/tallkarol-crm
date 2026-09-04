"use client"

import { useMemo, useRef, useState } from "react"
import { CHART } from "@/lib/insights/chart"
import { fmtDay, fmtInt } from "@/lib/insights/derive"

const W = 640
const H = 200
const PAD_TOP = 8

export type OverlaySeries = {
  id: string
  label: string
  color: string
  values: number[]
}

function niceMax(v: number) {
  if (v <= 4) return 4
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 4, 5, 8, 10]) {
    if (v <= m * pow) return m * pow
  }
  return 10 * pow
}

function linePoints(values: number[], yMax: number) {
  const dx = W / Math.max(values.length - 1, 1)
  return values
    .map((v, i) => `${(i * dx).toFixed(2)},${(PAD_TOP + (H - PAD_TOP) * (1 - v / yMax)).toFixed(2)}`)
    .join(" ")
}

/**
 * Several daily series on one axis. The point of Unfiltered Traffic is the
 * gap between Google's own meters and what Analytics counted after consent.
 */
export function OverlayChart({
  dates,
  series,
}: {
  dates: string[]
  series: OverlaySeries[]
}) {
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const n = dates.length
  const yMax = useMemo(() => {
    const peak = Math.max(1, ...series.flatMap((s) => s.values))
    return niceMax(peak * 1.1)
  }, [series])
  const dx = W / Math.max(n - 1, 1)
  const y = (v: number) => PAD_TOP + (H - PAD_TOP) * (1 - v / yMax)
  const tickIdx = [0, 1, 2, 3].map((k) => Math.round((k * (n - 1)) / 3))
  const yTicks = [0.25, 0.5, 0.75, 1].map((f) => yMax * f)

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg || n === 0) return
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    setHover(Math.min(n - 1, Math.max(0, Math.round(x / dx))))
  }

  const h = hover
  const tooltipLeftPct = h != null ? (h * dx) / W : 0

  return (
    <div>
      <div className="flex flex-wrap gap-4 px-5 pt-3 text-[11px] font-medium text-ink-3">
        {series.map((s) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <i className="h-[3px] w-3.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="relative px-5 pb-4 pt-2">
        <svg
          ref={svgRef}
          viewBox={`-30 0 ${W + 38} ${H + 22}`}
          className="block w-full"
          role="img"
          aria-label="Daily Ads clicks, Search Console clicks, and Analytics sessions"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={0} y1={y(v)} x2={W} y2={y(v)} stroke={CHART.grid} strokeWidth="1" />
              <text x={-8} y={y(v) + 3} fontSize="9" fill={CHART.axisText} textAnchor="end">
                {v >= 1000 ? `${(v / 1000).toLocaleString("en-US")}k` : v}
              </text>
            </g>
          ))}
          <line x1={0} y1={H} x2={W} y2={H} stroke={CHART.grid} strokeWidth="1" />
          {tickIdx.map((i) => (
            <text
              key={i}
              x={i * dx}
              y={H + 15}
              fontSize="9"
              fill={CHART.axisText}
              textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            >
              {dates[i] ? fmtDay(dates[i]) : ""}
            </text>
          ))}
          {series.map((s) =>
            s.values.length > 1 ? (
              <polyline
                key={s.id}
                points={linePoints(s.values, yMax)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null
          )}
          {h != null ? (
            <g>
              <line
                x1={h * dx}
                y1={PAD_TOP}
                x2={h * dx}
                y2={H}
                stroke="rgb(var(--ink-rgb) / 0.25)"
                strokeWidth="1"
              />
              {series.map((s) => (
                <circle
                  key={s.id}
                  cx={h * dx}
                  cy={y(s.values[h] ?? 0)}
                  r="4"
                  fill={s.color}
                  stroke={CHART.halo}
                  strokeWidth="2"
                />
              ))}
            </g>
          ) : null}
        </svg>
        {h != null && dates[h] ? (
          <div
            className="pointer-events-none absolute top-3 z-10 rounded-xl bg-tk-onyx px-3 py-2 text-xs text-tk-linen shadow-overlay"
            style={
              tooltipLeftPct > 0.62
                ? { right: `${(1 - tooltipLeftPct) * 88 + 6}%` }
                : { left: `${tooltipLeftPct * 88 + 8}%` }
            }
          >
            <p className="font-semibold">{fmtDay(dates[h])}</p>
            {series.map((s) => (
              <p key={s.id} className="mt-0.5 flex items-center gap-1.5">
                <i className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                {s.label} · {fmtInt(s.values[h] ?? 0)}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
