/** Number words for the usage page. Pure — safe in client components. */

export function tokens(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(n >= 10_000_000_000 ? 0 : 1)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return n.toLocaleString("en-US")
}

export function hours(h: number | null | undefined): string {
  if (h === null || h === undefined) return "—"
  return `${h >= 100 ? Math.round(h) : h.toFixed(1)} h`
}

export function dollars(d: number | null | undefined, digits = 2): string {
  if (d === null || d === undefined) return "—"
  return `$${d.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

export function count(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—"
  return n.toLocaleString("en-US")
}

export function share(part: number, whole: number): string {
  if (!whole) return "—"
  return `${Math.round((part / whole) * 100)}%`
}

/** Percent change of `cur` over `prev`; null when there is no prior figure. */
export function deltaPct(cur: number, prev: number): number | null {
  if (!prev) return null
  return ((cur - prev) / prev) * 100
}
