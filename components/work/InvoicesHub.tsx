"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Badge } from "@/components/work/Badge"
import { invoiceTone } from "@/components/work/InvoiceList"
import type { InvoiceStatus } from "@/db/schema"
import { clientColor, markColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { Card } from "@/components/ui/Card"
import {
  INVOICE_STATUS_LABEL,
  formatDay,
  formatHours,
  formatMoney,
  plural,
} from "@/lib/work"

export type InvoiceHubRow = {
  id: string
  number: string
  clientName: string
  clientSlug: string
  issuedOn: string
  amountCents: number
  hours: string | null
  currency: string
  status: InvoiceStatus
  description: string
}

export { clientColor }

const RANGES = [
  { id: "30d", label: "Last 30 days" },
  { id: "90d", label: "Last 90 days" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
] as const
type RangeId = (typeof RANGES)[number]["id"]

function rangeCutoff(id: RangeId): string | null {
  if (id === "all") return null
  const now = new Date()
  if (id === "year") return `${now.getFullYear()}-01-01`
  const days = id === "30d" ? 30 : 90
  const from = new Date(now.getTime() - days * 86_400_000)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`
}

function monthKey(iso: string) {
  return iso.slice(0, 7)
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
}

function InvoiceRow({ invoice }: { invoice: InvoiceHubRow }) {
  const color = clientColor(invoice.clientSlug)
  return (
    <li>
      <Link
        href={`${ROUTES.invoices}?peek=invoice:${encodeURIComponent(invoice.number)}`}
        scroll={false}
        className="flex items-center justify-between gap-4 border-l-[3px] px-5 py-3 hover:bg-well"
        style={{ borderLeftColor: markColor(color) }}
      >
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-tk-onyx">{invoice.number}</span>
            <span
              className="tk-client-tint tk-client-ink rounded-full px-2 py-0.5 text-[11px] font-semibold"
              style={{ "--c": color } as React.CSSProperties}
            >
              {invoice.clientName}
            </span>
            <span className="text-xs text-ink-3">
              {formatDay(invoice.issuedOn)}
            </span>
          </p>
          {invoice.description ? (
            <p className="mt-1 truncate text-sm text-ink-3">
              {invoice.description}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {invoice.hours ? <Badge>{formatHours(invoice.hours)}</Badge> : null}
          <span className="text-sm font-semibold tabular-nums text-tk-onyx">
            {formatMoney(invoice.amountCents, invoice.currency)}
          </span>
          <Badge tone={invoiceTone(invoice.status)}>
            {INVOICE_STATUS_LABEL[invoice.status]}
          </Badge>
        </div>
      </Link>
    </li>
  )
}

export function InvoicesHub({ invoices }: { invoices: InvoiceHubRow[] }) {
  const [clientSlug, setClientSlug] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [range, setRange] = useState<RangeId>("30d")

  const clients = useMemo(() => {
    const seen = new Map<string, { slug: string; name: string; count: number }>()
    for (const row of invoices) {
      const entry = seen.get(row.clientSlug)
      if (entry) entry.count += 1
      else seen.set(row.clientSlug, { slug: row.clientSlug, name: row.clientName, count: 1 })
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [invoices])

  // Search + client chips filter both sections; the date range only cuts the main list.
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return invoices.filter((row) => {
      if (clientSlug && row.clientSlug !== clientSlug) return false
      if (!needle) return true
      return [row.number, row.clientName, row.description]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    })
  }, [invoices, clientSlug, query])

  const outstanding = matches.filter((row) => row.status !== "paid")
  const outstandingCents = outstanding.reduce((sum, row) => sum + row.amountCents, 0)

  const cutoff = rangeCutoff(range)
  const inRange = cutoff
    ? matches.filter((row) => row.issuedOn >= cutoff)
    : matches
  const inRangeCents = inRange.reduce((sum, row) => sum + row.amountCents, 0)

  const months = useMemo(() => {
    const groups: { key: string; rows: InvoiceHubRow[]; cents: number }[] = []
    for (const row of inRange) {
      const key = monthKey(row.issuedOn)
      const last = groups[groups.length - 1]
      if (last && last.key === key) {
        last.rows.push(row)
        last.cents += row.amountCents
      } else {
        groups.push({ key, rows: [row], cents: row.amountCents })
      }
    }
    return groups
  }, [inRange])

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search number, client, work…"
          aria-label="Search invoices"
          className="min-w-[220px] flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm placeholder:text-ink-3 focus:border-tk-teal sm:max-w-xs"
        />
        <div className="flex flex-wrap gap-2">
          {clients.map((client) => {
            const active = client.slug === clientSlug
            const color = clientColor(client.slug)
            return (
              <button
                key={client.slug}
                type="button"
                onClick={() => setClientSlug(active ? null : client.slug)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
                  active
                    ? "text-white"
                    : "border-line bg-card text-tk-slate hover:text-tk-onyx"
                )}
                style={
                  active
                    ? { backgroundColor: markColor(color), borderColor: markColor(color) }
                    : undefined
                }
              >
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ backgroundColor: active ? "#fff" : color }}
                />
                {client.name}
                <span className="tabular-nums opacity-80">{client.count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {outstanding.length > 0 ? (
        <section className="mt-6 overflow-hidden rounded-2xl border border-tk-teal/30 bg-card shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tk-teal/15 bg-tk-teal/5 px-5 py-3">
            <h2 className="text-sm font-semibold text-tk-onyx">Outstanding</h2>
            <p className="text-sm text-ink-3">
              {plural(outstanding.length, "invoice")} ·{" "}
              <span className="font-semibold tabular-nums text-tk-teal">
                {formatMoney(outstandingCents)}
              </span>
            </p>
          </div>
          <ul className="divide-y divide-line">
            {outstanding.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="text-sm font-semibold text-tk-onyx">All invoices</h2>
          {inRange.length > 0 ? (
            <span className="text-sm text-ink-3">
              {plural(inRange.length, "invoice")} · {formatMoney(inRangeCents)}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRange(item.id)}
              className={
                item.id === range
                  ? "rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-tk-linen"
                  : "rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {inRange.length === 0 ? (
        <p className="mt-4 text-sm text-ink-3">
          No invoices in this range.
          {range !== "all" ? " Try a wider range." : ""}
        </p>
      ) : (
        months.map((month) => (
          <section key={month.key} className="mt-5">
            <div className="flex items-baseline justify-between px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
                {monthLabel(month.key)}
              </h3>
              <span className="text-xs tabular-nums text-ink-3">
                {formatMoney(month.cents)}
              </span>
            </div>
            <Card className="mt-2 overflow-hidden">
              <ul className="divide-y divide-line">
                {month.rows.map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}
    </>
  )
}
