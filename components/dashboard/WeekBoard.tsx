"use client"

import Link from "next/link"
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react"
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react"
import { EventModal } from "@/components/calendar/EventModal"
import { meetingsInWindow, moveMeeting } from "@/lib/calendar-actions"
import type { MeetingSource } from "@/lib/calendar"
import type { UpcomingMeeting } from "@/lib/calendar-types"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"

const DAY_MS = 86_400_000
const WINDOW_DAYS = 5
const HIDDEN_STORAGE_KEY = "tk-dashboard-calendars-hidden"

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
  for (let guard = 0; guard < 60; guard += 1) {
    cursor.setTime(cursor.getTime() + DAY_MS)
    if (meeting.allDay ? cursor >= end : cursor > end) break
    const key = dayKey(cursor, meeting.allDay)
    if (key === keys[keys.length - 1]) continue
    keys.push(key)
  }
  return keys
}

function sortMeetings(a: UpcomingMeeting, b: UpcomingMeeting) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  return a.startsAt.localeCompare(b.startsAt)
}

function startOfDay(value: Date) {
  const x = new Date(value)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(value: Date, n: number) {
  const x = new Date(value)
  x.setDate(x.getDate() + n)
  return x
}

function timeOfDay(value: Date) {
  let h = value.getHours()
  const m = value.getMinutes()
  const ap = h >= 12 ? "PM" : "AM"
  h = h % 12
  if (h === 0) h = 12
  return m === 0 ? `${h} ${ap}` : `${h}:${pad(m)} ${ap}`
}

function durationLabel(minutes: number) {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (m === 0) return `${h} hr${h > 1 ? "s" : ""}`
  return `${h} hr ${m} min`
}

function eventTimeLabel(meeting: UpcomingMeeting) {
  if (meeting.allDay) return "All day"
  const start = new Date(meeting.startsAt)
  const end = new Date(meeting.endsAt)
  const minutes = (end.getTime() - start.getTime()) / 60_000
  return `${timeOfDay(start)} · ${durationLabel(minutes)}`
}

function rangeLabel(start: Date) {
  const end = addDays(start, WINDOW_DAYS - 1)
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })
  return `${fmt(start)} – ${fmt(end)}`
}

function movedWhenLabel(value: Date, allDay: boolean) {
  const datePart = value.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
  return allDay ? datePart : `${datePart}, ${timeOfDay(value)}`
}

/** Cal.com and read-only ICS/Google sources explain themselves the same way
 * the server does, so the tooltip never drifts from the real refusal. */
function readOnlyTitle(source: MeetingSource | undefined) {
  const where = source?.kind === "cal_com" ? "Cal.com" : "its own calendar"
  return `Read-only here — move it in ${where}.`
}

function loadHiddenSources(): Set<string> {
  try {
    const raw = window.localStorage.getItem(HIDDEN_STORAGE_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    return new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [])
  } catch {
    return new Set()
  }
}

function saveHiddenSources(hidden: Set<string>) {
  try {
    window.localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify(Array.from(hidden)))
  } catch {
    // Storage can be unavailable (private mode, quota) — the chips still work
    // for the session, they just won't persist across reloads.
  }
}

type ToastState = { message: string; undo?: () => void }

type DragState = {
  id: string
  dx: number
  dy: number
  originIndex: number
  hoverIndex: number
}

const segBtn =
  "grid h-[26px] min-w-[26px] place-items-center rounded-md px-2 font-ui text-[11.5px] font-semibold text-tk-slate transition-colors hover:bg-card hover:text-tk-onyx"

