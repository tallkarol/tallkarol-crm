"use client"

import { useEffect, useState } from "react"

/**
 * Seconds since a punch started, ticking once a second. The first render uses
 * the value the server already computed, so nothing mismatches on hydration.
 */
export function useElapsed(startedAt: string | null, fallbackMinutes = 0) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    if (!startedAt) return
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [startedAt])

  if (!startedAt) return 0
  if (now == null) return fallbackMinutes * 60
  const started = new Date(startedAt).getTime()
  return Math.max(0, Math.floor((now - started) / 1000))
}

export function clockLabel(totalSeconds: number, withSeconds = true) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, "0")
  return withSeconds
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${hours}:${pad(minutes)}`
}
