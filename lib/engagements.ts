import type { Invoice, Retainer, TimeEntry } from "@/db/schema"

/** "YYYY-MM" for a Date or ISO date string. */
export function ym(d: Date | string) {
  const iso = typeof d === "string" ? d : d.toISOString()
  return typeof d === "string" ? d.slice(0, 7) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

/**
 * Contract rate in cents/hr — explicit rate_cents when set, otherwise derived
 * from the latest invoice that carries hours.
 */
export function retainerRateCents(retainer: Retainer, invoices: Invoice[]): number | null {
  if (retainer.rateCents) return retainer.rateCents
  const latest = invoices
    .filter((i) => i.retainerId === retainer.id && i.hours && Number(i.hours) > 0)
    .sort((a, b) => (a.issuedOn > b.issuedOn ? -1 : 1))[0]
  if (!latest) return null
  return Math.round(latest.amountCents / Number(latest.hours))
}

/** Hours logged per "YYYY-MM" for one retainer. */
export function hoursByMonth(entries: TimeEntry[], retainerId: string) {
  const map = new Map<string, number>()
  for (const e of entries) {
    if (e.retainerId !== retainerId) continue
    const key = e.occurredOn.slice(0, 7)
    map.set(key, (map.get(key) ?? 0) + Number(e.hours))
  }
  return map
}

/** Run-rate projection for the current month. */
export function pace(loggedHours: number, now = new Date()) {
  const day = now.getDate()
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const projected = day > 0 ? (loggedHours / day) * days : loggedHours
  return { day, days, projected }
}

export type BillingGap = {
  retainerId: string
  retainerName: string
  retainerSlug: string
  month: string
  hours: number
  valueCents: number | null
}

/**
 * Months (before the current one) where a retainer has logged time but no
 * invoice — the silent leak. `writeoffs` holds dismissed `${retainerId}:${month}` keys.
 */
export function billingGaps(
  retainers: Retainer[],
  entries: TimeEntry[],
  invoices: Invoice[],
  writeoffs: string[],
  now = new Date()
): BillingGap[] {
  const currentMonth = ym(now)
  const gaps: BillingGap[] = []
  for (const r of retainers) {
    const rate = retainerRateCents(r, invoices)
    const invoicedMonths = new Set(
      invoices.filter((i) => i.retainerId === r.id).map((i) => i.issuedOn.slice(0, 7))
    )
    for (const [month, hours] of Array.from(hoursByMonth(entries, r.id))) {
      if (month >= currentMonth) continue
      if (hours <= 0) continue
      if (invoicedMonths.has(month)) continue
      if (writeoffs.includes(`${r.id}:${month}`)) continue
      gaps.push({
        retainerId: r.id,
        retainerName: r.name,
        retainerSlug: r.slug,
        month,
        hours: Math.round(hours * 100) / 100,
        valueCents: rate ? Math.round(hours * rate) : null,
      })
    }
  }
  return gaps.sort((a, b) => (a.month < b.month ? -1 : 1))
}

export function fmtHours(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 1 })
}

export function daysSince(date: Date, now = new Date()) {
  return Math.floor((now.getTime() - date.getTime()) / 86_400_000)
}

/** Months left in a retainer window, or null when evergreen/expired. */
export function monthsLeft(endsOn: string | null, now = new Date()): number | null {
  if (!endsOn) return null
  const end = new Date(endsOn + "T00:00:00")
  if (end < now) return 0
  return Math.max(1, Math.round((end.getTime() - now.getTime()) / (30.44 * 86_400_000)))
}

export type ProjectLink = { label: string; url: string }

export function readLinks(value: unknown): ProjectLink[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((l): l is Record<string, unknown> => Boolean(l) && typeof l === "object")
    .map((l) => ({ label: String(l.label ?? ""), url: String(l.url ?? "") }))
    .filter((l) => l.label && l.url)
}
