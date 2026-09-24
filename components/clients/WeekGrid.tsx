import Link from "next/link"
import { AlarmClock, Calendar, ChevronLeft, ChevronRight, Receipt, Repeat } from "lucide-react"
import { Card } from "@/components/ui/Card"
import { NowLine } from "@/components/clients/NowLine"
import { cn } from "@/lib/cn"
import type { WeekData, WeekItem } from "@/lib/client-rooms"
import { inkColor, markColor } from "@/lib/client-colors"
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  GRID_COLS,
  HOUR_PX,
  WEEKEND_HIDDEN,
  eventHeight,
  eventLaneOf,
  eventTint,
  eventTop,
  fmtHour,
  fmtRange,
  isShortEvent,
  shiftWeekIso,
  weekRangeLabel,
} from "@/lib/client-calendar"
import { ROUTES } from "@/lib/nav"

type Client = { slug: string; name: string; color: string }
type TimedEvent = Extract<WeekItem, { kind: "event" }> & { allDay: false }

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i)
const AGENDA_MAX = 8

const navBtn =
  "grid h-[26px] min-w-[26px] place-items-center rounded-md px-2 font-ui text-[11.5px] font-semibold text-tk-slate transition-colors hover:bg-card hover:text-tk-onyx"

function isTimedEvent(item: WeekItem): item is TimedEvent {
  return item.kind === "event" && !item.allDay
}

/**
 * The Calendar room: a Mon–Sun hour grid (8:00–18:00) with an all-day "Due"
 * row for deadlines, this client's own events in its colour, everyone
 * else's dimmed with their name, and Karol's personal blocks dashed teal —
 * plus a "this week" agenda beside it. Signed off 23 Sep 2026 from
 * `~/Work/tallkarol/crm-hub-b-rooms.html` (`renderWeek()` / `renderAgenda()`
 * in `hub-mockup-src/parts.js`).
 *
 * `today` is passed in rather than trusted from `week.todayIndex`:
 * `loadWeek()` clamps a not-found day to index 0, which would mark Monday
 * "today" on every past or future week. Comparing the real ISO date against
 * `week.days` here gets that right without touching the shared loader.
 */
export function WeekGrid({
  client,
  week,
  today,
  base = ROUTES.clientRoom(client.slug, "calendar"),
}: {
  client: Client
  week: WeekData
  today: string
  /** Where ‹ Today › page to — a product hub passes its own Calendar room. */
  base?: string
}) {
  const paint = client.color
  const todayIndex = week.days.findIndex((d) => d.iso === today)

  const dueRow = week.items.filter((i) => i.kind === "due" || (i.kind === "event" && i.allDay))
  const timed = week.items.filter(isTimedEvent)

  return (
    <div className="flex flex-col gap-3 min-[720px]:flex-row">
      <Card className="min-w-0 flex-1 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-3.5 py-3">
          <h2 className="flex items-center gap-1.5 font-ui text-[13px] font-bold text-tk-onyx">
            <Calendar className="size-3.5" aria-hidden />
            Calendar
          </h2>
          <span className="font-ui text-xs text-ink-3">{weekRangeLabel(week.days)}</span>
          <span className="inline-flex flex-wrap items-center gap-3 font-ui text-[10.5px] font-semibold text-ink-3">
            <Legend swatch={<span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: markColor(client.color) }} />} label={client.name} />
            <Legend swatch={<span aria-hidden className="size-2.5 rounded-[3px] border border-line-strong bg-well" />} label="Other clients" />
            <Legend swatch={<span aria-hidden className="size-2.5 rounded-[3px] border border-dashed border-accent-ink bg-accent-soft" />} label="Mine" />
          </span>
          <WeekNav base={base} start={week.start} className="ml-auto" />
        </div>

        {/* day headers */}
        <div className={cn("grid border-b border-line", GRID_COLS)}>
          <div />
          {week.days.map((d, i) => (
            <div
              key={d.iso}
              className={cn(
                "border-l border-line px-1.5 py-1.5 font-ui text-[11px] font-semibold text-ink-3",
                i >= 5 && WEEKEND_HIDDEN,
                i === todayIndex && "bg-accent-soft"
              )}
            >
              {d.dow}
              <b className={cn("block font-display text-sm font-bold text-tk-onyx", i === todayIndex && "text-accent-ink")}>{d.num}</b>
            </div>
          ))}
        </div>

        {/* all-day "Due" row */}
        <div className={cn("grid border-b border-line bg-well", GRID_COLS)}>
          <div className="px-1 py-1.5 text-right font-ui text-[9px] font-bold uppercase tracking-[0.08em] text-ink-3">Due</div>
          {week.days.map((d, i) => {
            const items = dueRow.filter((item) => item.day === i)
            return (
              <div key={d.iso} className={cn("flex min-h-[30px] flex-col gap-1 border-l border-line px-1 py-1", i >= 5 && WEEKEND_HIDDEN)}>
                {items.map((item) => (
                  <DueChip key={item.id} item={item} color={paint} />
                ))}
              </div>
            )
          })}
        </div>

        {/* hour grid */}
        <div className="relative py-3" style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX + 24 }}>
          <div className={cn("absolute inset-x-0 top-3 grid", GRID_COLS)} style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX }}>
            <div />
            {week.days.map((d, i) => (
              <div key={d.iso} className={cn("border-l border-line", i >= 5 && WEEKEND_HIDDEN, i === todayIndex && "bg-accent-soft")}>
                {HOURS.map((h) => (
                  <div key={h} className="h-11 border-t border-line" />
                ))}
              </div>
            ))}
          </div>

          <div aria-hidden className="pointer-events-none absolute left-0 top-3 flex w-11 flex-col">
            {HOURS.map((h) => (
              <span key={h} className="-translate-y-1.5 h-11 pr-1.5 text-right font-mono text-[10px] text-ink-3">
                {h}:00
              </span>
            ))}
          </div>

          <div className={cn("absolute inset-x-0 top-3 grid", GRID_COLS)} style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX }}>
            <div />
            {week.days.map((d, i) => (
              <div key={d.iso} className={cn("relative", i >= 5 && WEEKEND_HIDDEN)}>
                {timed
                  .filter((e) => e.day === i)
                  .map((e) => (
                    <EventChip key={e.id} item={e} color={paint} />
                  ))}
              </div>
            ))}
            <NowLine days={week.days} />
          </div>
        </div>
      </Card>

      <WeekAgenda client={client} week={week} today={today} className="min-[720px]:w-[280px] min-[720px]:shrink-0" />
    </div>
  )
}

