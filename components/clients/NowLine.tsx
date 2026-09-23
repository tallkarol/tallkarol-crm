"use client"

import { useEffect, useState } from "react"
import { DAY_START_HOUR, HOUR_PX } from "@/lib/client-calendar"

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function localIsoDay(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * The red line for "now" in the hour grid. The server has no idea which
 * timezone the tab is actually sitting in, so this renders nothing until it
 * mounts, then hides itself outright when today isn't one of the seven days
 * on screen — a past or future week has no "now" to mark.
 */
export function NowLine({ days }: { days: { iso: string }[] }) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  if (!now) return null
  if (!days.some((d) => d.iso === localIsoDay(now))) return null

  const top = (now.getHours() + now.getMinutes() / 60 - DAY_START_HOUR) * HOUR_PX

  return (
    <div aria-hidden className="pointer-events-none absolute left-11 right-0 z-10 border-t-2 border-bad" style={{ top }}>
      <span className="absolute -left-1 -top-[5px] block size-2 rounded-full bg-bad" />
    </div>
  )
}
