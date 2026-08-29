"use client"

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CHART } from "@/lib/insights/chart"
import { formatAxisRate, type MonthlyCashPoint } from "@/lib/revenue"
import { formatMoney } from "@/lib/work"
import { ChartTip } from "./bits"
import { ChartFrame } from "./ChartFrame"

export function RateChart({ points }: { points: MonthlyCashPoint[] }) {
  const data = points.map((point) => ({
    month: point.label,
    rate: point.rate,
    hours: point.hours,
    billed: point.billed,
  }))

  return (
    <ChartFrame>
      {({ width, height }) => (
        <ComposedChart
          width={width}
          height={height}
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
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
            tickFormatter={(value: number) => formatAxisRate(value)}
          />
          <Tooltip
            cursor={{ stroke: "rgba(15,22,21,0.16)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const row = payload[0]?.payload as {
                rate: number | null
                hours: number
                billed: number
              }
              return (
                <ChartTip
                  label={String(label)}
                  rows={[
                    {
                      color: CHART.teal,
                      name: "Billed rate",
                      value: row.rate != null ? `${formatMoney(row.rate)}/hr` : "—",
                    },
                    {
                      name: "Hours billed",
                      value: row.hours.toLocaleString("en-US", {
                        maximumFractionDigits: 1,
                      }),
                    },
                    {
                      name: "Billed",
                      value: formatMoney(row.billed),
                    },
                  ]}
                />
              )
            }}
          />
          <Area
            dataKey="rate"
            type="monotone"
            stroke={CHART.teal}
            fill={CHART.teal}
            fillOpacity={0.12}
            strokeWidth={2}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      )}
    </ChartFrame>
  )
}