export function WeekBoard({
  configured,
  meetings: initialMeetings,
  sources: initialSources,
}: {
  configured: boolean
  meetings: UpcomingMeeting[]
  sources: MeetingSource[]
}) {
  const [start, setStart] = useState<Date | null>(null)
  const [meetings, setMeetings] = useState(initialMeetings)
  const [sources, setSources] = useState(initialSources)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [openMeeting, setOpenMeeting] = useState<UpcomingMeeting | null>(null)
  const [drag, setDrag] = useState<DragState | null>(null)

  const cacheRef = useRef<Map<string, { meetings: UpcomingMeeting[]; sources: MeetingSource[] }>>(
    new Map()
  )
  const dragRef = useRef<DragState | null>(null)
  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    const today = startOfDay(new Date())
    setStart(today)
    cacheRef.current.set(dayKey(today, false), {
      meetings: initialMeetings,
      sources: initialSources,
    })
    setHidden(loadHiddenSources())
    // Only the mount-time snapshot seeds the cache; later prop updates (a
    // server refresh from elsewhere on the page) aren't expected mid-session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function showToast(message: string, undo?: () => void) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message, undo })
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  const loadWindow = useCallback(async (targetStart: Date) => {
    const key = dayKey(targetStart, false)
    const cached = cacheRef.current.get(key)
    if (cached) {
      setMeetings(cached.meetings)
      setSources(cached.sources)
      return
    }
    const seq = (requestSeq.current += 1)
    setLoading(true)
    const from = addDays(targetStart, -1)
    const to = addDays(targetStart, WINDOW_DAYS + 1)
    const result = await meetingsInWindow(from.toISOString(), to.toISOString())
    if (seq !== requestSeq.current) return // a newer window request has since landed
    setLoading(false)
    if (!result.ok) {
      showToast(result.error)
      return // keep whatever was already on screen
    }
    cacheRef.current.set(key, result.data)
    setMeetings(result.data.meetings)
    setSources(result.data.sources)
  }, [])

  function goPrev() {
    setStart((current) => {
      if (!current) return current
      const next = addDays(current, -WINDOW_DAYS)
      void loadWindow(next)
      return next
    })
  }
  function goNext() {
    setStart((current) => {
      if (!current) return current
      const next = addDays(current, WINDOW_DAYS)
      void loadWindow(next)
      return next
    })
  }
  function goToday() {
    const today = startOfDay(new Date())
    setStart(today)
    void loadWindow(today)
  }

  function toggleHidden(id: string) {
    setHidden((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      saveHiddenSources(next)
      return next
    })
  }

  const days = useMemo(
    () => (start ? Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(start, i)) : []),
    [start]
  )

  const sourceById = useMemo(() => new Map(sources.map((s) => [s.id, s])), [sources])

  const visibleMeetings = useMemo(
    () => meetings.filter((m) => !hidden.has(m.sourceId)),
    [meetings, hidden]
  )

  const byDay = useMemo(() => {
    const map = new Map<string, UpcomingMeeting[]>()
    for (const meeting of visibleMeetings) {
      for (const key of daysCovered(meeting)) {
        const list = map.get(key)
        if (list) list.push(meeting)
        else map.set(key, [meeting])
      }
    }
    for (const list of Array.from(map.values())) list.sort(sortMeetings)
    return map
  }, [visibleMeetings])

  const windowKeys = useMemo(() => new Set(days.map((d) => dayKey(d, false))), [days])

  const sourceCounts = useMemo(() => {
    const counts = new Map<string, number>()
    const seen = new Set<string>()
    for (const key of Array.from(windowKeys)) {
      for (const meeting of byDay.get(key) ?? []) {
        const dedupeKey = `${key}:${meeting.id}`
        if (seen.has(dedupeKey)) continue
        seen.add(dedupeKey)
        counts.set(meeting.sourceId, (counts.get(meeting.sourceId) ?? 0) + 1)
      }
    }
    return counts
  }, [byDay, windowKeys])

  const todayKey = useMemo(() => dayKey(startOfDay(new Date()), false), [])

  const isWindowEmpty = useMemo(
    () => Array.from(windowKeys).every((key) => (byDay.get(key) ?? []).length === 0),
    [windowKeys, byDay]
  )

  async function runMove(meeting: UpcomingMeeting, shift: number) {
    if (shift === 0) return
    const prevMeetings = meetings
    const nextStart = new Date(new Date(meeting.startsAt).getTime() + shift * DAY_MS)
    const nextEnd = new Date(new Date(meeting.endsAt).getTime() + shift * DAY_MS)
    setMeetings((list) =>
      list.map((m) =>
        m.id === meeting.id
          ? { ...m, startsAt: nextStart.toISOString(), endsAt: nextEnd.toISOString() }
          : m
      )
    )
    const result = await moveMeeting(meeting.id, shift)
    if (!result.ok) {
      setMeetings(prevMeetings)
      showToast(result.error)
      return
    }
    const confirmedStart = result.data.startsAt
    const confirmedEnd = result.data.endsAt
    setMeetings((list) =>
      list.map((m) =>
        m.id === meeting.id ? { ...m, startsAt: confirmedStart, endsAt: confirmedEnd } : m
      )
    )
    const when = movedWhenLabel(new Date(confirmedStart), meeting.allDay)
    showToast(`Moved “${meeting.title || meeting.source}” to ${when}`, () => {
      void runMove(
        { ...meeting, startsAt: confirmedStart, endsAt: confirmedEnd },
        -shift
      )
    })
  }

  function onCardPointerDown(
    event: React.PointerEvent<HTMLButtonElement>,
    meeting: UpcomingMeeting,
    originIndex: number
  ) {
    if (event.button !== 0) return
    const source = sourceById.get(meeting.sourceId)
    if (!source?.movable) return
    const startX = event.clientX
    const startY = event.clientY
    const pointerId = event.pointerId
    const el = event.currentTarget
    el.setPointerCapture(pointerId)
    let moved = false

    function computeHoverIndex(clientX: number) {
      let hoverIndex = -1
      colRefs.current.forEach((node, i) => {
        if (!node) return
        const rect = node.getBoundingClientRect()
        if (clientX >= rect.left && clientX <= rect.right) hoverIndex = i
      })
      return hoverIndex
    }

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!moved && Math.hypot(dx, dy) < 4) return
      moved = true
      const hoverIndex = computeHoverIndex(ev.clientX)
      const next: DragState = { id: meeting.id, dx, dy, originIndex, hoverIndex }
      dragRef.current = next
      setDrag(next)
    }

    function cleanup() {
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerup", onUp)
      el.removeEventListener("pointercancel", onCancel)
      if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId)
    }

    function onUp() {
      cleanup()
      const finalDrag = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!moved || !finalDrag) return
      if (finalDrag.hoverIndex < 0 || finalDrag.hoverIndex === finalDrag.originIndex) return
      const shift = finalDrag.hoverIndex - finalDrag.originIndex
      void runMove(meeting, shift)
    }

    function onCancel() {
      cleanup()
      dragRef.current = null
      setDrag(null)
    }

    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerup", onUp)
    el.addEventListener("pointercancel", onCancel)
  }

  if (!configured) {
    return (
      <section
        className="rounded-2xl border border-line bg-card shadow-card"
        aria-labelledby="week-board-title"
      >
        <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-3">
          <h2
            id="week-board-title"
            className="font-display text-[15px] font-semibold text-tk-onyx"
          >
            Calendar
          </h2>
        </div>
        <div className="px-[18px] py-6 text-sm text-ink-3">
          <p>No calendars connected yet — upcoming bookings will show here.</p>
          <Link
            href={ROUTES.settingsCalendar}
            className="mt-2 inline-block font-semibold text-tk-teal hover:underline"
          >
            Connect calendars →
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section
      className="relative rounded-2xl border border-line bg-card shadow-card"
      aria-labelledby="week-board-title"
    >
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-[18px] py-3">
        <h2
          id="week-board-title"
          className="font-display text-[15px] font-semibold text-tk-onyx"
        >
          Calendar
        </h2>
        <span className="font-ui text-xs text-ink-3">
          {start ? rangeLabel(start) : " "}
        </span>
        <div
          role="group"
          aria-label="Move the window"
          className="ml-0.5 inline-flex items-center gap-0.5 rounded-lg border border-line bg-well p-0.5"
        >
          <button type="button" aria-label="Previous five days" onClick={goPrev} className={segBtn}>
            <ChevronLeft className="size-3.5" aria-hidden />
          </button>
          <button type="button" aria-label="Jump to today" onClick={goToday} className={segBtn}>
            Today
          </button>
          <button type="button" aria-label="Next five days" onClick={goNext} className={segBtn}>
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        </div>
        <div className="ml-auto">
          <Link
            href={ROUTES.calendar}
            className="inline-flex items-center gap-1 font-ui text-xs font-semibold text-tk-teal hover:underline"
          >
            Full calendar <ArrowRight className="size-3" aria-hidden />
          </Link>
        </div>
      </div>

      {sources.length > 0 ? (
        <div
          role="group"
          aria-label="Calendars shown"
          className="flex flex-wrap gap-1.5 px-[18px] pt-2.5"
        >
          {sources.map((source) => {
            const isHidden = hidden.has(source.id)
            return (
              <button
                key={source.id}
                type="button"
                aria-pressed={!isHidden}
                onClick={() => toggleHidden(source.id)}
                style={{ "--c": source.color } as CSSProperties}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-ui text-[11.5px] font-semibold transition-colors",
                  isHidden ? "text-ink-3" : "tk-client-tint tk-client-ink"
                )}
              >
                <span
                  aria-hidden
                  className={cn("size-[7px] rounded-full", isHidden && "opacity-50")}
                  style={{ background: isHidden ? "currentColor" : "var(--c)" }}
                />
                {source.label}
                <span className="font-medium opacity-70">
                  {sourceCounts.get(source.id) ?? 0}
                </span>
              </button>
            )
          })}
        </div>
      ) : null}

      <div
        className={cn(
          "mt-2.5 overflow-x-auto border-t border-line transition-opacity duration-150 motion-reduce:transition-none",
          loading && "opacity-60"
        )}
      >
        {start ? (
          <>
            <div className="grid min-w-[55rem] grid-cols-5 divide-x divide-line lg:min-w-0">
              {days.map((d) => {
                const key = dayKey(d, false)
                const isToday = key === todayKey
                const isPast = key < todayKey
                return (
                  <div key={key} className="grid min-w-[11rem] justify-items-center gap-[3px] px-1.5 py-2 text-center lg:min-w-0">
                    <span className="font-ui text-[10px] font-bold uppercase tracking-wide text-ink-3">
                      {d.toLocaleDateString(undefined, { weekday: "short" })}
                    </span>
                    <span
                      className={cn(
                        "grid size-[26px] place-items-center rounded-full font-display text-[13px] font-semibold tabular-nums",
                        isToday ? "bg-accent text-tk-linen" : "text-tk-onyx",
                        isPast && !isToday && "opacity-55"
                      )}
                    >
                      {d.getDate()}
                    </span>
                  </div>
                )
              })}
            </div>

            <div className="relative grid min-h-[11.5rem] min-w-[55rem] grid-cols-5 divide-x divide-line lg:min-w-0">
              {isWindowEmpty ? (
                <p className="pointer-events-none absolute inset-0 grid place-items-center px-6 text-center font-ui text-[12.5px] text-ink-3">
                  Nothing on the calendars in these five days.
                </p>
              ) : null}
              {days.map((d, index) => {
                const key = dayKey(d, false)
                const isPast = key < todayKey
                const items = byDay.get(key) ?? []
                const isDropTarget =
                  drag !== null && drag.hoverIndex === index && drag.originIndex !== index

                return (
                  <div
                    key={key}
                    ref={(node) => {
                      colRefs.current[index] = node
                    }}
                    className={cn(
                      "min-w-[11rem] space-y-1.5 px-1.5 py-2 transition-colors duration-150 motion-reduce:transition-none lg:min-w-0",
                      isDropTarget && "bg-accent/10"
                    )}
                  >
                    {items.length === 0 ? (
                      !isPast ? (
                        <p className="py-3.5 text-center font-ui text-[11.5px] text-ink-3">—</p>
                      ) : null
                    ) : (
                      items.map((meeting) => {
                        const source = sourceById.get(meeting.sourceId)
                        const movable = Boolean(source?.movable)
                        const dragging = drag?.id === meeting.id
                        const style: CSSProperties = {
                          "--c": meeting.color,
                          borderLeftColor: meeting.color,
                        } as CSSProperties
                        if (dragging && drag) {
                          style.transform = `translate(${drag.dx}px, ${drag.dy}px)`
                        }
                        return (
                          <button
                            key={meeting.id}
                            type="button"
                            title={movable ? meeting.title || meeting.source : readOnlyTitle(source)}
                            onPointerDown={(event) =>
                              onCardPointerDown(event, meeting, index)
                            }
                            onClick={() => {
                              if (dragging) return
                              setOpenMeeting(meeting)
                            }}
                            style={style}
                            className={cn(
                              "tk-client-tint tk-client-ink block w-full rounded-lg border-l-[3px] px-2 py-1.5 text-left transition-[box-shadow,transform] duration-150 motion-reduce:transition-none hover:-translate-y-px hover:shadow-hover",
                              movable ? "touch-none cursor-grab" : "cursor-default",
                              isPast && !dragging && "opacity-55",
                              dragging &&
                                "z-10 cursor-grabbing opacity-95 shadow-hover motion-reduce:transform-none"
                            )}
                          >
                            <span className="block font-ui text-[10.5px] font-bold tabular-nums tracking-wide">
                              {eventTimeLabel(meeting)}
                            </span>
                            <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-tk-onyx">
                              {meeting.title || meeting.source}
                            </span>
                            <span className="mt-0.5 block truncate text-[10.5px] text-ink-3">
                              {meeting.location || meeting.source}
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="min-h-[11.5rem]" aria-hidden />
        )}
      </div>

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-tk-onyx px-3.5 py-2 text-[12.5px] text-tk-linen shadow-hover"
        >
          <span>{toast.message}</span>
          {toast.undo ? (
            <button
              type="button"
              onClick={() => {
                toast.undo?.()
                setToast(null)
              }}
              className="rounded-md bg-on-accent/15 px-2 py-1 font-ui text-[11.5px] font-semibold"
            >
              Undo
            </button>
          ) : null}
        </div>
      ) : null}

      {openMeeting ? (
        <EventModal
          event={{
            title: openMeeting.title || openMeeting.source,
            startsAt: openMeeting.startsAt,
            endsAt: openMeeting.endsAt,
            allDay: openMeeting.allDay,
            location: openMeeting.location,
            description: openMeeting.description,
            url: openMeeting.url,
            attendees: openMeeting.attendees,
            color: openMeeting.color,
            source: openMeeting.source,
          }}
          onClose={() => setOpenMeeting(null)}
        />
      ) : null}
    </section>
  )
}
