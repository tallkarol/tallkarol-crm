"use client"

import { useEffect, useMemo, useState } from "react"
import { EventModal } from "@/components/calendar/EventModal"
import { cn } from "@/lib/cn"
import type { UpcomingMeeting } from "@/lib/calendar-types"

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/* All-day items are anchored at UTC midnight, matching the calendar board.
   Timed items follow the viewer's timezone. */
function dayKey(value: Date, utc: boolean) {
  return utc
    ? `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`
    : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}

function daysCovered(meeting: UpcomingMeeting) {
  const start = new Date(meeting.startsAt)
  const end = new Date(meeting.endsAt)
  const keys: string[] = [dayKey(start, meeting.allDay)]
  const cursor = new Date(start)
  for (let guard = 0; guard < 14; guard += 1) {
    cursor.setTime(cursor.getTime() + 86_400_000)
    if (meeting.allDay ? cursor >= end : cursor > end) break
    const key = dayKey(cursor, meeting.allDay)
    if (key === keys[keys.length - 1]) continue
    keys.push(key)
  }
  return keys
}

function weekDays() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return {
      key: dayKey(d, false),
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      day: d.getDate(),
      today: i === 0,
    }
  })
}

function timeLabel(meeting: UpcomingMeeting) {
  if (meeting.allDay) return "all day"
  return new Date(meeting.startsAt).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  })
}

function sortMeetings(a: UpcomingMeeting, b: UpcomingMeeting) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  return a.startsAt.localeCompare(b.startsAt)
}

export function UpcomingMeetings({ meetings }: { meetings: UpcomingMeeting[] }) {
  const [days, setDays] = useState<ReturnType<typeof weekDays> | null>(null)
  const [open, setOpen] = useState<UpcomingMeeting | null>(null)

  useEffect(() => {
    setDays(weekDays())
  }, [])

  const byDay = useMemo(() => {
    const map = new Map<string, UpcomingMeeting[]>()
    for (const meeting of meetings) {
      for (const key of daysCovered(meeting)) {
        const list = map.get(key) ?? []
        list.push(meeting)
        map.set(key, list)
      }
    }
    for (const list of Array.from(map.values())) list.sort(sortMeetings)
    return map
  }, [meetings])

  if (!days) return <div className="min-h-[11rem]" aria-hidden />

  return (
    <>
      <div className="overflow-x-auto">
        <div className="grid min-w-[42rem] grid-cols-7 divide-x divide-tk-slate/10">
          {days.map((day) => {
            const items = byDay.get(day.key) ?? []
            return (
              <div key={day.key} className="min-h-[11rem] px-2 py-2.5">
                <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-tk-slate/55">
                  {day.weekday}
                </p>
                <p
                  className={cn(
                    "mx-auto mt-1 grid size-7 place-items-center rounded-full text-sm tabular-nums",
                    day.today
                      ? "bg-tk-teal font-semibold text-tk-linen"
                      : "text-tk-onyx"
                  )}
                >
                  {day.day}
                </p>
                <ul className="mt-2 space-y-1">
                  {items.map((meeting) => (
                    <li key={meeting.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(meeting)}
                        className="block w-full rounded-md px-1.5 py-1 text-left hover:brightness-95"
                        style={{
                          backgroundColor: `${meeting.color}14`,
                          color: meeting.color,
                        }}
                        title={meeting.title || meeting.source}
                      >
                        <span className="block truncate text-[11px] font-medium leading-tight">
                          {meeting.title || meeting.source}
                        </span>
                        <span className="block truncate text-[10px] tabular-nums opacity-70">
                          {timeLabel(meeting)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
      {open ? (
        <EventModal
          event={{
            title: open.title || open.source,
            startsAt: open.startsAt,
            endsAt: open.endsAt,
            allDay: open.allDay,
            location: open.location,
            description: open.description,
            url: open.url,
            attendees: open.attendees,
            color: open.color,
            source: open.source,
          }}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  )
}
