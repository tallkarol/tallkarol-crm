/**
 * When the Smartsheet pull is meant to happen, in Karol's own time zone.
 *
 * Railway evaluates every cron schedule in UTC, so a fixed UTC expression
 * would drift an hour twice a year when Colorado changes clocks. The cron
 * therefore runs hourly and this decides whether the hour it woke up in is
 * actually a scheduled slot — which also means a slot that gets missed (a
 * deploy, a blip, Railway firing a few minutes early) is picked up on the
 * next pass rather than skipped until tomorrow.
 */

export const TIMEZONE = "America/Denver"

/** Working days get a morning, midday and late-afternoon pull. */
const WEEKDAY_HOURS = [8, 12, 16]
/** Weekends get one, at noon. */
const WEEKEND_HOURS = [12]

type Local = { year: number; month: number; day: number; hour: number; weekday: number }

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

const FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  weekday: "short",
})

/** The wall clock in Colorado, whatever the server thinks the time is. */
export function localParts(now: Date): Local {
  const parts = Object.fromEntries(
    FORMAT.formatToParts(now).map((p) => [p.type, p.value])
  ) as Record<string, string>
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    // Midnight formats as hour 24 in some runtimes; normalise it to 0.
    hour: Number(parts.hour) % 24,
    weekday: WEEKDAY_INDEX[parts.weekday] ?? 0,
  }
}

function hoursFor(weekday: number) {
  return weekday === 0 || weekday === 6 ? WEEKEND_HOURS : WEEKDAY_HOURS
}

function key(local: Pick<Local, "year" | "month" | "day">, hour: number) {
  const m = String(local.month).padStart(2, "0")
  const d = String(local.day).padStart(2, "0")
  return `${local.year}-${m}-${d}T${String(hour).padStart(2, "0")}`
}

/**
 * The most recent slot at or before `now`, as a stable key like
 * "2026-08-31T12". Before the first slot of the day this reaches back to the
 * last slot of the previous day, so an overnight run still has something to
 * compare against and does not re-fire yesterday's work twice.
 */
export function currentSlot(now: Date): string {
  const local = localParts(now)
  const today = hoursFor(local.weekday).filter((h) => h <= local.hour)
  if (today.length > 0) return key(local, today[today.length - 1])

  const yesterday = localParts(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const hours = hoursFor(yesterday.weekday)
  return key(yesterday, hours[hours.length - 1])
}

/**
 * Whether to sync now: true once per slot. `lastSlot` is what the previous
 * run recorded, so a second call inside the same slot is a no-op.
 */
export function isDue(now: Date, lastSlot: string | null): boolean {
  return currentSlot(now) !== lastSlot
}

function hourLabel(h: number) {
  if (h === 12) return "noon"
  return `${h % 12 || 12}${h < 12 ? "am" : "pm"}`
}

/** Human-readable schedule, for the status line and the docs. */
export const SCHEDULE_NOTE = `${WEEKDAY_HOURS.map(hourLabel).join(", ")} on weekdays and ${WEEKEND_HOURS.map(hourLabel).join(", ")} at weekends, ${TIMEZONE}`
