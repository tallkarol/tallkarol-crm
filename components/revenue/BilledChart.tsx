"use client"

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
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

/**
 * The run-rate view: what got billed each month against the month goal, with
 * a three-month average so one loud month doesn't read as a trend.
 */
export function BilledChart({
  points,
  goalCents,
}: {
  points: MonthlyCashPoint[]
  goalCents: number | null
}) {
  const data = points.map((point) => ({
    month: point.label,
    billed: point.billed,
    remainder: point.remainder,
    avg3: point.avg3,
  }))
  const last = data[data.length - 1]

  return (
    <ChartFrame>
      {({ width, height }) => (
        <ComposedChart
          width={width}
          height={height}
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          barCategoryGap="30%"
        >
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            interval={1}
            tick={{ fontSize: 10, fill: CHART.axisText }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={40}
            tick={{ fontSize: 10, fill: CHART.axisText }}
            tickFormatter={(value: number) => formatAxisMoney(value)}
          />
          {goalCents ? (
            <ReferenceLine
              y={goalCents}
              stroke="#0F1615"
              strokeOpacity={0.55}
              strokeWidth={1.25}
              strokeDasharray="5 4"
              ifOverflow="extendDomain"
            />
          ) : null}
          <Tooltip
            cursor={{ fill: CHART.cursor }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const row = payload[0]?.payload as {
                billed: number
                remainder: number
                avg3: number
              }
              return (
                <ChartTip
                  label={String(label)}
                  rows={[
                    {
                      color: CHART.teal,
                      name: "Billed",
                      value: formatMoney(row.billed),
                    },
                    ...(row.remainder > 0
                      ? [
                          {
                            name: "Still to invoice",
                            value: formatMoney(row.remainder),
                          },
                        ]
                      : []),
                    {
                      color: CHART.amber,
                      name: "3-month average",
                      value: formatMoney(row.avg3),
                    },
                  ]}
                />
              )
            }}
          />
          <Bar
            dataKey="billed"
            name="Billed"
            stackId="month"
            fill={CHART.teal}
            maxBarSize={26}
            isAnimationActive={false}
          />
          <Bar
            dataKey="remainder"
            name="Still to invoice"
            stackId="month"
            fill={CHART.teal}
            fillOpacity={0.34}
            radius={[3, 3, 0, 0]}
            maxBarSize={26}
            isAnimationActive={false}
          />
          <Line
            dataKey="avg3"
            name="3-month average"
            type="monotone"
            stroke={CHART.amber}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {last ? (
            <ReferenceDot
              x={last.month}
              y={last.avg3}
              r={3.5}
              fill={CHART.amber}
              stroke="none"
            />
          ) : null}
        </ComposedChart>
      )}
    </ChartFrame>
  )
}
