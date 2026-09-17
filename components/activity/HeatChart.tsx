"use client"

import { useEffect, useRef, useState } from "react"
import { Table2 } from "lucide-react"
import { ChartTip, type TipState } from "@/components/activity/ChartTip"
import { cn } from "@/lib/cn"

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const ROW = 26
const GAP = 2
const LEFT = 36
const TOP = 16

/** Active minutes by weekday × hour, one teal ramp from the card (nothing) to the chart teal (the busiest hour). */
export function HeatChart({ grid, tz }: { grid: number[][]; tz: string }) {
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

  const minutes = grid.map((row) => row.map((ms) => Math.round(ms / 60_000)))
  const max = Math.max(1, ...minutes.map((row) => Math.max(...row)))
  const fill = (v: number) =>
    v === 0 ? "rgb(var(--well-rgb))" : `color-mix(in oklab, var(--chart-teal) ${Math.round(12 + (88 * v) / max)}%, rgb(var(--card-rgb)))`
  const height = TOP + ROW * 7

  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
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
          <table className="text-[11.5px]">
            <thead>
              <tr>
                <th className="border-b border-line py-1 pr-2 text-left font-ui text-[10px] font-bold text-ink-3">Day</th>
                {Array.from({ length: 24 }, (_, h) => (
                  <th key={h} className="border-b border-line px-1 py-1 text-right font-mono text-[10px] text-ink-3">
                    {String(h).padStart(2, "0")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {minutes.map((row, d) => (
                <tr key={DAYS[d]}>
                  <td className="border-b border-line py-1 pr-2 font-ui text-ink-2">{DAYS[d]}</td>
                  {row.map((v, h) => (
                    <td key={h} className="border-b border-line px-1 py-1 text-right tabular-nums text-ink-2">
                      {v || "·"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative w-full" onPointerLeave={() => setTip(null)}>
          {width > 0 ? (
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Active minutes by weekday and hour">
              {[0, 6, 12, 18].map((h) => (
                <text key={h} x={LEFT + ((width - LEFT) / 24) * h} y={10} fontSize={10.5} fill="var(--chart-axis)" fontFamily="var(--font-jakarta), system-ui">
                  {String(h).padStart(2, "0")}:00
                </text>
              ))}
              {minutes.map((row, d) => (
                <g key={DAYS[d]}>
                  <text x={LEFT - 8} y={TOP + ROW * d + (ROW - GAP) / 2 + 3.5} textAnchor="end" fontSize={10.5} fill="var(--chart-axis)" fontFamily="var(--font-jakarta), system-ui">
                    {DAYS[d]}
                  </text>
                  {row.map((v, h) => {
                    const cw = (width - LEFT) / 24
                    return (
                      <rect
                        key={h}
                        x={LEFT + cw * h}
                        y={TOP + ROW * d}
                        width={Math.max(1, cw - GAP)}
                        height={ROW - GAP}
                        rx={2}
                        style={{ fill: fill(v) }}
                        className="hover:stroke-[rgb(var(--ink-rgb))] hover:[stroke-width:1.5]"
                        onPointerMove={(e) => {
                          const rect = box.current?.getBoundingClientRect()
                          const hh = String(h).padStart(2, "0")
                          const next = String((h + 1) % 24).padStart(2, "0")
                          setTip({
                            x: rect ? e.clientX - rect.left : 0,
                            y: rect ? e.clientY - rect.top : 0,
                            title: `${DAYS[d]} · ${hh}:00–${next}:00`,
                            rows: [{ value: `${v} min`, label: "active" }],
                          })
                        }}
                      />
                    )
                  })}
                </g>
              ))}
            </svg>
          ) : (
            <div style={{ height }} />
          )}
          <ChartTip tip={tip} width={width} />
        </div>
      )}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 font-ui text-[10.5px] text-ink-3">
        <span>0 min</span>
        <i
          className="block h-2 w-[120px] rounded-sm"
          style={{ background: `linear-gradient(90deg, ${fill(1)}, var(--chart-teal))` }}
        />
        <span>{max} min</span>
        <span className="ml-auto">active minutes in the hour · {tz.replace("_", " ")}</span>
      </div>
    </div>
  )
}
