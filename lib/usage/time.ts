/**
 * Zone arithmetic for the usage page. Pure — no database, safe anywhere.
 * The page promises "times in <workspace zone>", so a wall-clock Karol types
 * and the day buckets both resolve in that zone, never the server's.
 */

const PARTS = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string) {
  let f = PARTS.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    PARTS.set(tz, f)
  }
  return f
}

/** The zone's UTC offset at `date`, in milliseconds (Warsaw in summer: +7 200 000). */
export function zoneOffsetMs(date: Date, tz: string): number {
  const parts = formatter(tz).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"))
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** "2026-09-11T14:00" typed in `tz` → the instant it names. Null when unparseable. */
export function wallClockToInstant(raw: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim())
  if (!m) {
    // Already an instant (ISO with zone) — take it as is.
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) || !/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw.trim()) ? null : d
  }
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
  // The offset at the guessed instant, then once more at the corrected one (DST edges).
  let instant = guess - zoneOffsetMs(new Date(guess), tz)
  instant = guess - zoneOffsetMs(new Date(instant), tz)
  return new Date(instant)
}

/** Midnight of the calendar day that contains `date` in `tz`. */
export function startOfDayInZone(date: Date, tz: string): Date {
  const parts = formatter(tz).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const wall = `${get("year")}-${String(get("month")).padStart(2, "0")}-${String(get("day")).padStart(2, "0")}T00:00`
  return wallClockToInstant(wall, tz) ?? date
}

/** The calendar day (YYYY-MM-DD) of `date` in `tz`. */
export function dayInZone(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

/** A reading may not be dated in the future; a small tolerance forgives clock drift. */
export const FUTURE_TOLERANCE_MS = 5 * 60_000
