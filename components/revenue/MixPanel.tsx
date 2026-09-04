"use client"

import { Cell, Pie, PieChart, Tooltip } from "recharts"
import { formatMoney } from "@/lib/work"
import type { MixSlice } from "@/lib/revenue"
import { ChartTip, MIX_COLORS } from "./bits"

function Donut({
  slices,
  total,
}: {
  slices: MixSlice[]
  total: number
}) {
  if (slices.length === 0 || total <= 0) {
    return (
      <p className="px-5 py-8 text-sm text-ink-3">Nothing in this window.</p>
    )
  }

  return (
    <div className="relative mx-auto" style={{ width: 160, height: 160 }}>
      <PieChart width={160} height={160}>
          <Pie
            data={slices}
            dataKey="cents"
            nameKey="label"
            innerRadius={46}
            outerRadius={68}
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {slices.map((slice) => (
              <Cell key={slice.id} fill={MIX_COLORS[slice.id] ?? "#9AA6A2"} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null
              const slice = payload[0]
              return (
                <ChartTip
                  label={String(slice.name)}
                  rows={[
                    {
                      color: String(slice.payload?.fill ?? ""),
                      name: "Share",
                      value: `${Math.round((Number(slice.value) / total) * 100)}%`,
                    },
                    {
                      name: "Billed",
                      value: formatMoney(Number(slice.value) || 0),
                    },
                  ]}
                />
              )
            }}
          />
        </PieChart>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
          Total
        </p>
        <p className="text-sm font-semibold tabular-nums text-tk-onyx">
          {formatMoney(total)}
        </p>
      </div>
    </div>
  )
}

export function MixPanel({
  title,
  slices,
}: {
  title: string
  slices: MixSlice[]
}) {
  const total = slices.reduce((sum, slice) => sum + slice.cents, 0)
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">{title}</h2>
      </div>
      <div className="grid items-center gap-4 px-5 py-4 sm:grid-cols-[auto_1fr]">
        <Donut slices={slices} total={total} />
        <ul className="space-y-2">
          {slices.map((slice) => {
            const share = total > 0 ? Math.round((slice.cents / total) * 100) : 0
            return (
              <li key={slice.id}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-tk-onyx">
                    <span
                      className="inline-block size-2 rounded-[3px]"
                      style={{ background: MIX_COLORS[slice.id] ?? "#9AA6A2" }}
                    />
                    {slice.label}
                  </span>
                  <span className="tabular-nums text-ink-3">
                    {share}% · {formatMoney(slice.cents)}
                  </span>
                </div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-well">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${share}%`,
                      background: MIX_COLORS[slice.id] ?? "#9AA6A2",
                    }}
                  />
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
