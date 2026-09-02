"use client"

import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { ChartFrame } from "@/components/revenue/ChartFrame"
import { chartColor } from "@/lib/client-colors"
import { formatAxisMoney } from "@/lib/revenue"
import { formatMoney } from "@/lib/work"

export type RevenuePoint = {
  month: string // "May 25"
  values: Record<string, number> // slug -> cents
}

export function RevenueChart({
  points,
  series,
}: {
  points: RevenuePoint[]
  series: { slug: string; name: string }[]
  className?: string
}) {
  const data = points.map((p) => ({ month: p.month, ...p.values }))

  return (
    <ChartFrame>
      {({ width, height }) => (
        <BarChart
          width={width}
          height={height}
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barCategoryGap="30%"
        >
          <CartesianGrid vertical={false} stroke="rgba(15,22,21,0.08)" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            interval={1}
            tick={{ fontSize: 10, fill: "#71807D" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            tick={{ fontSize: 10, fill: "#71807D" }}
            tickFormatter={(v: number) => formatAxisMoney(v)}
          />
          <Tooltip
            cursor={{ fill: "rgba(15,22,21,0.04)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0)
              return (
                <div className="rounded-xl bg-tk-onyx px-3 py-2 text-xs text-tk-linen shadow-lg">
                  <p className="font-semibold">
                    {label} · {formatMoney(total)}
                  </p>
                  <div className="mt-1 space-y-0.5">
                    {payload.map((p) => (
                      <p key={String(p.dataKey)} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block size-2 rounded-[3px]"
                            style={{ background: p.color }}
                          />
                          {series.find((s) => s.slug === String(p.dataKey))?.name ?? String(p.dataKey)}
                        </span>
                        <span className="font-semibold tabular-nums">
                          {formatMoney(Number(p.value) || 0)}
                        </span>
                      </p>
                    ))}
                  </div>
                </div>
              )
            }}
          />
          {series.map((s, i) => (
            <Bar
              key={s.slug}
              dataKey={s.slug}
              stackId="rev"
              isAnimationActive={false}
              fill={chartColor(s.slug)}
              radius={i === series.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={26}
            />
          ))}
        </BarChart>
      )}
    </ChartFrame>
  )
}
