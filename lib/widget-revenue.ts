import { and, eq, gte, lte } from "drizzle-orm"
import { db } from "@/db"
import { retainers, timeEntries } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { ensureClientColors } from "@/lib/client-colors-store"
import { getGoals } from "@/lib/goals"
import { buildRevenue } from "@/lib/revenue"

/**
 * The three revenue gauges, as ratios only.
 *
 * No cents cross this boundary, deliberately. The widgets show percentages, so
 * shipping the underlying money would put revenue figures behind a static
 * bearer token compiled into a laptop app for no benefit — a leaked token
 * should cost ratios, not the books. Everything here is divided before it
 * leaves the server.
 */

export type Gauge = {
  /** Billed against goal. 1.0 is the goal exactly; can exceed it. */
  share: number
  /** Where billed plus booked-but-uninvoiced work lands. */
  landingShare: number
  /** How far through the period we are — the "on pace" mark on the dial. */
  paceFraction: number
  /** ahead · track · behind, straight from the revenue model. */
  verdict: "ahead" | "track" | "behind"
  /** "September", "2026". */
  label: string
}

export type RetainerGauge = {
  client: string
  slug: string
  color: string
  /** Hours logged this month against the monthly ceiling. */
  share: number
  /** Same month last cycle, for a sense of whether this one is starting slow. */
  priorShare: number
}

export type RevenuePayload = {
  generatedAt: string
  /** False when no annual goal is set — the gauges have nothing to divide by. */
  hasGoal: boolean
  month: Gauge | null
  year: Gauge | null
  quarter: Gauge | null
  retainers: {
    /** Every active retainer's hours over every active retainer's ceiling. */
    share: number
    paceFraction: number
    rows: RetainerGauge[]
  }
}

/* ------------------------------------------------------------------ helpers */

function monthBounds(now: Date) {
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { start, end }
}

function iso(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Fraction of the current month elapsed, the mark retainer dials read against. */
function monthElapsed(now: Date) {
  const { end } = monthBounds(now)
  return now.getDate() / end.getDate()
}

function toGauge(h: {
  periodLabel: string
  goalShare: number | null
  landingShare: number | null
  pace: { fraction: number } | null
  verdict: "ahead" | "track" | "behind"
}): Gauge | null {
  if (h.goalShare == null) return null
  return {
    share: round(h.goalShare),
    landingShare: round(h.landingShare ?? h.goalShare),
    paceFraction: round(h.pace?.fraction ?? 0),
    verdict: h.verdict,
    label: h.periodLabel,
  }
}

/** Three decimals is more than a dial can show and keeps payloads small. */
function round(n: number) {
  return Math.round(n * 1000) / 1000
}

/* ------------------------------------------------------------------- build */

const TTL_MS = 60_000
let memo: { at: number; value: RevenuePayload } | null = null

export async function widgetRevenue(now = new Date()): Promise<RevenuePayload> {
  if (memo && now.getTime() - memo.at < TTL_MS) return memo.value

  await ensureClientColors()

  // `buildRevenue` needs the whole book to do its job, so this is the one
  // genuinely heavy read behind the widgets — hence the memo above.
  const [invoices, retainerRows, projects, entries, expenses, goals] =
    await Promise.all([
      db.query.invoices.findMany({ with: { client: true } }),
      db.query.retainers.findMany({ with: { client: true } }),
      db.query.projects.findMany({ with: { client: true, deliverables: true } }),
      db.query.timeEntries.findMany({ with: { client: true } }),
      db.query.expenses.findMany(),
      getGoals(),
    ])

  const model = buildRevenue(
    {
      range: "ytd",
      invoices: invoices as never,
      retainers: retainerRows as never,
      projects: projects as never,
      entries: entries as never,
      expenses: expenses as never,
      goals,
    },
    now
  )

  const horizons = model.horizons ?? []
  const pick = (id: string) => horizons.find((h) => h.id === id) ?? null
  const month = pick("month")
  const quarter = pick("quarter")
  const year = pick("year")

  const value: RevenuePayload = {
    generatedAt: now.toISOString(),
    hasGoal: goals.annualCents != null || goals.monthlyCents != null,
    month: month ? toGauge(month) : null,
    quarter: quarter ? toGauge(quarter) : null,
    year: year ? toGauge(year) : null,
    retainers: await retainerGauges(now),
  }

  memo = { at: now.getTime(), value }
  return value
}

async function retainerGauges(now: Date) {
  const { start, end } = monthBounds(now)
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const [active, thisMonth, lastMonth] = await Promise.all([
    db.query.retainers.findMany({
      where: eq(retainers.status, "active"),
      columns: { id: true, hoursPerMonth: true },
      with: { client: { columns: { name: true, slug: true } } },
    }),
    db.query.timeEntries.findMany({
      where: and(
        gte(timeEntries.occurredOn, iso(start)),
        lte(timeEntries.occurredOn, iso(end))
      ),
      columns: { retainerId: true, hours: true },
    }),
    db.query.timeEntries.findMany({
      where: and(
        gte(timeEntries.occurredOn, iso(prevStart)),
        lte(timeEntries.occurredOn, iso(prevEnd))
      ),
      columns: { retainerId: true, hours: true },
    }),
  ])

  const sum = (rows: { retainerId: string | null; hours: string }[]) => {
    const totals = new Map<string, number>()
    for (const row of rows) {
      if (!row.retainerId) continue
      totals.set(row.retainerId, (totals.get(row.retainerId) ?? 0) + Number(row.hours))
    }
    return totals
  }

  const now_ = sum(thisMonth as never)
  const prev = sum(lastMonth as never)

  let usedTotal = 0
  let capTotal = 0
  const rows: RetainerGauge[] = []

  for (const r of active as unknown as {
    id: string
    hoursPerMonth: number
    client: { name: string; slug: string } | null
  }[]) {
    const used = now_.get(r.id) ?? 0
    const cap = r.hoursPerMonth || 0
    usedTotal += used
    capTotal += cap
    rows.push({
      client: r.client?.name ?? "—",
      slug: r.client?.slug ?? "",
      color: clientColor(r.client?.slug ?? ""),
      share: cap > 0 ? round(used / cap) : 0,
      priorShare: cap > 0 ? round((prev.get(r.id) ?? 0) / cap) : 0,
    })
  }

  rows.sort((a, b) => b.share - a.share || a.client.localeCompare(b.client))

  return {
    share: capTotal > 0 ? round(usedTotal / capTotal) : 0,
    paceFraction: round(monthElapsed(now)),
    rows,
  }
}
