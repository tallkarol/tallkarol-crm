const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

export function pad2(n: number) {
  return String(n).padStart(2, "0")
}

export function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}`
}

export function isMonthKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}$/.test(value))
}

export function shiftMonth(month: string, delta: number) {
  const [year, mon] = month.split("-").map(Number)
  const date = new Date(year, mon - 1 + delta, 1)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`
}

export function monthBounds(month: string) {
  return { start: `${month}-01`, end: `${shiftMonth(month, 1)}-01` }
}

export function monthEnd(month: string) {
  const [year, mon] = shiftMonth(month, 1).split("-").map(Number)
  const last = new Date(year, mon - 1, 0)
  return `${last.getFullYear()}-${pad2(last.getMonth() + 1)}-${pad2(last.getDate())}`
}

export function monthLong(month: string) {
  const [year, mon] = month.split("-").map(Number)
  return new Date(year, mon - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
}

export function monthShort(month: string) {
  const [year, mon] = month.split("-").map(Number)
  const label = new Date(year, mon - 1, 1).toLocaleDateString("en-US", {
    month: "short",
  })
  return `${label}-${String(year).slice(2)}`
}

export function toIsoDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function yearFromToken(raw: string | undefined, fallback: number) {
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return n < 100 ? 2000 + n : n
}

/** Accepts 3-Aug, Aug 3, 8/3, 8/3/26, 2026-08-03, or a day number in the viewed month. */
export function parseDateInput(
  raw: string,
  fallback: { year: number; month: number }
): string | null {
  const value = raw.trim()
  if (!value) return null

  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  if (/^\d{1,2}$/.test(value)) {
    return toIsoDate(fallback.year, fallback.month, Number(value))
  }

  const dayMon = value.match(
    /^(\d{1,2})[-\s]+([A-Za-z]{3,})(?:[-\s,]+(\d{2,4}))?$/
  )
  if (dayMon) {
    const month = MONTHS[dayMon[2].toLowerCase().slice(0, 3)]
    if (!month) return null
    return toIsoDate(
      yearFromToken(dayMon[3], fallback.year),
      month,
      Number(dayMon[1])
    )
  }

  const monDay = value.match(
    /^([A-Za-z]{3,})\s+(\d{1,2})(?:[,\s]+(\d{2,4}))?$/
  )
  if (monDay) {
    const month = MONTHS[monDay[1].toLowerCase().slice(0, 3)]
    if (!month) return null
    return toIsoDate(
      yearFromToken(monDay[3], fallback.year),
      month,
      Number(monDay[2])
    )
  }

  const slash = value.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/)
  if (slash) {
    return toIsoDate(
      yearFromToken(slash[3], fallback.year),
      Number(slash[1]),
      Number(slash[2])
    )
  }

  return null
}

export function formatSheetDate(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  if (!year || !month || !day) return iso
  const mon = new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
  })
  return `${day}-${mon}`
}

export function formatSheetHours(value: string | number | null | undefined) {
  if (value == null || value === "") return ""
  const n = Number(value)
  if (Number.isNaN(n)) return ""
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 })
}

/** Bare 12:xx is midnight — matches the GDI sheet (11:59 PM → 12:00). */
export function parseClock(raw: string): number | null {
  const value = raw.trim().toLowerCase()
  if (!value) return null
  const mer = value.match(/\b(am|pm)\b/)
  const clock = value.replace(/\s*(am|pm)\s*/g, "").replace(".", ":")
  const match = clock.match(/^(\d{1,2})(?::(\d{2}))?$/)
  if (!match) return null
  let hour = Number(match[1])
  const minute = Number(match[2] ?? 0)
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null
  if (minute > 59) return null
  if (mer) {
    if (hour < 1 || hour > 12) return null
    if (hour === 12) hour = mer[1] === "am" ? 0 : 12
    else if (mer[1] === "pm") hour += 12
  } else {
    if (hour === 12) hour = 0
    if (hour > 23) return null
  }
  return hour * 60 + minute
}

export function hoursBetween(start: string, end: string): number | null {
  const from = parseClock(start)
  const to = parseClock(end)
  if (from == null || to == null) return null
  let diff = to - from
  if (diff <= 0) diff += 24 * 60
  return Math.round((diff / 60) * 100) / 100
}

export function parseHoursInput(raw: string): number | null {
  const value = raw.trim().replace(",", ".")
  if (!value) return null
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0 || n > 24) return null
  return Math.round(n * 100) / 100
}

export function hoursToString(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2)
}

export function sumHours(values: Array<string | number | null | undefined>) {
  let total = 0
  for (const value of values) {
    const n = Number(value)
    if (Number.isFinite(n)) total += n
  }
  return total
}

export function invoiceNumberFor(clientSlug: string, month: string) {
  const prefix = clientSlug
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
  const [year, mon] = month.split("-")
  return `${prefix}-${year}-${mon}`
}
