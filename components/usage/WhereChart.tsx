"use client"

import { useState } from "react"
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts"
import { ChartFrame } from "@/components/revenue/ChartFrame"
import { chartColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { CHART } from "@/lib/insights/chart"
import { dollars, hours, tokens } from "@/lib/usage/format"
import { WHERE_METRICS, type DayClientSeries, type WhereMetric } from "@/lib/usage/types"

/**
 * Where the window's work went: stacked bars per day, one segment per
 * client, one metric at a time — each metric a single unit, never summed
 * across surfaces. Scaled against the window's own busiest day.
 */
export function WhereChart({ series }: { series: DayClientSeries }) {
  const [metric, setMetric] = useState<WhereMetric>("output")
  const fmt = metric === "hours" ? hours : metric === "chat" ? (v: number) => dollars(v, 0) : tokens
  const values = series.values[metric]
  const data = series.days.map((day) => ({ day, label: day.slice(5).replace("-", "/"), ...(values[day] ?? {}) }))
  const present = series.clients.filter((c) => data.some((d) => (d as Record<string, unknown>)[c]))
  const empty = present.length === 0

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Metric">
        {WHERE_METRICS.map((m) => (
          <button
            key={m.key}
            type="button"
            aria-pressed={metric === m.key}
            onClick={() => setMetric(m.key)}
            className={cn(
              "rounded-full border px-2.5 py-1 font-ui text-[11px] font-semibold",
              metric === m.key
                ? "border-accent-ink bg-accent-soft text-accent-ink"
                : "border-line bg-well text-ink-3 hover:text-tk-onyx"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {empty ? (
        <p className="py-10 text-center text-[12.5px] text-ink-3">
          {metric === "output"
            ? "no Claude Code tokens in this window — nothing pushed from the Mac yet, or none carried usage"
            : metric === "hours"
              ? "no metered hours in this window"
              : "no CRM chat turns in this window"}
        </p>
      ) : (
        <ChartFrame>
          {({ width, height }) => (
            <BarChart width={width} height={height} data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                interval={series.days.length > 14 ? Math.ceil(series.days.length / 10) - 1 : 0}
                tick={{ fontSize: 10, fill: CHART.axisText }}
              />
              <YAxis tickLine={false} axisLine={false} width={44} tick={{ fontSize: 10, fill: CHART.axisText }} tickFormatter={(v: number) => fmt(v)} />
              <Tooltip
                cursor={{ fill: CHART.cursor }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0)
                  return (
                    <div className="rounded-xl bg-tk-onyx px-3 py-2 text-xs text-tk-linen shadow-overlay">
                      <p className="font-semibold">
                        {label} · {fmt(total)}
                      </p>
                      <div className="mt-1 space-y-0.5">
                        {payload
                          .filter((p) => Number(p.value) > 0)
                          .map((p) => (
                            <p key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="tk-client-mark-onyx inline-block size-2 rounded-[3px]"
                                  style={{ "--c": chartColor(String(p.dataKey)) } as React.CSSProperties}
                                />
                                {String(p.dataKey)}
                              </span>
                              <span className="font-semibold tabular-nums">{fmt(Number(p.value) || 0)}</span>
                            </p>
                          ))}
                      </div>
                    </div>
                  )
                }}
              />
              {present.map((slug, i) => (
                <Bar
                  key={slug}
                  dataKey={slug}
                  stackId="where"
                  isAnimationActive={false}
                  fill={slug === "no client" ? CHART.prev : chartColor(slug)}
                  radius={i === present.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={26}
                />
              ))}
            </BarChart>
          )}
        </ChartFrame>
      )}
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {present.map((slug) => (
          <span key={slug} className="flex items-center gap-1.5 font-ui text-[10.5px] text-ink-3">
            <span
              className="inline-block size-2 rounded-[3px]"
              style={{ background: slug === "no client" ? CHART.prev : chartColor(slug) }}
            />
            {slug}
          </span>
        ))}
      </div>
    </div>
  )
}
