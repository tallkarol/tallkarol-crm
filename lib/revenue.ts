import { CHART_ORDER } from "@/lib/client-colors"
import { retainerRateCents } from "@/lib/engagements"
import { retainerCoversMonth, monthKey as forecastMonthKey } from "@/lib/forecast"
import type { Goals } from "@/lib/goals"

/**
 * Revenue page model.
 *
 * Billed follows the dashboard: every invoice by issuedOn, drafts included.
 * Collected is paid. Outstanding is sent. Hourly rate is billed on invoices
 * that carry hours ÷ those hours — time-entry hours are coverage, not the
 * rate denominator, because the timesheet is still filling in historically.
 */

export const REVENUE_RANGES = [
  { id: "ytd", label: "This year" },
  { id: "t12", label: "Trailing 12" },
  { id: "all", label: "All time" },
] as const

export type RevenueRange = (typeof REVENUE_RANGES)[number]["id"]

export const TREND_MONTHS = 16
export const SPARK_MONTHS = 12

export function parseRevenueRange(raw?: string): RevenueRange {
  if (raw === "t12" || raw === "all") return raw
  return "ytd"
}

export function monthKey(d: Date | string) {
  if (typeof d === "string") return d.slice(0, 7)
  return forecastMonthKey(d)
}

export function monthLabelShort(key: string) {
  const [y, m] = key.split("-").map(Number)
  return `${new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" })} ${String(y).slice(2)}`
}

export function monthLabelLong(key: string) {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
}

export function rangeHref(range: RevenueRange) {
  return range === "ytd" ? "/revenue" : `/revenue?range=${range}`
}