/** ‹ Today › — moves the week through `?week=` on `base`. */
function WeekNav({ base, start, className }: { base: string; start: string; className?: string }) {
  return (
    <Card surface="well" radius="lg" elevation="none" className={cn("inline-flex items-center gap-0.5 p-0.5", className)} role="group" aria-label="Move the week">
      <Link href={`${base}?week=${shiftWeekIso(start, -1)}`} aria-label="Previous week" className={navBtn}>
        <ChevronLeft className="size-3.5" aria-hidden />
      </Link>
      <Link href={base} aria-label="Jump to this week" className={navBtn}>
        Today
      </Link>
      <Link href={`${base}?week=${shiftWeekIso(start, 1)}`} aria-label="Next week" className={navBtn}>
        <ChevronRight className="size-3.5" aria-hidden />
      </Link>
    </Card>
  )
}

/**
 * The "This week" agenda: the seven days as a list. Beside the grid in a
 * client's Calendar room (no nav — the grid has it); on its own on the
 * roster, where the headline moves above the card with ‹ Today › as plain
 * text (`nav`, one line high like Signals) and every client's event wears
 * that client's colour (`item.color`).
 */
export function WeekAgenda({
  client,
  week,
  today,
  nav,
  max = AGENDA_MAX,
  className,
}: {
  /** Absent on the roster: rows then colour themselves by their own client. */
  client?: Client
  week: WeekData
  today: string
  /** Where ‹ Today › navigate; leave out when a grid beside it already has them. */
  nav?: { base: string }
  /** Rows per day before "+n more". */
  max?: number
  className?: string
}) {
  const todayIndex = week.days.findIndex((d) => d.iso === today)
  const paint = client?.color ?? ""
  const days = (
    <div className="flex flex-col gap-3">
      {week.days.map((d, i) => {
        const items = week.items.filter((item) => item.day === i)
        return (
          <div key={d.iso} className="flex flex-col gap-1">
            <p className="flex items-baseline gap-1.5 font-ui text-[11px] font-bold text-ink-2">
              <b className={cn("font-display text-sm font-bold text-tk-onyx", i === todayIndex && "text-accent-ink")}>{d.num}</b>
              <span className={i === todayIndex ? "text-accent-ink" : undefined}>{i === todayIndex ? "Today" : d.dow}</span>
            </p>
            {items.length === 0 ? (
              <p className="px-1 font-ui text-[11px] italic text-ink-3 opacity-70">Nothing scheduled</p>
            ) : (
              <div className="flex flex-col gap-1">
                {items.slice(0, max).map((item) => (
                  <AgendaRow key={item.id} item={item} color={item.kind === "event" && item.color ? item.color : paint} />
                ))}
                {items.length > max ? <p className="px-1 font-ui text-[10.5px] italic text-ink-3 opacity-70">+{items.length - max} more</p> : null}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  // On its own (the roster): the headline sits above the card, like Signals.
  if (nav) {
    return (
      <section className={cn("flex min-w-0 flex-col gap-1.5", className)} aria-label="This week">
        <div className="flex items-center gap-2 px-0.5">
          <h2 className="flex items-center gap-1.5 font-ui text-[13px] font-bold text-tk-onyx">
            <Calendar className="size-3.5" aria-hidden />
            This week
          </h2>
          <span className="truncate font-ui text-[11.5px] text-ink-3">{weekRangeLabel(week.days)}</span>
          {/* plain text, one line high — the bordered group is the grid's */}
          <nav className="ml-auto inline-flex shrink-0 items-center gap-1.5 font-ui text-[11px] font-semibold" aria-label="Move the week">
            <Link href={`${nav.base}?week=${shiftWeekIso(week.start, -1)}`} aria-label="Previous week" className="text-ink-3 hover:text-tk-onyx">
              <ChevronLeft className="size-3.5" aria-hidden />
            </Link>
            <Link href={nav.base} className="text-accent-ink hover:underline">
              Today
            </Link>
            <Link href={`${nav.base}?week=${shiftWeekIso(week.start, 1)}`} aria-label="Next week" className="text-ink-3 hover:text-tk-onyx">
              <ChevronRight className="size-3.5" aria-hidden />
            </Link>
          </nav>
        </div>
        <Card className="flex flex-1 flex-col gap-3 p-3">{days}</Card>
      </section>
    )
  }

  return (
    <Card className={cn("flex w-full flex-col gap-3 p-3", className)}>
      <h2 className="font-ui text-[13px] font-bold text-tk-onyx">{client ? `This week for ${client.name}` : "This week"}</h2>
      {days}
    </Card>
  )
}

function Legend({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {swatch}
      {label}
    </span>
  )
}

/** One chip in the all-day "Due" row: a deadline (flavour due/money/repeat)
 *  or an all-day calendar event, which the grid folds into the same row so
 *  a vacation block never gets pinned at the top of the 8:00 hour cell. */
function DueChip({ item, color }: { item: WeekItem; color: string }) {
  if (item.kind === "due") {
    const Icon = item.flavour === "money" ? Receipt : item.flavour === "repeat" ? Repeat : AlarmClock
    const cls = cn(
      "flex min-w-0 items-center gap-1 truncate rounded-md border-l-[3px] px-1.5 py-0.5 font-ui text-[10.5px] font-semibold",
      item.flavour === "repeat" ? "bg-well text-ink-3" : "bg-bad-soft text-bad"
    )
    const style = { borderLeftColor: markColor(color) } as React.CSSProperties
    const body = (
      <>
        <Icon className="size-2.5 shrink-0" aria-hidden />
        <span className="truncate">{item.title}</span>
      </>
    )
    return item.href ? (
      <Link href={item.href} className={cls} style={style} title={item.title}>
        {body}
      </Link>
    ) : (
      <div className={cls} style={style} title={item.title}>
        {body}
      </div>
    )
  }

  const lane = eventLaneOf(item)
  color = item.color ?? color
  const cls = cn(
    "flex min-w-0 items-center gap-1 truncate rounded-md px-1.5 py-0.5 font-ui text-[10.5px] font-semibold",
    lane === "other" && "border border-line bg-well text-ink-3",
    lane === "own" && "border border-dashed border-accent-ink bg-accent-soft text-accent-ink"
  )
  const style = lane === "mine" ? ({ backgroundColor: eventTint(color), color: inkColor(color) } as React.CSSProperties) : undefined
  const body = (
    <span className="truncate">
      {item.who ? (
        <>
          <b className="font-bold">{item.who}</b> · {item.title}
        </>
      ) : (
        item.title
      )}
    </span>
  )
  return item.href ? (
    <a href={item.href} target="_blank" rel="noreferrer" className={cls} style={style} title={item.title}>
      {body}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <div className={cls} style={style} title={item.title}>
      {body}
    </div>
  )
}

/** A timed block inside the hour grid, positioned by `eventTop`/`eventHeight`. */
function EventChip({ item, color }: { item: TimedEvent; color: string }) {
  const lane = eventLaneOf(item)
  color = item.color ?? color
  const short = isShortEvent(item.startsAt, item.endsAt)
  const timeLabel = fmtHour(item.startsAt)
  const titleLabel = item.who ? `${item.who} · ${item.title}` : item.title
  const style: React.CSSProperties = { top: eventTop(item.startsAt), height: eventHeight(item.startsAt, item.endsAt) }
  if (lane === "mine") {
    style.backgroundColor = eventTint(color)
    style.color = inkColor(color)
  }
  const cls = cn(
    "absolute inset-x-[3px] overflow-hidden rounded-md px-1.5 font-ui text-[11px] leading-[1.25]",
    short ? "flex items-center gap-1 py-0.5" : "flex flex-col py-1",
    lane === "other" && "border border-line bg-well text-ink-3",
    lane === "own" && "border border-dashed border-accent-ink bg-accent-soft text-accent-ink"
  )
  const title = `${fmtRange(item.startsAt, item.endsAt)} ${titleLabel}`
  const body = short ? (
    <>
      <span className="shrink-0 font-mono text-[9.5px] opacity-80">{timeLabel}</span>
      <span className="truncate">{titleLabel}</span>
    </>
  ) : (
    <>
      <span className="font-mono text-[9.5px] opacity-80">{timeLabel}</span>
      <span className="truncate">{titleLabel}</span>
    </>
  )
  return item.href ? (
    <a href={item.href} target="_blank" rel="noreferrer" className={cls} style={style} title={title}>
      {body}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <div className={cls} style={style} title={title}>
      {body}
    </div>
  )
}

/** One line in the "This week for <client>" agenda. Mirrors the visual
 *  language of `WeekStrip`'s `Row` (the Board's compact strip that links
 *  here), extended with the third "own" lane this full room needs. */
function AgendaRow({ item, color }: { item: WeekItem; color: string }) {
  if (item.kind === "due") {
    const Icon = item.flavour === "money" ? Receipt : item.flavour === "repeat" ? Repeat : AlarmClock
    const cls = cn(
      "flex min-w-0 items-center gap-1.5 rounded-[6px] border-l-2 px-1.5 py-1 font-ui text-[11px] font-semibold leading-[1.2]",
      item.flavour === "repeat" ? "border-l-line-strong bg-well text-ink-3" : "border-l-bad bg-bad-soft text-bad"
    )
    const body = (
      <>
        <Icon className="size-2.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{item.title}</span>
      </>
    )
    return item.href ? (
      <Link href={item.href} className={cls} title={item.title}>
        {body}
      </Link>
    ) : (
      <div className={cls} title={item.title}>
        {body}
      </div>
    )
  }

  const lane = eventLaneOf(item)
  color = item.color ?? color
  const cls = cn(
    "flex min-w-0 items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[11px] leading-[1.2]",
    lane === "mine" && "border border-line bg-card font-semibold text-tk-onyx",
    lane === "other" && "border-l-2 border-l-line-strong bg-well font-medium text-ink-3",
    lane === "own" && "border border-dashed border-accent-ink bg-accent-soft font-medium text-accent-ink"
  )
  const style = lane === "mine" ? ({ borderLeft: `2px solid ${markColor(color)}` } as React.CSSProperties) : undefined
  const body = (
    <>
      {!item.allDay ? <span className="shrink-0 font-mono text-[9.5px] font-medium">{fmtHour(item.startsAt)}</span> : null}
      <span className="min-w-0 truncate">{item.title}</span>
      {item.who ? <span className="ml-auto shrink-0 font-ui text-[9px] font-semibold uppercase tracking-[0.04em]">{item.who}</span> : null}
      {lane === "own" ? <span className="ml-auto shrink-0 font-ui text-[9px] font-semibold uppercase tracking-[0.04em]">Me</span> : null}
    </>
  )
  return item.href ? (
    <a href={item.href} target="_blank" rel="noreferrer" className={cls} style={style} title={item.title}>
      {body}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  ) : (
    <div className={cls} style={style} title={item.title}>
      {body}
    </div>
  )
}
