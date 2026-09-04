"use client"

import Link from "next/link"
import { useEffect, useMemo, useState, useTransition } from "react"
import { EventModal, type EventModalItem } from "@/components/calendar/EventModal"
import { NewEventForm } from "@/components/calendar/NewEventForm"
import { Badge } from "@/components/work/Badge"
import type { CalendarItem, CalendarLane, CalendarSnapshot } from "@/lib/calendar-types"
import { syncCalendars } from "@/lib/calendar-actions"
import { cn } from "@/lib/cn"
import { inkColor } from "@/lib/client-colors"
import { Card } from "@/components/ui/Card"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/**
 * All-day items are anchored at UTC midnight by the server, so they are read
 * back in UTC. Timed items use the viewer's own zone.
 */
function dayKey(value: Date, utc: boolean) {
  return utc
    ? `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
    : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function daysCovered(item: CalendarItem) {
  const start = new Date(item.startsAt)
  const end = new Date(item.endsAt)
  const keys: string[] = [dayKey(start, item.allDay)]

  // An all-day range ends at the exclusive next midnight; a timed one at a real
  // instant. Both walk forward a day at a time, capped so a runaway range from
  // a provider can never lock up the grid.
  const cursor = new Date(start)
  for (let guard = 0; guard < 60; guard += 1) {
    cursor.setTime(cursor.getTime() + 86_400_000)
    if (item.allDay ? cursor >= end : cursor > end) break
    const key = dayKey(cursor, item.allDay)
    if (key === keys[keys.length - 1]) continue
    keys.push(key)
  }
  return keys
}

function timeLabel(item: CalendarItem) {
  if (item.allDay) return "All day"
  return new Date(item.startsAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

function toModalItem(
  item: CalendarItem,
  lane?: CalendarLane
): EventModalItem {
  return {
    title: item.title,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    allDay: item.allDay,
    location: item.location,
    description: item.detail,
    url: item.url,
    href: item.href,
    attendees: item.attendees,
    cancelled: item.cancelled,
    color: lane?.color,
    source: lane?.label,
  }
}

function rangeLabel(item: CalendarItem) {
  if (item.allDay) return "All day"
  const options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  }
  const start = new Date(item.startsAt).toLocaleTimeString(undefined, options)
  const end = new Date(item.endsAt).toLocaleTimeString(undefined, options)
  return `${start} – ${end}`
}

function monthGrid(month: string) {
  const [year, mon] = month.split("-").map(Number)
  const first = new Date(year, mon - 1, 1)
  const cursor = new Date(first)
  cursor.setDate(1 - first.getDay())

  const weeks: { key: string; day: number; inMonth: boolean }[][] = []
  for (let week = 0; week < 6; week += 1) {
    const row: { key: string; day: number; inMonth: boolean }[] = []
    for (let slot = 0; slot < 7; slot += 1) {
      row.push({
        key: `${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}-${pad(cursor.getDate())}`,
        day: cursor.getDate(),
        inMonth: cursor.getMonth() === mon - 1,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(row)
  }
  return weeks
}

export function CalendarBoard({
  snapshot,
  prevMonth,
  nextMonth,
  thisMonth,
  monthLabel,
}: {
  snapshot: CalendarSnapshot
  prevMonth: string
  nextMonth: string
  thisMonth: string
  monthLabel: string
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null)
  const [openEvent, setOpenEvent] = useState<CalendarItem | null>(null)
  const [composing, setComposing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Deferred so server and client markup agree on first paint.
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => {
    setToday(dayKey(new Date(), false))
  }, [])

  const visible = useMemo(
    () => snapshot.items.filter((item) => !hidden.has(item.laneId)),
    [snapshot.items, hidden]
  )

  const laneById = useMemo(
    () => new Map(snapshot.lanes.map((lane) => [lane.id, lane])),
    [snapshot.lanes]
  )

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    for (const item of visible) {
      for (const key of daysCovered(item)) {
        const bucket = map.get(key)
        if (bucket) bucket.push(item)
        else map.set(key, [item])
      }
    }
    map.forEach((bucket) => {
      bucket.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
        return a.startsAt.localeCompare(b.startsAt)
      })
    })
    return map
  }, [visible])

  const weeks = useMemo(() => monthGrid(snapshot.month), [snapshot.month])
  const agendaDay = selected ?? today
  const agenda = agendaDay ? (byDay.get(agendaDay) ?? []) : []

  function toggleLane(id: string) {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function runSync() {
    setNotice(null)
    startTransition(async () => {
      const result = await syncCalendars()
      if (!result.ok) setNotice(result.error)
      else if (result.errors.length) setNotice(result.errors.join(" · "))
      else setNotice(`Synced ${result.synced} events.`)
    })
  }

  const connected = snapshot.sources.filter((source) => source.enabled).length

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <MonthLink href={`/calendar?month=${prevMonth}`} label="Previous month">
            ‹
          </MonthLink>
          <p className="min-w-[10rem] px-2 text-center text-sm font-semibold text-tk-onyx">
            {monthLabel}
          </p>
          <MonthLink href={`/calendar?month=${nextMonth}`} label="Next month">
            ›
          </MonthLink>
          <Link
            href={`/calendar?month=${thisMonth}`}
            className="ml-2 rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
          >
            Today
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runSync}
            disabled={pending || connected === 0}
            className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal disabled:opacity-50"
          >
            {pending ? "Syncing…" : "Sync now"}
          </button>
          <button
            type="button"
            onClick={() => setComposing((value) => !value)}
            className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-tk-linen"
          >
            {composing ? "Close" : "New event"}
          </button>
        </div>
      </div>

      {notice ? (
        <p className="mt-3 rounded-2xl border border-line bg-card px-4 py-2.5 text-sm text-tk-slate shadow-card">
          {notice}
        </p>
      ) : null}

      {composing ? (
        <NewEventForm
          defaultDay={agendaDay}
          canWrite={snapshot.sources.some((s) => s.writable && s.enabled)}
          onDone={(text) => {
            setComposing(false)
            setNotice(text)
          }}
        />
      ) : null}

      {snapshot.lanes.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {snapshot.lanes.map((lane) => {
            const off = hidden.has(lane.id)
            return (
              <button
                key={lane.id}
                type="button"
                onClick={() => toggleLane(lane.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  off
                    ? "border-line bg-card text-ink-3"
                    : "border-line-strong bg-card text-tk-slate"
                )}
                aria-pressed={!off}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: off ? "transparent" : lane.color, boxShadow: `inset 0 0 0 1.5px ${lane.color}` }}
                />
                {lane.label}
                <span className="tabular-nums opacity-70">{lane.count}</span>
              </button>
            )
          })}
        </div>
      ) : null}

      <Card className="mt-5 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-line">
          {WEEKDAYS.map((label) => (
            <div
              key={label}
              className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-3"
            >
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {weeks.flat().map((cell) => {
            const items = byDay.get(cell.key) ?? []
            const isToday = cell.key === today
            const isSelected = cell.key === agendaDay
            return (
              <div
                key={cell.key}
                className={cn(
                  "min-h-[6.5rem] border-b border-r border-line p-1.5 text-left align-top last:border-r-0",
                  !cell.inMonth && "bg-well",
                  isSelected && "bg-well"
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelected(cell.key)}
                  className={cn(
                    "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums hover:bg-well transition-colors duration-[120ms]",
                    cell.inMonth ? "text-tk-onyx" : "text-ink-3",
                    isToday && "bg-accent font-semibold text-tk-linen hover:bg-accent"
                  )}
                >
                  {cell.day}
                </button>

                <span className="mt-1 block space-y-0.5">
                  {items.slice(0, 3).map((item) => {
                    const lane = laneById.get(item.laneId)
                    return (
                      <button
                        key={`${cell.key}:${item.id}`}
                        type="button"
                        onClick={() => setOpenEvent(item)}
                        className={cn(
                          "flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] leading-tight",
                          item.cancelled && "line-through opacity-50"
                        )}
                        style={{
                          // A lane hue as text on its own tint: raw, gdi is
                          // 2.49:1 there in dark. Shaded in light, lifted in
                          // dark, the same two channels every client colour uses.
                          "--c": lane?.color ?? "#006965",
                          backgroundColor: "color-mix(in srgb, var(--c) 8%, transparent)",
                          color: inkColor(lane?.color ?? "#006965"),
                        } as React.CSSProperties}
                        title={item.title}
                      >
                        {!item.allDay ? (
                          <span className="shrink-0 tabular-nums opacity-70">
                            {timeLabel(item)}
                          </span>
                        ) : null}
                        <span className="truncate">{item.title}</span>
                      </button>
                    )
                  })}
                  {items.length > 3 ? (
                    <button
                      type="button"
                      onClick={() => setSelected(cell.key)}
                      className="block w-full px-1 text-left text-[11px] text-ink-3 hover:text-tk-onyx"
                    >
                      +{items.length - 3} more
                    </button>
                  ) : null}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <div className="border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-tk-onyx">
            {agendaDay
              ? new Date(`${agendaDay}T12:00:00`).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : "Pick a day"}
          </h2>
        </div>

        {agenda.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-3">Nothing on this day.</p>
        ) : (
          <ul className="divide-y divide-line">
            {agenda.map((item) => {
              const lane = laneById.get(item.laneId)
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setOpenEvent(item)}
                    className="flex w-full gap-3 px-5 py-3.5 text-left hover:bg-well"
                  >
                    <span
                      className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: lane?.color ?? "#006965" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={cn(
                            "font-medium text-tk-onyx",
                            item.cancelled && "line-through opacity-60"
                          )}
                        >
                          {item.title}
                        </p>
                        {item.cancelled ? <Badge tone="muted">Cancelled</Badge> : null}
                      </div>
                      <p className="mt-0.5 text-sm text-ink-3">
                        {[rangeLabel(item), lane?.label, item.location]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {item.attendees.length ? (
                        <p className="mt-1 truncate text-xs text-ink-3">
                          {item.attendees
                            .map((person) => person.name || person.email)
                            .join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      {openEvent ? (
        <EventModal
          event={toModalItem(openEvent, laneById.get(openEvent.laneId))}
          onClose={() => setOpenEvent(null)}
        />
      ) : null}
    </>
  )
}

function MonthLink({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line bg-card text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
    >
      {children}
    </Link>
  )
}