function padMonth(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`
}

function addMonths(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number)
  return monthKey(new Date(y, m - 1 + delta, 1))
}

function monthsBack(now: Date, count: number) {
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    keys.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)))
  }
  return keys
}

function inMonths(iso: string, startYm: string | null, endYm: string | null) {
  const ym = iso.slice(0, 7)
  if (startYm && ym < startYm) return false
  if (endYm && ym > endYm) return false
  return true
}

export function periodWindow(
  range: RevenueRange,
  now: Date
): { start: string | null; end: string; label: string } {
  const end = monthKey(now)
  if (range === "all") return { start: null, end, label: "All time" }
  if (range === "ytd") {
    return {
      start: padMonth(now.getFullYear(), 0),
      end,
      label: String(now.getFullYear()),
    }
  }
  return {
    start: monthKey(new Date(now.getFullYear(), now.getMonth() - 11, 1)),
    end,
    label: "Trailing 12 months",
  }
}

function priorWindow(
  range: RevenueRange,
  now: Date
): { start: string; end: string } | null {
  if (range === "all") return null
  if (range === "ytd") {
    const year = now.getFullYear() - 1
    return { start: padMonth(year, 0), end: padMonth(year, now.getMonth()) }
  }
  return {
    start: monthKey(new Date(now.getFullYear(), now.getMonth() - 23, 1)),
    end: monthKey(new Date(now.getFullYear(), now.getMonth() - 12, 1)),
  }
}

function hoursOf(value: string | null | undefined) {
  if (value == null || value === "") return 0
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function invoiceKind(
  invoice: Pick<RevenueInvoice, "retainerId" | "projectId">
): "retainer" | "project" | "other" {
  if (invoice.retainerId) return "retainer"
  if (invoice.projectId) return "project"
  return "other"
}

function rateCents(amountCents: number, hours: number) {
  if (hours <= 0) return null
  return Math.round(amountCents / hours)
}

/**
 * Whole dollars, for figures that get scanned rather than reconciled. The
 * pace board rounds; anything you would tie back to an invoice keeps cents.
 */
export function formatWholeMoney(cents: number) {
  return Math.round(cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
}

export function formatAxisMoney(cents: number) {
  if (!cents) return "0"
  const dollars = cents / 100
  if (Math.abs(dollars) >= 1000) return `$${Math.round(dollars / 1000)}k`
  return `$${Math.round(dollars)}`
}

export function formatAxisRate(cents: number) {
  if (!cents) return "0"
  return `$${Math.round(cents / 100)}`
}

export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

export function chartSeries(
  slugs: Iterable<string>,
  nameOf: (slug: string) => string
) {
  const present = new Set(slugs)
  const known = CHART_ORDER.filter((slug) => present.has(slug))
  const extra = Array.from(present)
    .filter((slug) => !CHART_ORDER.includes(slug))
    .sort()
  return [...known, ...extra].map((slug) => ({ slug, name: nameOf(slug) }))
}

export type RevenueInvoice = {
  id: string
  number: string
  issuedOn: string
  amountCents: number
  hours: string | null
  status: "draft" | "sent" | "paid"
  retainerId: string | null
  projectId: string | null
  client: { id: string; slug: string; name: string }
}

export type RevenueRetainer = {
  id: string
  name: string
  slug: string
  hoursPerMonth: number
  rateCents: number | null
  status: "active" | "paused" | "ended"
  startsOn: string | null
  endsOn: string | null
  client: { id: string; slug: string; name: string }
}

export type RevenueProject = {
  name: string
  deliverables: {
    status: string
    feeCents: number | null
    dueOn: string | null
  }[]
}

export type RevenueEntry = {
  occurredOn: string
  hours: string
  retainerId: string | null
  client: { id: string; slug: string; name: string }
}

export type RevenueExpense = {
  occurredOn: string
  amountCents: number
  clientId: string | null
}

export type MonthlyStackPoint = {
  key: string
  label: string
  values: Record<string, number>
}

export type MonthlyCashPoint = {
  key: string
  label: string
  billed: number
  collected: number
  expenses: number
  hours: number
  rate: number | null
  /** Trailing three-month average of billed, so a loud month reads as a month. */
  avg3: number
  /** Booked but not yet invoiced — only ever non-zero on the current month. */
  remainder: number
}

export type ClientRow = {
  slug: string
  name: string
  billedCents: number
  /** Billed inside the current quarter, whatever the range switch says. */
  quarterCents: number
  collectedCents: number
  outstandingCents: number
  hourlyCents: number | null
  invoiceHours: number
  loggedHours: number
  retainerCents: number
  projectCents: number
  otherCents: number
  share: number
  spark: number[]
}

export type MixSlice = {
  id: string
  label: string
  cents: number
}

export type RunwayMonth = {
  key: string
  label: string
  cents: number
  kind: "actual" | "remainder" | "forecast"
}

export const QUARTER_IDS = ["Q1", "Q2", "Q3", "Q4"] as const
export type QuarterId = (typeof QUARTER_IDS)[number]

/**
 * How far through a period we are, and what a flat run at goal would have
 * billed by now. `aheadCents` is the only number worth reading: billed minus
 * that expectation. Positive is ahead of pace.
 */
export type Pace = {
  elapsedDays: number
  totalDays: number
  fraction: number
  expectedCents: number
  aheadCents: number
}

export type HorizonId = "month" | "quarter" | "year"

/** ahead: billed clears pace. behind: even booked work misses goal. */
export type Verdict = "ahead" | "track" | "behind"

export type Horizon = {
  id: HorizonId
  label: string
  /** Just the period: "August", "Q3", "2026". */
  periodLabel: string
  through: string
  billedCents: number
  /** Booked and expected inside this period, not yet invoiced. */
  bookedCents: number
  landingCents: number
  goalCents: number | null
  goalShare: number | null
  landingShare: number | null
  pace: Pace | null
  verdict: Verdict
  deltaPct: number | null
  deltaSuffix: string | null
}

export type QuarterRow = {
  id: QuarterId
  label: string
  monthsLabel: string
  billedCents: number
  bookedCents: number
  landingCents: number
  goalCents: number | null
  share: number | null
  state: "past" | "current" | "future"
}

export type YearPlan = {
  yearKey: string
  ytdCents: number
  bookedCents: number
  landingCents: number
  goalCents: number | null
  /** Goal minus landing. Negative once booked work clears the year. */
  gapCents: number | null
  monthsLeft: number
  monthsLeftLabel: string | null
  perMonthCents: number | null
  h1BilledCents: number
  h2LandingCents: number
  halfGoalCents: number | null
}

export type RevenueKpis = {
  monthLabel: string
  monthCents: number
  priorMonthCents: number
  periodLabel: string
  billedCents: number
  priorPeriodCents: number | null
  collectedCents: number
  outstandingCents: number
  draftCents: number
  hourlyCents: number | null
  hourlyHours: number
  hourlyBilledCents: number
  expenseCents: number
  netCents: number
  recurringCents: number
  recurringHours: number
  landingCents: number
  /** Booked on this month but not yet invoiced. */
  monthRemainderCents: number
  ytdCents: number
  /** Same months last year, for the year-on-year read. */
  priorYtdCents: number
  annualGoalCents: number | null
  monthlyGoalCents: number | null
  yearKey: string
}

export type RevenueModel = {
  range: RevenueRange
  kpis: RevenueKpis
  series: { slug: string; name: string }[]
  stack: MonthlyStackPoint[]
  cash: MonthlyCashPoint[]
  clients: ClientRow[]
  mix: MixSlice[]
  cashMix: MixSlice[]
  runway: RunwayMonth[]
  horizons: Horizon[]
  quarters: QuarterRow[]
  yearPlan: YearPlan
  concentration: number
  topClientName: string | null
}

function sumInvoices(
  invoices: RevenueInvoice[],
  start: string | null,
  end: string | null,
  pred?: (invoice: RevenueInvoice) => boolean
) {
  let cents = 0
  let hours = 0
  let hourlyCents = 0
  for (const invoice of invoices) {
    if (!inMonths(invoice.issuedOn, start, end)) continue
    if (pred && !pred(invoice)) continue
    cents += invoice.amountCents
    const hrs = hoursOf(invoice.hours)
    if (hrs > 0) {
      hours += hrs
      hourlyCents += invoice.amountCents
    }
  }
  return { cents, hours, hourlyCents }
}

function sumEntries(
  entries: RevenueEntry[],
  start: string | null,
  end: string | null,
  pred?: (entry: RevenueEntry) => boolean
) {
  let hours = 0
  for (const entry of entries) {
    if (!inMonths(entry.occurredOn, start, end)) continue
    if (pred && !pred(entry)) continue
    hours += hoursOf(entry.hours)
  }
  return hours
}

function sumExpenses(
  expenses: RevenueExpense[],
  start: string | null,
  end: string | null
) {
  let cents = 0
  for (const expense of expenses) {
    if (!inMonths(expense.occurredOn, start, end)) continue
    cents += expense.amountCents
  }
  return cents
}

function computeRunway(
  invoices: RevenueInvoice[],
  retainers: RevenueRetainer[],
  projects: RevenueProject[],
  entries: RevenueEntry[],
  now: Date
): { ytdCents: number; landingCents: number; months: RunwayMonth[] } {
  const yearKey = String(now.getFullYear())
  const thisMonth = monthKey(now)
  const rates = new Map(
    retainers.map((retainer) => [
      retainer.id,
      retainerRateCents(retainer, invoices),
    ])
  )
  const loggedThisMonth = new Map<string, number>()
  for (const entry of entries) {
    if (entry.retainerId && entry.occurredOn.startsWith(thisMonth)) {
      loggedThisMonth.set(
        entry.retainerId,
        (loggedThisMonth.get(entry.retainerId) ?? 0) + hoursOf(entry.hours)
      )
    }
  }

  const alreadyInvoiced = (retainerId: string, key: string) =>
    invoices.some(
      (invoice) =>
        invoice.retainerId === retainerId && invoice.issuedOn.slice(0, 7) === key
    )

  const retainerExpectation = (key: string, isCurrent: boolean) => {
    let sum = 0
    for (const retainer of retainers) {
      const rate = rates.get(retainer.id)
      if (!rate) continue
      if (alreadyInvoiced(retainer.id, key)) continue
      if (retainerCoversMonth(retainer, key)) {
        sum += rate * retainer.hoursPerMonth
      } else if (isCurrent) {
        const logged = loggedThisMonth.get(retainer.id) ?? 0
        if (logged > 0) sum += Math.round(logged * rate)
      }
    }
    return sum
  }

  let remainder = 0
  for (const retainer of retainers) {
    const rate = rates.get(retainer.id)
    if (!rate || alreadyInvoiced(retainer.id, thisMonth)) continue
    if (retainerCoversMonth(retainer, thisMonth)) {
      remainder += rate * retainer.hoursPerMonth
    } else {
      const logged = loggedThisMonth.get(retainer.id) ?? 0
      if (logged > 0) remainder += Math.round(logged * rate)
    }
  }
  for (const project of projects) {
    for (const deliverable of project.deliverables) {
      if (
        deliverable.status === "done" &&
        deliverable.feeCents &&
        (!deliverable.dueOn || deliverable.dueOn.slice(0, 7) <= thisMonth)
      ) {
        remainder += deliverable.feeCents
      }
    }
  }

  const months: RunwayMonth[] = []
  let ytdCents = 0
  for (let month = 0; month <= now.getMonth(); month++) {
    const key = padMonth(now.getFullYear(), month)
    const cents = invoices
      .filter((invoice) => invoice.issuedOn.startsWith(key))
      .reduce((sum, invoice) => sum + invoice.amountCents, 0)
    ytdCents += cents
    months.push({
      key,
      label: new Date(now.getFullYear(), month, 1).toLocaleDateString("en-US", {
        month: "long",
      }),
      cents,
      kind: "actual",
    })
  }
  if (remainder > 0) {
    months.push({
      key: `${thisMonth}-remainder`,
      label: now.toLocaleDateString("en-US", { month: "long" }),
      cents: remainder,
      kind: "remainder",
    })
  }
  for (let month = now.getMonth() + 1; month < 12; month++) {
    const key = padMonth(now.getFullYear(), month)
    const pending = projects
      .flatMap((project) => project.deliverables)
      .filter(
        (deliverable) =>
          deliverable.status === "pending" &&
          deliverable.dueOn?.slice(0, 7) === key
      )
      .reduce((sum, deliverable) => sum + (deliverable.feeCents ?? 0), 0)
    months.push({
      key,
      label: new Date(now.getFullYear(), month, 1).toLocaleDateString("en-US", {
        month: "long",
      }),
      cents: retainerExpectation(key, false) + pending,
      kind: "forecast",
    })
  }

  const landingCents =
    ytdCents +
    months
      .filter((month) => month.kind !== "actual")
      .reduce((sum, month) => sum + month.cents, 0)

  return { ytdCents, landingCents, months }
}

const DAY_MS = 86400000

function dayOfYear(now: Date) {
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.round((now.getTime() - start.getTime()) / DAY_MS) + 1
}

function daysInYear(year: number) {
  return Math.round(
    (new Date(year + 1, 0, 1).getTime() - new Date(year, 0, 1).getTime()) / DAY_MS
  )
}

function shortMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).toLocaleDateString("en-US", {
    month: "short",
  })
}

function monthSpan(year: number, from: number, to: number) {
  if (from > to) return ""
  if (from === to) return shortMonth(year, from)
  return `${shortMonth(year, from)}–${shortMonth(year, to)}`
}

function pace(
  elapsedDays: number,
  totalDays: number,
  billedCents: number,
  goalCents: number | null
): Pace | null {
  if (goalCents == null || goalCents <= 0 || totalDays <= 0) return null
  const fraction = Math.min(Math.max(elapsedDays / totalDays, 0), 1)
  const expectedCents = Math.round(goalCents * fraction)
  return {
    elapsedDays,
    totalDays,
    fraction,
    expectedCents,
    aheadCents: billedCents - expectedCents,
  }
}

/**
 * Behind means booked work misses the goal — the only reading that should
 * send you looking for more work. Ahead/on track split on pace.
 */
function verdictFor(
  billedCents: number,
  landingCents: number,
  goalCents: number | null,
  paced: Pace | null
): Verdict {
  if (goalCents == null || goalCents <= 0) return "track"
  if (landingCents < goalCents) return "behind"
  if (paced == null) return "track"
  return billedCents >= paced.expectedCents ? "ahead" : "track"
}

function share(part: number, whole: number | null) {
  if (whole == null || whole <= 0) return null
  return part / whole
}

/** The runway carries a "2026-08-remainder" key, so read the month digits. */
function quarterIndexOfKey(key: string) {
  return Math.floor((Number(key.slice(5, 7)) - 1) / 3)
}

function buildQuarters(
  runway: RunwayMonth[],
  annualGoalCents: number | null,
  now: Date
): QuarterRow[] {
  const year = now.getFullYear()
  const currentQuarter = Math.floor(now.getMonth() / 3)
  const quarterGoal =
    annualGoalCents != null ? Math.round(annualGoalCents / 4) : null

  return QUARTER_IDS.map((id, index) => {
    let billedCents = 0
    let bookedCents = 0
    for (const month of runway) {
      if (quarterIndexOfKey(month.key) !== index) continue
      if (month.kind === "actual") billedCents += month.cents
      else bookedCents += month.cents
    }
    const landingCents = billedCents + bookedCents
    return {
      id,
      label: id,
      monthsLabel: monthSpan(year, index * 3, index * 3 + 2),
      billedCents,
      bookedCents,
      landingCents,
      goalCents: quarterGoal,
      share: share(landingCents, quarterGoal),
      state:
        index === currentQuarter
          ? "current"
          : index < currentQuarter
            ? "past"
            : "future",
    }
  })
}

function buildHorizons(
  input: {
    runway: RunwayMonth[]
    quarters: QuarterRow[]
    monthCents: number
    priorMonthCents: number
    monthRemainderCents: number
    ytdCents: number
    priorYtdCents: number
    landingCents: number
    monthlyGoalCents: number | null
    annualGoalCents: number | null
  },
  now: Date
): Horizon[] {
  const year = now.getFullYear()
  const quarterIndex = Math.floor(now.getMonth() / 3)
  const quarter = input.quarters[quarterIndex]

  // month
  const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate()
  const monthLanding = input.monthCents + input.monthRemainderCents
  const monthPace = pace(
    now.getDate(),
    daysInMonth,
    input.monthCents,
    input.monthlyGoalCents
  )

  // quarter — days, not months, so a part-finished month counts properly
  const quarterStart = new Date(year, quarterIndex * 3, 1)
  const quarterEnd = new Date(year, quarterIndex * 3 + 3, 1)
  const quarterDays = Math.round(
    (quarterEnd.getTime() - quarterStart.getTime()) / DAY_MS
  )
  const quarterElapsed =
    Math.round((now.getTime() - quarterStart.getTime()) / DAY_MS) + 1
  const quarterPace = pace(
    quarterElapsed,
    quarterDays,
    quarter.billedCents,
    quarter.goalCents
  )

  // year
  const yearDays = daysInYear(year)
  const yearElapsed = dayOfYear(now)
  const yearPace = pace(
    yearElapsed,
    yearDays,
    input.ytdCents,
    input.annualGoalCents
  )

  const through = (elapsed: number, total: number) =>
    `Day ${elapsed} of ${total} · ${Math.round((elapsed / total) * 100)}% through`

  return [
    {
      id: "month",
      label: `This month · ${now.toLocaleDateString("en-US", { month: "long" })}`,
      periodLabel: now.toLocaleDateString("en-US", { month: "long" }),
      through: through(now.getDate(), daysInMonth),
      billedCents: input.monthCents,
      bookedCents: input.monthRemainderCents,
      landingCents: monthLanding,
      goalCents: input.monthlyGoalCents,
      goalShare: share(input.monthCents, input.monthlyGoalCents),
      landingShare: share(monthLanding, input.monthlyGoalCents),
      pace: monthPace,
      verdict: verdictFor(
        input.monthCents,
        monthLanding,
        input.monthlyGoalCents,
        monthPace
      ),
      deltaPct: deltaPct(input.monthCents, input.priorMonthCents),
      deltaSuffix: "vs last month",
    },
    {
      id: "quarter",
      label: `This quarter · ${quarter.label}`,
      periodLabel: quarter.label,
      through: through(quarterElapsed, quarterDays),
      billedCents: quarter.billedCents,
      bookedCents: quarter.bookedCents,
      landingCents: quarter.landingCents,
      goalCents: quarter.goalCents,
      goalShare: share(quarter.billedCents, quarter.goalCents),
      landingShare: quarter.share,
      pace: quarterPace,
      verdict: verdictFor(
        quarter.billedCents,
        quarter.landingCents,
        quarter.goalCents,
        quarterPace
      ),
      // The quarter grid sits directly below and compares all four properly.
      deltaPct: null,
      deltaSuffix: null,
    },
    {
      id: "year",
      label: `This year · ${year}`,
      periodLabel: String(year),
      through: through(yearElapsed, yearDays),
      billedCents: input.ytdCents,
      bookedCents: input.landingCents - input.ytdCents,
      landingCents: input.landingCents,
      goalCents: input.annualGoalCents,
      goalShare: share(input.ytdCents, input.annualGoalCents),
      landingShare: share(input.landingCents, input.annualGoalCents),
      pace: yearPace,
      verdict: verdictFor(
        input.ytdCents,
        input.landingCents,
        input.annualGoalCents,
        yearPace
      ),
      deltaPct: deltaPct(input.ytdCents, input.priorYtdCents),
      deltaSuffix: "vs same point last year",
    },
  ]
}

function buildYearPlan(
  input: {
    quarters: QuarterRow[]
    ytdCents: number
    landingCents: number
    annualGoalCents: number | null
  },
  now: Date
): YearPlan {
  const year = now.getFullYear()
  // Months after this one: work sold now realistically invoices from next
  // month, and this month's booked work is already inside the landing.
  const monthsLeft = 11 - now.getMonth()
  const gapCents =
    input.annualGoalCents != null
      ? input.annualGoalCents - input.landingCents
      : null

  const h1BilledCents =
    input.quarters[0].landingCents + input.quarters[1].landingCents
  const h2LandingCents =
    input.quarters[2].landingCents + input.quarters[3].landingCents

  return {
    yearKey: String(year),
    ytdCents: input.ytdCents,
    bookedCents: input.landingCents - input.ytdCents,
    landingCents: input.landingCents,
    goalCents: input.annualGoalCents,
    gapCents,
    monthsLeft,
    monthsLeftLabel:
      monthsLeft > 0 ? monthSpan(year, now.getMonth() + 1, 11) : null,
    perMonthCents:
      gapCents != null && gapCents > 0 && monthsLeft > 0
        ? Math.round(gapCents / monthsLeft)
        : null,
    h1BilledCents,
    h2LandingCents,
    halfGoalCents:
      input.annualGoalCents != null
        ? Math.round(input.annualGoalCents / 2)
        : null,
  }
}

export function buildRevenue(
  input: {
    range: RevenueRange
    invoices: RevenueInvoice[]
    retainers: RevenueRetainer[]
    projects: RevenueProject[]
    entries: RevenueEntry[]
    expenses: RevenueExpense[]
    goals: Goals
  },
  now = new Date()
): RevenueModel {
  const window = periodWindow(input.range, now)
  const prior = priorWindow(input.range, now)
  const thisMonth = monthKey(now)
  const lastMonth = addMonths(thisMonth, -1)
  const yearKey = String(now.getFullYear())
  const quarterIndex = Math.floor(now.getMonth() / 3)
  const quarterStartKey = padMonth(now.getFullYear(), quarterIndex * 3)
  const quarterEndKey = padMonth(now.getFullYear(), quarterIndex * 3 + 2)

  const period = sumInvoices(input.invoices, window.start, window.end)
  const priorPeriod = prior
    ? sumInvoices(input.invoices, prior.start, prior.end)
    : null
  const month = sumInvoices(input.invoices, thisMonth, thisMonth)
  const priorMonth = sumInvoices(input.invoices, lastMonth, lastMonth)
  const collected = sumInvoices(
    input.invoices,
    window.start,
    window.end,
    (invoice) => invoice.status === "paid"
  )
  const outstanding = sumInvoices(
    input.invoices,
    null,
    null,
    (invoice) => invoice.status === "sent"
  )
  const drafts = sumInvoices(
    input.invoices,
    window.start,
    window.end,
    (invoice) => invoice.status === "draft"
  )
  const expenseCents = sumExpenses(input.expenses, window.start, window.end)

  const rates = new Map(
    input.retainers.map((retainer) => [
      retainer.id,
      retainerRateCents(retainer, input.invoices),
    ])
  )
  const active = input.retainers.filter((retainer) => retainer.status === "active")
  let recurringCents = 0
  let recurringHours = 0
  for (const retainer of active) {
    const rate = rates.get(retainer.id)
    recurringHours += retainer.hoursPerMonth
    if (rate) recurringCents += rate * retainer.hoursPerMonth
  }

  const runway = computeRunway(
    input.invoices,
    input.retainers,
    input.projects,
    input.entries,
    now
  )
  const monthRemainderCents =
    runway.months.find((entry) => entry.kind === "remainder")?.cents ?? 0
  const priorYtd = sumInvoices(
    input.invoices,
    padMonth(now.getFullYear() - 1, 0),
    padMonth(now.getFullYear() - 1, now.getMonth())
  )

  const annualGoalCents =
    input.goals.annualCents ??
    (input.goals.monthlyCents != null ? input.goals.monthlyCents * 12 : null)
  const monthlyGoalCents = input.goals.annualCents
    ? Math.round(input.goals.annualCents / 12)
    : input.goals.monthlyCents

  const names = new Map<string, string>()
  for (const invoice of input.invoices) {
    names.set(invoice.client.slug, invoice.client.name)
  }
  for (const entry of input.entries) {
    names.set(entry.client.slug, entry.client.name)
  }
  for (const retainer of input.retainers) {
    names.set(retainer.client.slug, retainer.client.name)
  }

  const trendKeys = monthsBack(now, TREND_MONTHS)
  const sparkKeys = monthsBack(now, SPARK_MONTHS)
  const byMonthClient = new Map<string, Record<string, number>>()
  const cashByMonth = new Map<
    string,
    { billed: number; collected: number; expenses: number; hours: number; hourlyCents: number }
  >()

  for (const key of trendKeys) {
    byMonthClient.set(key, {})
    cashByMonth.set(key, {
      billed: 0,
      collected: 0,
      expenses: 0,
      hours: 0,
      hourlyCents: 0,
    })
  }

  for (const invoice of input.invoices) {
    const key = invoice.issuedOn.slice(0, 7)
    const stack = byMonthClient.get(key)
    if (stack) {
      stack[invoice.client.slug] =
        (stack[invoice.client.slug] ?? 0) + invoice.amountCents
    }
    const cash = cashByMonth.get(key)
    if (cash) {
      cash.billed += invoice.amountCents
      if (invoice.status === "paid") cash.collected += invoice.amountCents
      const hrs = hoursOf(invoice.hours)
      if (hrs > 0) {
        cash.hours += hrs
        cash.hourlyCents += invoice.amountCents
      }
    }
  }
  for (const expense of input.expenses) {
    const cash = cashByMonth.get(expense.occurredOn.slice(0, 7))
    if (cash) cash.expenses += expense.amountCents
  }

  const stack: MonthlyStackPoint[] = trendKeys.map((key) => ({
    key,
    label: monthLabelShort(key),
    values: byMonthClient.get(key) ?? {},
  }))
  const cash: MonthlyCashPoint[] = trendKeys.map((key, index) => {
    const row = cashByMonth.get(key)!
    const window3 = trendKeys.slice(Math.max(0, index - 2), index + 1)
    return {
      key,
      label: monthLabelShort(key),
      billed: row.billed,
      collected: row.collected,
      expenses: row.expenses,
      hours: row.hours,
      rate: rateCents(row.hourlyCents, row.hours),
      avg3: Math.round(
        window3.reduce(
          (sum, k) => sum + (cashByMonth.get(k)?.billed ?? 0),
          0
        ) / window3.length
      ),
      remainder: key === thisMonth ? monthRemainderCents : 0,
    }
  })

  type ClientAcc = {
    slug: string
    name: string
    billedCents: number
    quarterCents: number
    collectedCents: number
    outstandingCents: number
    hourlyCents: number
    invoiceHours: number
    loggedHours: number
    retainerCents: number
    projectCents: number
    otherCents: number
    sparkMap: Map<string, number>
  }
  const clients = new Map<string, ClientAcc>()
  const ensure = (slug: string, name: string): ClientAcc => {
    const current = clients.get(slug)
    if (current) return current
    const created: ClientAcc = {
      slug,
      name,
      billedCents: 0,
      quarterCents: 0,
      collectedCents: 0,
      outstandingCents: 0,
      hourlyCents: 0,
      invoiceHours: 0,
      loggedHours: 0,
      retainerCents: 0,
      projectCents: 0,
      otherCents: 0,
      sparkMap: new Map(),
    }
    clients.set(slug, created)
    return created
  }

  for (const invoice of input.invoices) {
    const row = ensure(invoice.client.slug, invoice.client.name)
    const key = invoice.issuedOn.slice(0, 7)
    row.sparkMap.set(key, (row.sparkMap.get(key) ?? 0) + invoice.amountCents)
    if (invoice.status === "sent") row.outstandingCents += invoice.amountCents
    if (inMonths(invoice.issuedOn, quarterStartKey, quarterEndKey)) {
      row.quarterCents += invoice.amountCents
    }
    if (!inMonths(invoice.issuedOn, window.start, window.end)) continue
    row.billedCents += invoice.amountCents
    if (invoice.status === "paid") row.collectedCents += invoice.amountCents
    const hrs = hoursOf(invoice.hours)
    if (hrs > 0) {
      row.invoiceHours += hrs
      row.hourlyCents += invoice.amountCents
    }
    const kind = invoiceKind(invoice)
    if (kind === "retainer") row.retainerCents += invoice.amountCents
    else if (kind === "project") row.projectCents += invoice.amountCents
    else row.otherCents += invoice.amountCents
  }
  for (const entry of input.entries) {
    const row = ensure(entry.client.slug, entry.client.name)
    if (!inMonths(entry.occurredOn, window.start, window.end)) continue
    row.loggedHours += hoursOf(entry.hours)
  }

  const clientRows = Array.from(clients.values())
    .filter((row) => row.billedCents > 0 || row.outstandingCents > 0)
    .sort((a, b) => b.billedCents - a.billedCents)
  const billedTotal = clientRows.reduce((sum, row) => sum + row.billedCents, 0)

  const clientView: ClientRow[] = clientRows.map((row) => ({
    slug: row.slug,
    name: row.name,
    billedCents: row.billedCents,
    quarterCents: row.quarterCents,
    collectedCents: row.collectedCents,
    outstandingCents: row.outstandingCents,
    hourlyCents: rateCents(row.hourlyCents, row.invoiceHours),
    invoiceHours: row.invoiceHours,
    loggedHours: row.loggedHours,
    retainerCents: row.retainerCents,
    projectCents: row.projectCents,
    otherCents: row.otherCents,
    share: billedTotal > 0 ? row.billedCents / billedTotal : 0,
    spark: sparkKeys.map((key) => row.sparkMap.get(key) ?? 0),
  }))

  const mixCents = { retainer: 0, project: 0, other: 0 }
  for (const invoice of input.invoices) {
    if (!inMonths(invoice.issuedOn, window.start, window.end)) continue
    mixCents[invoiceKind(invoice)] += invoice.amountCents
  }

  const presentSlugs = new Set<string>()
  for (const point of stack) {
    for (const slug of Object.keys(point.values)) presentSlugs.add(slug)
  }

  const quarters = buildQuarters(runway.months, annualGoalCents, now)
  const horizons = buildHorizons(
    {
      runway: runway.months,
      quarters,
      monthCents: month.cents,
      priorMonthCents: priorMonth.cents,
      monthRemainderCents,
      ytdCents: runway.ytdCents,
      priorYtdCents: priorYtd.cents,
      landingCents: runway.landingCents,
      monthlyGoalCents,
      annualGoalCents,
    },
    now
  )
  const yearPlan = buildYearPlan(
    {
      quarters,
      ytdCents: runway.ytdCents,
      landingCents: runway.landingCents,
      annualGoalCents,
    },
    now
  )

  return {
    range: input.range,
    kpis: {
      monthLabel: now.toLocaleDateString("en-US", { month: "long" }),
      monthCents: month.cents,
      priorMonthCents: priorMonth.cents,
      periodLabel: window.label,
      billedCents: period.cents,
      priorPeriodCents: priorPeriod ? priorPeriod.cents : null,
      collectedCents: collected.cents,
      outstandingCents: outstanding.cents,
      draftCents: drafts.cents,
      hourlyCents: rateCents(period.hourlyCents, period.hours),
      hourlyHours: period.hours,
      hourlyBilledCents: period.hourlyCents,
      expenseCents,
      netCents: period.cents - expenseCents,
      recurringCents,
      recurringHours,
      landingCents: runway.landingCents,
      monthRemainderCents,
      ytdCents: runway.ytdCents,
      priorYtdCents: priorYtd.cents,
      annualGoalCents,
      monthlyGoalCents,
      yearKey,
    },
    series: chartSeries(presentSlugs, (slug) => names.get(slug) ?? slug),
    stack,
    cash,
    clients: clientView,
    mix: [
      { id: "retainer", label: "Retainers", cents: mixCents.retainer },
      { id: "project", label: "Projects", cents: mixCents.project },
      { id: "other", label: "Other", cents: mixCents.other },
    ].filter((slice) => slice.cents > 0),
    cashMix: [
      { id: "paid", label: "Paid", cents: collected.cents },
      {
        id: "sent",
        label: "Outstanding",
        cents: sumInvoices(
          input.invoices,
          window.start,
          window.end,
          (invoice) => invoice.status === "sent"
        ).cents,
      },
      { id: "draft", label: "Draft", cents: drafts.cents },
    ].filter((slice) => slice.cents > 0),
    runway: runway.months,
    horizons,
    quarters,
    yearPlan,
    concentration: clientView[0]?.share ?? 0,
    topClientName: clientView[0]?.name ?? null,
  }
}
