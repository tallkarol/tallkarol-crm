"use client"

import { useEffect, useRef, useState } from "react"
import { Table2 } from "lucide-react"
import { ChartTip, type TipState } from "@/components/activity/ChartTip"
import { formatActive } from "@/lib/activity/format"
import { cn } from "@/lib/cn"

export type ActiveSeries = { key: string; label: string; color: string; values: number[] }

const H = 232
const M = { left: 34, right: 4, top: 22, bottom: 26 }

function niceMaxMinutes(maxMinutes: number): number {
  const steps = [60, 120, 180, 240, 300, 360, 480, 600, 720, 960, 1200, 1440]
  return steps.find((s) => s >= maxMinutes) ?? Math.ceil(maxMinutes / 240) * 240
}

function topRounded(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h}V${y + rr}A${rr},${rr} 0 0 1 ${x + rr},${y}H${x + w - rr}A${rr},${rr} 0 0 1 ${x + w},${y + rr}V${y + h}Z`
}

/**
 * Active time per day, stacked by surface. Measures its box and draws at real
 * pixels; a Table button swaps in the same numbers as rows.
 */
export function ActiveChart({ labels, series, todayIndex }: { labels: string[]; series: ActiveSeries[]; todayIndex: number }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [tip, setTip] = useState<TipState>(null)
  const [table, setTable] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [table])

  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0))
  const maxMinutes = niceMaxMinutes(Math.max(1, ...totals.map((t) => t / 60_000)))
  const tickStep = maxMinutes <= 300 ? 60 : maxMinutes <= 720 ? 120 : 240
  const peak = totals.indexOf(Math.max(...totals))
  const labelEvery = labels.length > 45 ? 14 : labels.length > 14 ? 5 : 1

  const legend = (
    <div className="flex flex-wrap gap-x-3.5 gap-y-1 font-ui text-[11.5px] font-semibold text-ink-2">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <i className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
          <em className="font-medium not-italic text-ink-3">{formatActive(s.values.reduce((a, b) => a + b, 0))}</em>
        </span>
      ))}
    </div>
  )

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        {legend}
        <button
          type="button"
          aria-pressed={table}
          onClick={() => setTable((t) => !t)}
          className={cn(
            "inline-flex h-[26px] items-center gap-1.5 rounded-lg border px-2 font-ui text-[11px] font-semibold",
            table ? "border-accent-ink/40 bg-accent-soft text-accent-ink" : "border-line text-ink-3 hover:border-line-strong hover:text-ink"
          )}
        >
          <Table2 className="size-3.5" aria-hidden />
          Table
        </button>
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr>
                <th className="border-b border-line py-1.5 pr-3 text-left font-ui text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">Day</th>
                {series.map((s) => (
                  <th key={s.key} className="border-b border-line px-3 py-1.5 text-right font-ui text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
                    {s.label}
                  </th>
                ))}
                <th className="border-b border-line py-1.5 pl-3 text-right font-ui text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {labels.map((label, i) => (
                <tr key={label}>
                  <td className="border-b border-line py-1.5 pr-3 text-ink-2">{label}</td>
                  {series.map((s) => (
                    <td key={s.key} className="border-b border-line px-3 py-1.5 text-right tabular-nums text-ink-2">
                      {formatActive(s.values[i] ?? 0)}
                    </td>
                  ))}
                  <td className="border-b border-line py-1.5 pl-3 text-right tabular-nums text-ink">{formatActive(totals[i])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative w-full" onPointerLeave={() => setTip(null)}>
          {width > 0 ? (
            <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} role="img" aria-label="Active time per day, stacked by surface">
              {(() => {
                const pw = width - M.left - M.right
                const ph = H - M.top - M.bottom
                const y = (minutes: number) => M.top + ph - (minutes / maxMinutes) * ph
                const band = pw / Math.max(1, labels.length)
                const bw = Math.max(2, Math.min(24, band * 0.5))
                const ticks: number[] = []
                for (let t = 0; t <= maxMinutes; t += tickStep) ticks.push(t)
                return (
                  <>
                    {ticks.map((t) => (
                      <g key={t}>
                        <line x1={M.left} x2={width - M.right} y1={y(t) + 0.5} y2={y(t) + 0.5} stroke={t === 0 ? "var(--chart-axis-line)" : "var(--chart-grid)"} />
                        <text x={M.left - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill="var(--chart-axis)" fontFamily="var(--font-jakarta), system-ui">
                          {t === 0 ? "0" : `${t / 60}h`}
                        </text>
                      </g>
                    ))}
                    {labels.map((label, i) => {
                      const cx = M.left + band * i + band / 2
                      let base = 0
                      const total = totals[i]
                      const tipFor = (clientX: number, clientY: number) => {
                        const rect = box.current?.getBoundingClientRect()
                        setTip({
                          x: rect ? clientX - rect.left : cx,
                          y: rect ? clientY - rect.top : M.top,
                          title: label + (i === todayIndex ? " · today" : ""),
                          rows: [
                            ...series.map((s) => ({ value: formatActive(s.values[i] ?? 0), label: s.label, color: s.color })),
                            { value: formatActive(total), label: "active in all" },
                          ],
                        })
                      }
                      const topIndex = series.reduce((last, s, k) => ((s.values[i] ?? 0) > 0 ? k : last), -1)
                      return (
                        <g key={label}>
                          <rect
                            x={M.left + band * i + 1}
                            y={M.top - 6}
                            width={Math.max(1, band - 2)}
                            height={ph + 6}
                            rx={6}
                            tabIndex={0}
                            aria-label={`${label}: ${formatActive(total)} active`}
                            className="cursor-default fill-transparent outline-none hover:fill-[var(--chart-cursor)] focus:fill-[var(--chart-cursor)]"
                            onPointerMove={(e) => tipFor(e.clientX, e.clientY)}
                            onFocus={() => {
                              const rect = box.current?.getBoundingClientRect()
                              tipFor((rect?.left ?? 0) + cx, (rect?.top ?? 0) + M.top)
                            }}
                            onBlur={() => setTip(null)}
                          />
                          {series.map((s, k) => {
                            const v = (s.values[i] ?? 0) / 60_000
                            if (v <= 0) return null
                            const y0 = y(base) - (base > 0 ? 2 : 0)
                            const y1 = y(base + v)
                            base += v
                            const h = Math.max(0, y0 - y1)
                            const d = k === topIndex ? topRounded(cx - bw / 2, y1, bw, h, 4) : `M${cx - bw / 2},${y1}h${bw}v${h}h${-bw}Z`
                            return <path key={s.key} d={d} fill={s.color} className="pointer-events-none" />
                          })}
                          {i % labelEvery === 0 || i === todayIndex ? (
                            <text
                              x={cx}
                              y={H - 8}
                              textAnchor="middle"
                              fontSize={10.5}
                              fontWeight={i === todayIndex ? 700 : 500}
                              fill={i === todayIndex ? "rgb(var(--ink-rgb))" : "var(--chart-axis)"}
                              fontFamily="var(--font-jakarta), system-ui"
                              className="pointer-events-none"
                            >
                              {label}
                            </text>
                          ) : null}
                          {labels.length <= 14 && total > 0 && (i === peak || i === todayIndex) ? (
                            <text x={cx} y={y(total / 60_000) - 7} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--chart-axis)" className="pointer-events-none">
                              {formatActive(total)}
                            </text>
                          ) : null}
                        </g>
                      )
                    })}
                  </>
                )
              })()}
            </svg>
          ) : (
            <div style={{ height: H }} />
          )}
          <ChartTip tip={tip} width={width} />
        </div>
      )}
    </div>
  )
}
