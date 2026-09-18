"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { liveRecordingNow } from "@/lib/meeting-note-actions"
import type { LiveView } from "@/lib/meeting-notes"
import { runningNow } from "@/lib/punch-actions"
import { onPunchChange } from "@/lib/punch-signal"
import type { PunchView } from "@/lib/punches"

/**
 * The one poll behind every "what's running right now" surface — the
 * floating clock pill AND the Time hub panel's clock card. Both used to
 * mean two `setInterval`s hitting the server for the same two reads; this
 * is that read, lifted out of FloatingClock so a second consumer is a
 * second `useContext`, not a second poll. Mounted once in the admin layout,
 * seeded with the layout's own server read so the first paint costs nothing
 * extra — see crm-nav-dock-panel memory note.
 */

const POLL_MS = 30_000
/** A recording changes state in seconds — starting, stopping — so the poll runs faster while one is live. */
const LIVE_POLL_MS = 5_000

type RunningClockState = {
  running: PunchView[]
  recording: LiveView | null
  refresh: () => Promise<void>
}

const RunningClockContext = createContext<RunningClockState | null>(null)

export function RunningClockProvider({
  initial,
  initialRecording = null,
  children,
}: {
  initial: PunchView[]
  initialRecording?: LiveView | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [running, setRunning] = useState(initial)
  const [recording, setRecording] = useState<LiveView | null>(initialRecording)

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

  return (
    <RunningClockContext.Provider value={{ running, recording, refresh }}>
      {children}
    </RunningClockContext.Provider>
  )
}

export function useRunningClock(): RunningClockState {
  const ctx = useContext(RunningClockContext)
  if (!ctx) {
    throw new Error("useRunningClock must be used inside RunningClockProvider")
  }
  return ctx
}
