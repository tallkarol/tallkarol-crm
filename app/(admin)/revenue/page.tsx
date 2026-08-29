import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { Forecast } from "@/components/dashboard/Forecast"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { ClientTable } from "@/components/revenue/ClientTable"
import { HealthStrip } from "@/components/revenue/HealthStrip"
import { HorizonPanel } from "@/components/revenue/HorizonPanel"
import { MixPanel } from "@/components/revenue/MixPanel"
import { MonthlyBoard } from "@/components/revenue/MonthlyBoard"
import { QuarterGrid } from "@/components/revenue/QuarterGrid"
import { RangeSwitch } from "@/components/revenue/RangeSwitch"
import { RateBars } from "@/components/revenue/RateBars"
import { YearGapBar } from "@/components/revenue/YearGapBar"
import { YearRunway } from "@/components/revenue/YearRunway"
import { db } from "@/db"
import { getWriteoffs } from "@/app/(admin)/retainers/actions"
import { CHART_ORDER } from "@/lib/client-colors"
import { billingGaps } from "@/lib/engagements"
import { buildForecast } from "@/lib/forecast"
import { getGoals } from "@/lib/goals"
import { ROUTES } from "@/lib/nav"
import {
  TREND_MONTHS,
  buildRevenue,
  formatWholeMoney,
  parseRevenueRange,
} from "@/lib/revenue"
import { formatMoney } from "@/lib/work"

export const metadata = { title: "Revenue" }
export const dynamic = "force-dynamic"

export default async function RevenuePage({
  searchParams,
}: {
  searchParams: { range?: string; peek?: string }
}) {
  const range = parseRevenueRange(searchParams.range)
  const [
    invoices,
    retainers,
    projects,
    timeEntries,
    expenses,
    goals,
    writeoffs,
  ] = await Promise.all([
    db.query.invoices.findMany({ with: { client: true } }),
    db.query.retainers.findMany({ with: { client: true } }),
    db.query.projects.findMany({
      with: { client: true, deliverables: true },
    }),
    db.query.timeEntries.findMany({ with: { client: true } }),
    db.query.expenses.findMany(),
    getGoals(),
    getWriteoffs(),
  ])

  const now = new Date()
  const model = buildRevenue(
    { range, invoices, retainers, projects, entries: timeEntries, expenses, goals },
    now
  )
  const forecast = buildForecast(
    {
      retainers,
      invoices,
      projects,
      entries: timeEntries,
      order: CHART_ORDER,
    },
    now
  )
  const gaps = billingGaps(
    retainers.filter((retainer) => retainer.status === "active"),
    timeEntries,
    invoices,
    writeoffs,
    now
  )

  const { kpis, yearPlan, quarters, horizons } = model
  const [monthHorizon, quarterHorizon, yearHorizon] = horizons

  // The year panel is the one that needs the run-rate arithmetic spelled out.
  const yearNote =
    yearPlan.gapCents == null ? undefined : yearPlan.gapCents <= 0 ? (
      <>
        Booked work already clears the year by{" "}
        <b className="font-semibold text-tk-onyx">
          {formatWholeMoney(-yearPlan.gapCents)}
        </b>
        .
      </>
    ) : (
      <>
        Booked work lands{" "}
        <b className="font-semibold text-tk-onyx">
          {formatWholeMoney(yearPlan.landingCents)}
        </b>
        . Closing the year needs{" "}
        <b className="font-semibold text-tk-onyx">
          {formatWholeMoney(yearPlan.gapCents)}
        </b>{" "}
        of new work
        {yearPlan.perMonthCents != null && yearPlan.monthsLeftLabel
          ? ` — about ${formatWholeMoney(yearPlan.perMonthCents)}/mo across ${yearPlan.monthsLeftLabel}.`
          : " before year end."}
      </>
    )

  // The pace board now carries the landing shortfall, so Watch is left for
  // genuine exceptions.
  const notes: string[] = []
  if (model.concentration >= 0.4 && model.topClientName) {
    notes.push(
      `${model.topClientName} is ${Math.round(model.concentration * 100)}% of ${kpis.periodLabel.toLowerCase()}.`
    )
  }
  if (kpis.outstandingCents > 0) {
    notes.push(`${formatMoney(kpis.outstandingCents)} sent and still unpaid.`)
  }
  if (gaps.length > 0) {
    const gapValue = gaps.reduce((sum, gap) => sum + (gap.valueCents ?? 0), 0)
    notes.push(
      `${gaps.length} billing gap${gaps.length === 1 ? "" : "s"} on retainers${gapValue ? ` · ${formatMoney(gapValue)} logged and never invoiced` : ""}.`
    )
  }

  return (
    <>
      <PageHeader
        title="Revenue"
        actions={
          <>
            <RangeSwitch range={range} />
            <Link
              href={ROUTES.settings}
              className="text-xs font-semibold text-tk-teal hover:underline"
            >
              Goals →
            </Link>
          </>
        }
      />
      <p className="mt-1 text-sm text-tk-slate/70">
        Month, quarter and year against goal — then the detail behind them. The
        range switch drives the detail; the pace board always reads the current
        period.
      </p>
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref={ROUTES.revenue} />
      ) : null}

      <div className="mt-8 grid gap-3 lg:grid-cols-3">
        <HorizonPanel horizon={monthHorizon} />
        <HorizonPanel horizon={quarterHorizon} />
        <HorizonPanel horizon={yearHorizon} note={yearNote} />
      </div>

      {notes.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-amber-700/30 bg-amber-700/[0.07] px-5 py-3 text-sm text-tk-slate">
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-800">
            Watch
          </p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          {gaps.length > 0 ? (
            <Link
              href={ROUTES.retainers}
              className="mt-2 inline-block text-xs font-semibold text-tk-teal hover:underline"
            >
              Review retainers →
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="mt-3">
        <YearGapBar plan={yearPlan} quarters={quarters} />
      </div>

      <div className="mt-3">
        <QuarterGrid quarters={quarters} />
      </div>

      <div className="mt-6">
        <MonthlyBoard
          stack={model.stack}
          cash={model.cash}
          series={model.series}
          goalCents={kpis.monthlyGoalCents}
          note={`Last ${TREND_MONTHS} months · ${formatMoney(
            model.cash.reduce((sum, point) => sum + point.billed, 0)
          )} billed`}
        />
      </div>

      <div className="mt-3">
        <HealthStrip kpis={kpis} periodLabel={kpis.periodLabel} />
      </div>

      <div className="mt-6">
        <ClientTable
          rows={model.clients}
          periodLabel={kpis.periodLabel}
          quarterLabel={quarterHorizon.periodLabel}
          blendedCents={kpis.hourlyCents}
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <RateBars rows={model.clients} />
        <MixPanel title="Work mix" slices={model.mix} />
        <MixPanel title="Cash mix" slices={model.cashMix} />
      </div>

      <div className="mt-6 grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
        <YearRunway
          year={kpis.yearKey}
          months={model.runway}
          landingCents={kpis.landingCents}
          goalCents={kpis.annualGoalCents}
        />
        <Forecast months={forecast.months} />
      </div>
    </>
  )
}
