"use client"

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CHART } from "@/lib/insights/chart"
import { formatAxisMoney, type MonthlyCashPoint } from "@/lib/revenue"
import { formatMoney } from "@/lib/work"
import { ChartTip } from "./bits"
import { ChartFrame } from "./ChartFrame"

export function CashChart({
  points,
  goalCents,
}: {
  points: MonthlyCashPoint[]
  goalCents: number | null
}) {
  const showExpenses = points.some((point) => point.expenses > 0)
  const data = points.map((point) => ({
    month: point.label,
    billed: point.billed,
    collected: point.collected,
    expenses: point.expenses,
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
            tickFormatter={(value: number) => formatAxisMoney(value)}
          />
          {goalCents ? (
            <ReferenceLine
              y={goalCents}
              stroke={CHART.prev}
              strokeDasharray="4 4"
              ifOverflow="extendDomain"
            />
          ) : null}
          <Tooltip
            cursor={{ fill: "rgba(15,22,21,0.04)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              return (
                <ChartTip
                  label={String(label)}
                  rows={payload
                    .filter((item) => item.dataKey !== "expenses" || showExpenses)
                    .map((item) => ({
                      color: String(item.color ?? CHART.teal),
                      name: String(item.name),
                      value: formatMoney(Number(item.value) || 0),
                    }))}
                />
              )
            }}
          />
          <Bar
            dataKey="billed"
            name="Billed"
            fill={CHART.teal}
            radius={[3, 3, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
          <Bar
            dataKey="collected"
            name="Collected"
            fill="#4C74C9"
            radius={[3, 3, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
          {showExpenses ? (
            <Line
              dataKey="expenses"
              name="Expenses"
              type="monotone"
              stroke={CHART.amber}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ) : null}
        </ComposedChart>
      )}
    </ChartFrame>
  )
}
