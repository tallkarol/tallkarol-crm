"use client"

import { useState } from "react"
import Link from "next/link"
import { clientColor } from "@/lib/client-colors"
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

function emptyCopy(view: ForecastView) {
  if (view === "earnings") return "Nothing forecast for this month."
  if (view === "retainers") return "No retainers in this month."
  if (view === "projects") return "No project work this month."
  return "No hours logged."
}

export function Forecast({ months }: { months: ForecastMonth[] }) {
  const [view, setView] = useState<ForecastView>("earnings")
  const thisMonth = monthKey(new Date())

  return (
    <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tk-slate/10 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">Forecast</h2>
        <label className="min-w-0">
          <span className="sr-only">Forecast breakdown</span>
          <select
            value={view}
            onChange={(e) => setView(e.target.value as ForecastView)}
            className="max-w-full rounded-lg border border-tk-slate/15 bg-tk-linen/70 px-2 py-1 text-xs text-tk-slate/80 outline-none focus:border-tk-teal"
          >
            {FORECAST_VIEWS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="divide-y divide-tk-slate/10">
        {months.map((m) => {
          const future = m.key > thisMonth
          const visible = linesForView(m.lines, view)
          const total = monthTotal(m.lines, view, future)
          return (
            <div key={m.key} className="px-5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wider text-tk-slate/70">
                    {m.heading}
                  </p>
                  <p className="mt-0.5 text-sm text-tk-slate/70">{m.month}</p>
                </div>
                <p className="text-xl font-semibold tracking-tight text-tk-onyx tabular-nums">
                  {total.cents != null ? (
                    formatMoney(total.cents)
                  ) : (
                    <>
                      {formatHours(total.hours ?? 0)}
                      <span className="ml-1 text-sm font-medium text-tk-slate/70">hr</span>
                    </>
                  )}
                </p>
              </div>
              {visible.length === 0 ? (
                <p className="mt-1.5 text-xs text-tk-slate/60">{emptyCopy(view)}</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {visible.map((line) => {
                    const hours = lineHours(line, view, future)
                    return (
                      <li key={line.id}>
                        <Link
                          href={lineHref(line, m.key)}
                          className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 text-xs hover:underline"
                        >
                          <span className="min-w-0 truncate">
                            <span
                              className="font-semibold"
                              style={{ color: clientColor(line.slug) }}
                            >
                              {line.name}
                            </span>
                            <span className="text-tk-slate/50"> · {kindLabel(line.kind)}</span>
                          </span>
                          <span className="tabular-nums text-tk-slate/70">
                            {view === "earnings" && line.cents != null ? (
                              <>
                                {hours ? <span className="mr-2">{hours}</span> : null}
                                {formatMoney(line.cents)}
                              </>
                            ) : hours ? (
                              hours
                            ) : line.cents != null ? (
                              formatMoney(line.cents)
                            ) : null}
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
    </section>
  )
}
