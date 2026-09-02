"use client"

import { useMemo, useRef, useState } from "react"
import { CHART, METRIC_META, type TrendMetric } from "@/lib/insights/chart"
import { fmtDay, fmtInt, fmtMoney } from "@/lib/insights/derive"
import type { DailyPoint } from "@/lib/insights/types"
import { cn } from "@/lib/cn"

const W = 640
const H = 180
const PAD_TOP = 8

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
 * Daily trend for the selected window with the previous window overlaid as a
 * dashed comparison of the same measure. Metric chips switch what is plotted;
 * everything is already in props — switching costs no fetch.
 */
export function TrendChart({
  current,
  previous,
  metrics,
  initialMetric,
}: {
  current: DailyPoint[]
  previous: DailyPoint[]
  metrics: TrendMetric[]
  initialMetric: TrendMetric
}) {
  const [metric, setMetric] = useState<TrendMetric>(initialMetric)
  const [hover, setHover] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const meta = METRIC_META[metric]
  const color = CHART[meta.series]
  const format = (v: number) => (meta.money ? fmtMoney(v) : fmtInt(v))

  const cur = useMemo(() => current.map((p) => p[metric] ?? 0), [current, metric])
  const prev = useMemo(() => previous.map((p) => p[metric] ?? 0), [previous, metric])

  const yMax = niceMax(Math.max(...cur, ...prev, 1) * 1.1)
  const dx = W / Math.max(cur.length - 1, 1)
  const y = (v: number) => PAD_TOP + (H - PAD_TOP) * (1 - v / yMax)
  const area = `M0 ${H} L${cur
    .map((v, i) => `${(i * dx).toFixed(2)} ${y(v).toFixed(2)}`)
    .join(" L")} L${W} ${H} Z`

  // Four-ish x labels across the window.
  const tickIdx = [0, 1, 2, 3].map((k) =>
    Math.round((k * (cur.length - 1)) / 3)
  )
  const yTicks = [0.25, 0.5, 0.75, 1].map((f) => yMax * f)

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const idx = Math.min(cur.length - 1, Math.max(0, Math.round(x / dx)))
    setHover(idx)
  }

  const h = hover != null ? hover : null
  const tooltipLeftPct = h != null ? (h * dx) / W : 0

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-3">
        <div className="flex flex-wrap gap-1">
          {metrics.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetric(m)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                m === metric
                  ? "bg-tk-onyx text-tk-linen"
                  : "text-tk-slate/70 hover:bg-tk-slate/10 hover:text-tk-onyx"
              )}
            >
              {METRIC_META[m].label}
            </button>
          ))}
        </div>
        <div className="flex gap-4 text-[11px] font-medium text-tk-slate/70">
          <span className="flex items-center gap-1.5">
            <i className="h-[3px] w-3.5 rounded-full" style={{ background: color }} />
            This period
          </span>
          {prev.length > 0 ? (
            <span className="flex items-center gap-1.5">
              <i className="h-[3px] w-3.5 rounded-full" style={{ background: CHART.prev }} />
              Previous
            </span>
          ) : null}
        </div>
      </div>

      <div className="relative px-5 pb-4 pt-2">
        <svg
          ref={svgRef}
          viewBox={`-30 0 ${W + 38} ${H + 22}`}
          className="block w-full"
          role="img"
          aria-label={`Daily ${meta.label.toLowerCase()}, this period versus the previous one`}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {yTicks.map((v) => (
            <g key={v}>
              <line x1={0} y1={y(v)} x2={W} y2={y(v)} stroke={CHART.grid} strokeWidth="1" />
              <text
                x={-8}
                y={y(v) + 3}
                fontSize="9"
                fill={CHART.axisText}
                textAnchor="end"
              >
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
              textAnchor={i === 0 ? "start" : i === cur.length - 1 ? "end" : "middle"}
            >
              {current[i] ? fmtDay(current[i].date) : ""}
            </text>
          ))}

          {prev.length > 1 ? (
            <polyline
              points={linePoints(prev, yMax)}
              fill="none"
              stroke={CHART.prev}
              strokeWidth="1.6"
              strokeDasharray="4 4"
              strokeLinejoin="round"
            />
          ) : null}
          <path d={area} fill={color} opacity=".1" />
          <polyline
            points={linePoints(cur, yMax)}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={W}
            cy={y(cur[cur.length - 1] ?? 0)}
            r="4.5"
            fill={color}
            stroke="#fff"
            strokeWidth="2"
          />

          {h != null ? (
            <g>
              <line x1={h * dx} y1={PAD_TOP} x2={h * dx} y2={H} stroke="rgba(15,22,21,.25)" strokeWidth="1" />
              <circle cx={h * dx} cy={y(cur[h])} r="4.5" fill={color} stroke="#fff" strokeWidth="2" />
              {prev[h] != null ? (
                <circle cx={h * dx} cy={y(prev[h])} r="3.5" fill={CHART.prev} stroke="#fff" strokeWidth="2" />
              ) : null}
            </g>
          ) : null}
        </svg>

        {h != null && current[h] ? (
          <div
            className="pointer-events-none absolute top-3 z-10 rounded-xl bg-tk-onyx px-3 py-2 text-xs text-tk-linen shadow-lg"
            style={
              tooltipLeftPct > 0.62
                ? { right: `${(1 - tooltipLeftPct) * 88 + 6}%` }
                : { left: `${tooltipLeftPct * 88 + 8}%` }
            }
          >
            <p className="font-semibold">{fmtDay(current[h].date)}</p>
            <p className="mt-0.5">
              {meta.label} · {format(cur[h])}
            </p>
            {prev[h] != null && previous[h] ? (
              <p className="text-tk-linen/60">Previous · {format(prev[h])}</p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}
