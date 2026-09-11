"use client"

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { GripVertical, Square } from "lucide-react"
import { REC_MARK } from "@/components/meeting-notes/RecordPanel"
import { formatClock } from "@/lib/meeting-note"
import { liveRecordingNow, stopRecordingAction } from "@/lib/meeting-note-actions"
import type { LiveView } from "@/lib/meeting-notes"
import { clockLabel, useElapsed } from "@/components/timesheet/useElapsed"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { runningNow, stopPunch } from "@/lib/punch-actions"
import { announcePunchChange, onPunchChange } from "@/lib/punch-signal"
import type { PunchView } from "@/lib/punches"

/**
 * The running clocks, floating above every admin page — so a punch is never
 * out of sight and stopping it never costs a navigation. One pill per open
 * punch, stacked under a single drag grip.
 *
 * It starts top-right, out of the way of page headers, and goes wherever it is
 * dragged; the spot is remembered per browser and clamped back on screen if
 * the window shrinks. Mounted by the admin layout *outside* the app shell, so
 * no scrolling or transformed ancestor can trap the fixed positioning.
 *
 * Data: the layout's server render seeds it; afterwards it polls on a slow
 * interval and refetches on focus, on navigation, and the moment anything in
 * the browser announces a punch change. The poll is what makes a clock-in
 * from the watch or the Mac widget show up here without a reload.
 */

const POSITION_KEY = "tk-crm-clock-position"
const POLL_MS = 30_000
/** A recording changes state in seconds — starting, stopping — so the pill polls faster while one is live. */
const LIVE_POLL_MS = 5_000
const EDGE = 8
const NUDGE = 12

type Point = { x: number; y: number }

function readPosition(): Point | null {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Point>
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null
    return { x: parsed.x, y: parsed.y }
  } catch {
    return null
  }
}

function writePosition(point: Point | null) {
  try {
    if (point) window.localStorage.setItem(POSITION_KEY, JSON.stringify(point))
    else window.localStorage.removeItem(POSITION_KEY)
  } catch {
    /* ignore */
  }
}

function clamp(point: Point, el: HTMLElement | null): Point {
  const w = el?.offsetWidth ?? 0
  const h = el?.offsetHeight ?? 0
  return {
    x: Math.min(Math.max(EDGE, point.x), Math.max(EDGE, window.innerWidth - w - EDGE)),
    y: Math.min(Math.max(EDGE, point.y), Math.max(EDGE, window.innerHeight - h - EDGE)),
  }
}

