import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm"
import { db } from "@/db"
import { clients, invoices, timeEntries } from "@/db/schema"
import type { Invoice } from "@/db/schema"
import { retainerRateCents } from "@/lib/engagements"
import { currentMonth, monthBounds } from "@/lib/timesheet"

/**
 * A sheet is one client × one month. The app has always had them; this makes
 * them a thing you can list, sort, and read a state off — instead of a URL you
 * assemble from two filters.
 */

export type SheetState = "open" | "unbilled" | "invoiced" | "paid"

export type SheetSummary = {
  key: string
  clientId: string
  clientName: string
  clientSlug: string
  month: string
  hours: number
  /** Null when no rate is known for the client. */
  valueCents: number | null
  entries: number
  unbilledHours: number
  invoiceNumber: string | null
  invoiceStatus: Invoice["status"] | null
  state: SheetState
  lastEditedOn: string
}

export const SHEET_STATE_LABEL: Record<SheetState, string> = {
  open: "Open",
  unbilled: "Unbilled",
  invoiced: "Invoiced",
  paid: "Paid",
}

/**
 * Every client-month that has hours on it. One grouped query plus one invoice
 * read — this is the page that would otherwise fan out per client.
 */
export async function listSheets(now = new Date()): Promise<SheetSummary[]> {
  const thisMonth = currentMonth(now)

  const [rows, clientRows, invoiceRows] = await Promise.all([
    db
      .select({
        clientId: timeEntries.clientId,
        month: sql<string>`to_char(${timeEntries.occurredOn}, 'YYYY-MM')`,
        hours: sql<string>`coalesce(sum(${timeEntries.hours}), 0)`,
        entries: sql<number>`count(*)::int`,
        unbilledHours: sql<string>`coalesce(sum(${timeEntries.hours}) filter (where ${timeEntries.invoiceId} is null), 0)`,
        lastEditedOn: sql<string>`max(${timeEntries.occurredOn})`,
      })
      .from(timeEntries)
      .groupBy(timeEntries.clientId, sql`to_char(${timeEntries.occurredOn}, 'YYYY-MM')`),
    db.query.clients.findMany({ with: { retainers: true } }),
    db.query.invoices.findMany(),
  ])

  const byClient = new Map(clientRows.map((row) => [row.id, row]))

  // A month's invoice is the one issued in it, or the one its entries point at.
  const invoiceByKey = new Map<string, Invoice>()
  for (const invoice of invoiceRows) {
    invoiceByKey.set(`${invoice.clientId}:${invoice.issuedOn.slice(0, 7)}`, invoice)
  }

  const rateFor = (clientId: string) => {
    const client = byClient.get(clientId)
    if (!client) return null
    const retainer =
      client.retainers.find((row) => row.status === "active") ??
      client.retainers[0] ??
      null
    if (!retainer) return null
    return retainerRateCents(retainer, invoiceRows)
  }

  const sheets: SheetSummary[] = []
  for (const row of rows) {
    const client = byClient.get(row.clientId)
    if (!client) continue
    const hours = Math.round(Number(row.hours) * 100) / 100
    const unbilledHours = Math.round(Number(row.unbilledHours) * 100) / 100
    const rate = rateFor(row.clientId)
    const invoice = invoiceByKey.get(`${row.clientId}:${row.month}`) ?? null

    let state: SheetState
    if (invoice?.status === "paid" && unbilledHours <= 0) state = "paid"
    else if (invoice) state = "invoiced"
    else if (row.month >= thisMonth) state = "open"
    else state = unbilledHours > 0 ? "unbilled" : "open"

    sheets.push({
      key: `${client.slug}:${row.month}`,
      clientId: client.id,
      clientName: client.name,
      clientSlug: client.slug,
      month: row.month,
      hours,
      valueCents: rate != null ? Math.round(hours * rate) : null,
      entries: Number(row.entries),
      unbilledHours,
      invoiceNumber: invoice?.number ?? null,
      invoiceStatus: invoice?.status ?? null,
      state,
      lastEditedOn: row.lastEditedOn,
    })
  }

  return sheets.sort((a, b) =>
    a.month === b.month
      ? a.clientName.localeCompare(b.clientName)
      : a.month < b.month
        ? 1
        : -1
  )
}

/** Distinct years that have any logged time — powers the year switcher. */
export async function sheetYears(): Promise<string[]> {
  const rows = await db
    .select({
      year: sql<string>`distinct to_char(${timeEntries.occurredOn}, 'YYYY')`,
    })
    .from(timeEntries)
  return rows
    .map((row) => row.year)
    .filter(Boolean)
    .sort((a, b) => (a < b ? 1 : -1))
}

