"use client"

import { useState } from "react"
import Link from "next/link"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import {
  FORECAST_VIEWS,
  linesForView,
  monthKey,
  monthTotal,
  type ForecastLine,
  type ForecastMonth,
  type ForecastView,
} from "@/lib/forecast"
import { ROUTES } from "@/lib/nav"
import { formatMoney } from "@/lib/work"
import { Card } from "@/components/ui/Card"

function formatHours(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 })
}

function kindLabel(kind: ForecastLine["kind"]) {
  if (kind === "retainer") return "retainer"
  if (kind === "project") return "project"
  return "other"
}

function lineHref(line: ForecastLine, month: string) {
  if (line.invoiceNumber) return ROUTES.invoice(line.invoiceNumber)
  if (line.projectSlug) return ROUTES.project(line.projectSlug)
  if (line.retainerSlug) return ROUTES.timesheetFor(line.clientSlug, month)
  return ROUTES.client(line.clientSlug)
}

function lineHours(line: ForecastLine, view: ForecastView, future: boolean) {
  if (view === "retainers") {
    if (future && line.expectedHours != null) return `${formatHours(line.expectedHours)} hr`
    if (line.expectedHours != null) {
      return `${formatHours(line.loggedHours)}/${line.expectedHours}`
    }
    return `${formatHours(line.loggedHours)} hr`
  }
  if (view === "earnings" && line.loggedHours <= 0 && line.expectedHours != null) {
    return `${formatHours(line.expectedHours)} hr`
  }
  if (line.loggedHours > 0) return `${formatHours(line.loggedHours)} hr`
  if (line.expectedHours != null) return `${formatHours(line.expectedHours)} hr`
  return null
}

/** What a line contributes to the month's bar, in the current view's unit. */
function lineWeight(line: ForecastLine, view: ForecastView, future: boolean) {
  if (view === "timecard" || view === "retainers") {
    if (future && line.expectedHours != null) return line.expectedHours
    return line.loggedHours > 0 ? line.loggedHours : line.expectedHours ?? 0
  }
  return line.cents ?? 0
}

function emptyCopy(view: ForecastView) {
  if (view === "earnings") return "Nothing forecast for this month."
  if (view === "retainers") return "No retainers in this month."
  if (view === "projects") return "No project work this month."
  return "No hours logged."
}

/**
 * Three months, each a total, a stacked bar by client, and the lines behind
 * it. The bar is what makes the card scannable: the month's shape reads
 * before any number does.
 */
export function Forecast({ months }: { months: ForecastMonth[] }) {
  const [view, setView] = useState<ForecastView>("earnings")
  const thisMonth = monthKey(new Date())

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-[18px] py-3">
        <h2 className="font-ui text-[13.5px] font-bold tracking-tight text-tk-onyx">Forecast</h2>
        <label className="min-w-0">
          <span className="sr-only">Forecast breakdown</span>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ForecastView)}
            className="max-w-full rounded-lg border border-line bg-well px-2 py-1 font-ui text-[11.5px] font-semibold text-tk-slate focus:border-tk-teal"
          >
            {FORECAST_VIEWS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="divide-y divide-line">
        {months.map((m) => {
          const future = m.key > thisMonth
          const visible = linesForView(m.lines, view)
          const total = monthTotal(m.lines, view, future)
          const weights = visible.map((line) => Math.max(0, lineWeight(line, view, future)))
          const sum = weights.reduce((a, b) => a + b, 0)
          return (
            <div key={m.key} className="grid gap-2 px-[18px] py-3">
              <div className="flex items-baseline gap-2">
                <p className="font-ui text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-3">
                  {m.heading}
                </p>
                <p className="text-[12.5px] text-tk-slate">{m.month}</p>
                <p className="ml-auto font-display text-[19px] font-semibold tracking-tight text-tk-onyx tabular-nums">
                  {total.cents != null ? (
                    formatMoney(total.cents)
                  ) : (
                    <>
                      {formatHours(total.hours ?? 0)}
                      <span className="ml-1 font-ui text-sm font-medium text-ink-3">hr</span>
                    </>
                  )}
                </p>
              </div>
              {/*
                The one all-pairs surface in the app: adjacent segments of
                different client hues touch with no separator. Three things
                make that legible. The segments take the MARK lift, not the
                ink lift — mark is the only channel that clears 3:1 on the
                well track, and lifting to 52% to match the legend would halve
                pairwise separation again (min oklab dE 0.0316 -> 0.0223). A
                1px gap means touching segments never rely on hue alone. And
                role="img" with a per-client label is the relief the palette
                needs: at any lift, six of fourteen client colours are not
                reliably distinguishable from their nearest neighbour.

                flex-basis must be `1 1` and not `0 0`: with gap-px, `0 0`
                overflows the track by (n-1)px and overflow-hidden clips the
                last client off the end.
              */}
              <div
                role="img"
                aria-label={visible.map((l) => l.name).join(", ")}
                className="flex h-2 gap-px overflow-hidden rounded-full border border-line bg-well"
              >
                {sum > 0
                  ? visible.map((line, i) => (
                      <span
                        key={line.id}
                        title={line.name}
                        className="tk-client-mark block h-full transition-[flex-basis] duration-700 ease-out"
                        style={
                          {
                            flex: `1 1 ${(weights[i] / sum) * 100}%`,
                            "--c": clientColor(line.slug),
                          } as React.CSSProperties
                        }
                      />
                    ))
                  : null}
              </div>
              {visible.length === 0 ? (
                <p className="text-xs text-ink-3">{emptyCopy(view)}</p>
              ) : (
                <ul className="grid gap-1">
                  {visible.map((line) => {
                    const hours = lineHours(line, view, future)
                    return (
                      <li key={line.id}>
                        <Link
                          href={lineHref(line, m.key)}
                          className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 text-xs hover:underline"
                        >
                          <span className="min-w-0 truncate">
                            <span
                              className="tk-client-ink font-ui font-bold"
                              style={{ "--c": clientColor(line.slug) } as React.CSSProperties}
                            >
                              {line.name}
                            </span>
                            <span className="text-ink-3"> · {kindLabel(line.kind)}</span>
                          </span>
                          <span className={cn("tabular-nums text-ink-3", !hours && "hidden")}>
                            {hours}
                          </span>
                          <span className="min-w-[72px] text-right font-medium tabular-nums text-tk-onyx">
                            {view === "earnings" && line.cents != null
                              ? formatMoney(line.cents)
                              : hours
                                ? ""
                                : line.cents != null
                                  ? formatMoney(line.cents)
                                  : ""}
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