export function FloatingClock({
  initial,
  initialRecording = null,
}: {
  initial: PunchView[]
  initialRecording?: LiveView | null
}) {
  const pathname = usePathname()
  const [running, setRunning] = useState(initial)
  const [recording, setRecording] = useState<LiveView | null>(initialRecording)
  const [error, setError] = useState<string | null>(null)

  // The server render is the freshest data on a hard load; on soft
  // navigation the layout keeps its old props, so the poll below takes over.
  useEffect(() => setRunning(initial), [initial])
  useEffect(() => setRecording(initialRecording), [initialRecording])

  const refresh = useCallback(async () => {
    try {
      const [punches, live] = await Promise.all([runningNow(), liveRecordingNow()])
      setRunning(punches)
      setRecording(live)
    } catch {
      /* transient — the next poll retries */
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [pathname, refresh])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, recording ? LIVE_POLL_MS : POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    const off = onPunchChange(() => void refresh())
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
      off()
    }
  }, [refresh, recording])

  /* ---- position ---- */
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<Point | null>(null)
  const [placed, setPlaced] = useState(false)
  const [dragging, setDragging] = useState(false)
  const grab = useRef<{ dx: number; dy: number } | null>(null)

  useLayoutEffect(() => {
    const saved = readPosition()
    if (saved) setPosition(clamp(saved, ref.current))
    setPlaced(true)
  }, [])

  useEffect(() => {
    const onResize = () => {
      setPosition((current) => (current ? clamp(current, ref.current) : current))
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  function currentPoint(): Point {
    if (position) return position
    const rect = ref.current?.getBoundingClientRect()
    return rect ? { x: rect.left, y: rect.top } : { x: EDGE, y: EDGE }
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return
    const start = currentPoint()
    grab.current = { dx: event.clientX - start.x, dy: event.clientY - start.y }
    setPosition(start)
    setDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!grab.current) return
    const { dx, dy } = grab.current
    setPosition(clamp({ x: event.clientX - dx, y: event.clientY - dy }, ref.current))
  }

  function onPointerUp(event: React.PointerEvent<HTMLButtonElement>) {
    if (!grab.current) return
    grab.current = null
    setDragging(false)
    event.currentTarget.releasePointerCapture(event.pointerId)
    setPosition((current) => {
      writePosition(current)
      return current
    })
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const moves: Record<string, Point> = {
      ArrowLeft: { x: -NUDGE, y: 0 },
      ArrowRight: { x: NUDGE, y: 0 },
      ArrowUp: { x: 0, y: -NUDGE },
      ArrowDown: { x: 0, y: NUDGE },
    }
    if (event.key === "Home") {
      event.preventDefault()
      setPosition(null)
      writePosition(null)
      return
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    const start = currentPoint()
    const next = clamp({ x: start.x + move.x, y: start.y + move.y }, ref.current)
    setPosition(next)
    writePosition(next)
  }

  // A recording that owns a punch is one pill, not two: the plain pill for
  // that punch is hidden and Stop on the recording stops both.
  const shownPunches = running.filter((punch) => !recording || punch.id !== recording.punchId)
  const showRecording = recording && (recording.status === "recording" || recording.status === "stopping" || recording.status === "requested")
  if (shownPunches.length === 0 && !showRecording) return null

  return (
    <div
      ref={ref}
      data-chrome="clock"
      role="region"
      aria-label="Running clock"
      style={
        position
          ? { left: position.x, top: position.y, right: "auto" }
          : undefined
      }
      className={cn(
        // Above everything the app draws — menus, peeks, modals, toasts.
        "fixed right-4 top-[4.25rem] z-[100] flex max-w-[calc(100vw-2rem)] items-stretch md:right-6 md:top-4",
        "rounded-full bg-accent text-xs font-semibold text-tk-linen shadow-[0_6px_20px_rgba(15,22,21,0.28)]",
        dragging ? "cursor-grabbing select-none" : "transition-shadow",
        !placed && "invisible"
      )}
    >
      <button
        type="button"
        aria-label="Move the clock. Arrow keys nudge it; Home puts it back."
        title="Drag to move"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className={cn(
          "flex shrink-0 touch-none items-center rounded-l-full pl-2 pr-1 text-tk-linen/60 hover:bg-tk-linen/10 hover:text-tk-linen",
          showRecording && "bg-tk-onyx",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-teal",
          dragging ? "cursor-grabbing" : "cursor-grab"
        )}
      >
        <GripVertical className="size-3.5" aria-hidden />
      </button>
      <div className="flex min-w-0 flex-col divide-y divide-[#F1EADC]/20">
        {error ? (
          <p role="status" className="px-3 py-1.5 text-[11px] font-medium text-tk-linen/85">
            {error}
          </p>
        ) : null}
        {showRecording && recording ? <RecordingPill live={recording} onError={setError} onChanged={refresh} /> : null}
        {shownPunches.map((punch) => (
          <RunningPill key={punch.id} punch={punch} onError={setError} />
        ))}
      </div>
    </div>
  )
}

function RunningPill({
  punch,
  onError,
}: {
  punch: PunchView
  onError: (message: string | null) => void
}) {
  const [busy, startTransition] = useTransition()
  const seconds = useElapsed(punch.startedAt, punch.minutes)
  const name = punch.projectName
    ? `${punch.clientName} · ${punch.projectName}`
    : punch.clientName

  return (
    <div className="flex min-w-0 items-stretch">
      <Link
        href={ROUTES.timesheetLive}
        className="flex min-w-0 items-center gap-2 py-1.5 pl-1.5 pr-2"
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-tk-linen/90 ring-4 ring-tk-linen/25"
        />
        <span className="tabular-nums">{clockLabel(seconds)}</span>
        <span className="max-w-[12rem] truncate font-medium opacity-80">{name}</span>
      </Link>
      <button
        type="button"
        disabled={busy}
        aria-label={`Clock out of ${name}`}
        title={busy ? "Stopping…" : "Clock out"}
        onClick={() => {
          onError(null)
          startTransition(async () => {
            const result = await stopPunch({ punchId: punch.id })
            if (!result.ok) onError(result.error)
            else announcePunchChange()
          })
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-r-full border-l border-tk-linen/25 py-1.5 pl-2 pr-3 hover:bg-tk-linen/15 disabled:opacity-50"
      >
        <Square className="size-3" aria-hidden />
        <span className="sr-only sm:not-sr-only">{busy ? "Stopping…" : "Out"}</span>
      </button>
    </div>
  )
}

/**
 * The recording, as one onyx pill — the tomato mark needs that ground in
 * both themes, and it tells a recording from a plain punch at a glance. Stop
 * ends the recording and clocks out the punch it owns.
 */
function RecordingPill({
  live,
  onError,
  onChanged,
}: {
  live: LiveView
  onError: (message: string | null) => void
  onChanged: () => void
}) {
  const [busy, startTransition] = useTransition()
  const seconds = useElapsed(live.status === "recording" ? live.startedAt : null)
  const name = live.title || [live.client?.name, live.project?.name].filter(Boolean).join(" · ") || "Untitled meeting"
  const starting = live.status === "requested"
  const stopping = live.status === "stopping"

  return (
    <div className="flex min-w-0 items-stretch bg-tk-onyx text-tk-linen ring-1 ring-inset ring-tk-linen/10">
      <Link href={`${ROUTES.timesheetLive}#record`} className="flex min-w-0 items-center gap-2 py-1.5 pl-1.5 pr-2">
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-full", !stopping && "animate-pulse motion-reduce:animate-none")}
          style={
            starting
              ? { backgroundColor: "rgb(228 192 122)", boxShadow: "0 0 0 4px rgb(228 192 122 / 0.22)" }
              : stopping
                ? { backgroundColor: "rgb(241 234 220 / 0.45)" }
                : { backgroundColor: REC_MARK, boxShadow: "0 0 0 4px rgb(240 138 106 / 0.22)" }
          }
        />
        {starting ? (
          <span className="font-medium opacity-90">Starting…</span>
        ) : (
          <span className="tabular-nums">{formatClock(stopping ? live.durationSec || seconds : seconds)}</span>
        )}
        <span className="max-w-[12rem] truncate font-medium opacity-90">{name}</span>
      </Link>
      <button
        type="button"
        disabled={busy || stopping}
        aria-label={starting ? "Cancel the recording" : `Stop recording ${name}`}
        title={stopping ? "Finishing…" : starting ? "Cancel" : "Stop recording"}
        onClick={() => {
          onError(null)
          startTransition(async () => {
            const result = await stopRecordingAction(live.id)
            if (!result.ok) onError(result.error)
            announcePunchChange()
            onChanged()
          })
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-r-full border-l border-tk-linen/25 py-1.5 pl-2 pr-3 hover:bg-tk-linen/15 disabled:opacity-50"
      >
        <Square className="size-3" aria-hidden />
        <span className="sr-only sm:not-sr-only">{stopping ? "Finishing…" : starting ? "Cancel" : "Stop"}</span>
      </button>
    </div>
  )
}