/** Months with entries for one client — so prev/next can skip empty ones. */
export async function monthsWithEntries(clientId: string): Promise<string[]> {
  const rows = await db
    .select({
      month: sql<string>`distinct to_char(${timeEntries.occurredOn}, 'YYYY-MM')`,
    })
    .from(timeEntries)
    .where(eq(timeEntries.clientId, clientId))
  return rows.map((row) => row.month).sort()
}

/**
 * The state of one sheet, for the lock banner. Paid needs a harder confirm than
 * invoiced, so the two are kept distinct all the way to the UI.
 */
export function sheetLock(
  invoice: { number: string; status: Invoice["status"] } | null
): { locked: boolean; state: SheetState; invoice: typeof invoice } {
  if (!invoice) return { locked: false, state: "open", invoice: null }
  if (invoice.status === "draft") return { locked: false, state: "open", invoice }
  if (invoice.status === "paid") return { locked: true, state: "paid", invoice }
  return { locked: true, state: "invoiced", invoice }
}

export type LedgerFilters = {
  q?: string
  clientSlug?: string
  projectId?: string
  from?: string
  to?: string
  source?: string
  limit?: number
}

export type LedgerRow = {
  id: string
  occurredOn: string
  startedAt: string
  endedAt: string
  hours: string
  summary: string
  source: string
  clientName: string
  clientSlug: string
  projectName: string | null
  invoiceNumber: string | null
  invoiceStatus: Invoice["status"] | null
}

const LEDGER_LIMIT = 500

/** Flat search across every entry, every client, every month. */
export async function ledgerEntries(
  filters: LedgerFilters
): Promise<{ rows: LedgerRow[]; total: number; hours: number; truncated: boolean }> {
  const where = []

  if (filters.clientSlug) {
    const client = await db.query.clients.findFirst({
      where: eq(clients.slug, filters.clientSlug),
    })
    if (!client) return { rows: [], total: 0, hours: 0, truncated: false }
    where.push(eq(timeEntries.clientId, client.id))
  }
  if (filters.projectId) where.push(eq(timeEntries.projectId, filters.projectId))
  if (filters.source) where.push(eq(timeEntries.source, filters.source))
  if (filters.from) where.push(gte(timeEntries.occurredOn, filters.from))
  if (filters.to) where.push(lte(timeEntries.occurredOn, filters.to))
  if (filters.q?.trim()) {
    const needle = `%${filters.q.trim().replace(/[%_]/g, (c) => `\\${c}`)}%`
    where.push(sql`${timeEntries.summary} ilike ${needle}`)
  }

  const clause = where.length ? and(...where) : undefined
  const limit = Math.min(filters.limit ?? LEDGER_LIMIT, LEDGER_LIMIT)

  const [rows, totals] = await Promise.all([
    db.query.timeEntries.findMany({
      where: clause,
      orderBy: [desc(timeEntries.occurredOn), desc(timeEntries.createdAt)],
      limit: limit + 1,
      with: {
        client: { columns: { name: true, slug: true } },
        project: { columns: { name: true } },
        invoice: { columns: { number: true, status: true } },
      },
    }),
    db
      .select({
        total: sql<number>`count(*)::int`,
        hours: sql<string>`coalesce(sum(${timeEntries.hours}), 0)`,
      })
      .from(timeEntries)
      .where(clause),
  ])

  const truncated = rows.length > limit
  return {
    rows: rows.slice(0, limit).map((row) => ({
      id: row.id,
      occurredOn: row.occurredOn,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      hours: row.hours,
      summary: row.summary,
      source: row.source,
      clientName: row.client?.name ?? "—",
      clientSlug: row.client?.slug ?? "",
      projectName: row.project?.name ?? null,
      invoiceNumber: row.invoice?.number ?? null,
      invoiceStatus: row.invoice?.status ?? null,
    })),
    total: Number(totals[0]?.total ?? 0),
    hours: Math.round(Number(totals[0]?.hours ?? 0) * 100) / 100,
    truncated,
  }
}

/** Hours per month for the last N months — the dashboard's bar row. */
export async function hoursByMonthSeries(months = 12, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
  const startKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`
  const { start: from } = monthBounds(startKey)

  const rows = await db
    .select({
      month: sql<string>`to_char(${timeEntries.occurredOn}, 'YYYY-MM')`,
      hours: sql<string>`coalesce(sum(${timeEntries.hours}), 0)`,
    })
    .from(timeEntries)
    .where(gte(timeEntries.occurredOn, from))
    .groupBy(sql`to_char(${timeEntries.occurredOn}, 'YYYY-MM')`)

  const byMonth = new Map(rows.map((row) => [row.month, Number(row.hours)]))
  return Array.from({ length: months }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - 1) + i, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
    return {
      month: key,
      hours: Math.round((byMonth.get(key) ?? 0) * 100) / 100,
      label: date.toLocaleDateString("en-US", { month: "narrow" }),
      full: date.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
    }
  })
}
