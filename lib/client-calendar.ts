/**
 * Pure helpers for the Calendar room's hour grid — no db import, so this
 * stays reusable from the "use client" NowLine without pulling Drizzle into
 * the browser bundle.
 *
 * The hour grid runs 8:00–18:00 at 44px/hour, lifted straight from
 * `renderWeek()` in `~/Work/tallkarol/hub-mockup-src/parts.js`.
 */

export const DAY_START_HOUR = 8
export const DAY_END_HOUR = 18
export const HOUR_PX = 44

/**
 * The Mon–Sun grid collapses to Mon–Fri under 720px. This Tailwind (3.4,
 * core only, no `@tailwindcss/container-queries`) has no real container
 * query, so the threshold is an arbitrary VIEWPORT breakpoint rather than a
 * true container query — the same mechanism `rail: "700px"` in
 * tailwind.config.ts already uses for "the chrome gets tight". Values are
 * written out literally (not built from a shared number) because Tailwind's
 * scanner matches class text verbatim; a template-interpolated breakpoint
 * would never be found and would silently generate no CSS.
 */
export const GRID_COLS =
  "grid-cols-[2.75rem_repeat(5,minmax(0,1fr))] min-[720px]:grid-cols-[2.75rem_repeat(7,minmax(0,1fr))]"
export const WEEKEND_HIDDEN = "hidden min-[720px]:block"

export function isIsoDateString(value: string | undefined | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/** Decimal local hour from an ISO timestamp — 14:30 -> 14.5. */
export function hourOf(iso: string): number {
  const d = new Date(iso)
  return d.getHours() + d.getMinutes() / 60
}

/** Pixels from the top of the 8:00 row. */
export function eventTop(startsAt: string): number {
  return (hourOf(startsAt) - DAY_START_HOUR) * HOUR_PX
}

/** Pixel height for the block, with a small gutter like the mockup's `-3`. */
export function eventHeight(startsAt: string, endsAt: string): number {
  const hours = Math.max(hourOf(endsAt) - hourOf(startsAt), 20 / 60)
  return hours * HOUR_PX - 3
}

/** Short events (under 45 min) print the time and the title on one line. */
export function isShortEvent(startsAt: string, endsAt: string): boolean {
  return hourOf(endsAt) - hourOf(startsAt) < 0.75
}

/** "9:30" — no leading zero on the hour, matching `fmtT()` in the mockup. */
export function fmtHour(iso: string): string {
  const d = new Date(iso)
  return `${d.getHours()}:${pad(d.getMinutes())}`
}

export function fmtRange(startsAt: string, endsAt: string): string {
  return `${fmtHour(startsAt)}–${fmtHour(endsAt)}`
}

/** "Mon 22 – Sun 28 Sep" (or "Mon 29 Sep – Sun 4 Oct" across a month
 *  boundary). */
export function weekRangeLabel(days: { iso: string; num: number; dow: string }[]): string {
  if (!days.length) return ""
  const first = days[0]
  const last = days[days.length - 1]
  const monthOf = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short" })
  const firstMonth = monthOf(first.iso)
  const lastMonth = monthOf(last.iso)
  return firstMonth === lastMonth
    ? `${first.dow} ${first.num} – ${last.dow} ${last.num} ${lastMonth}`
    : `${first.dow} ${first.num} ${firstMonth} – ${last.dow} ${last.num} ${lastMonth}`
}

/** The Monday `weeks` away from a given Monday, as an ISO date — for the
 *  ‹ and › links. `lib/client-rooms.ts` always hands `loadWeek` a Monday
 *  (`weekStart()`), so this never has to re-align. */
export function shiftWeekIso(mondayIso: string, weeks: number): string {
  const [y, m, d] = mondayIso.split("-").map(Number)
  const date = new Date(y, m - 1, d + weeks * 7)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Which of the three lanes a calendar event belongs to: this client's own
 * event, another client's (dimmed, named), or Karol's personal block (no
 * client on it at all — `mine` is false and there is no `who`).
 */
export type EventLane = "mine" | "other" | "own"

export function eventLaneOf(item: { mine: boolean; who: string | null }): EventLane {
  if (item.mine) return "mine"
  if (item.who) return "other"
  return "own"
}

/** A flat wash of the client colour for a "mine" chip that has to read on
 *  its own in the hour grid — the bolder cousin of `.tk-client-tint`
 *  (12%, `app/globals.css`), which is sized for a dense list instead. */
export function eventTint(color: string): string {
  return `color-mix(in srgb, ${color} 18%, transparent)`
}
