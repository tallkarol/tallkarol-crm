"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { ClockPopover, type ClockClient } from "@/components/dashboard/ClockPopover"
import { NewPopover, type NewClient } from "@/components/dashboard/NewPopover"
import { RecordPopover } from "@/components/dashboard/RecordPopover"
import { ToolButton } from "@/components/dashboard/ToolButton"
import { openPalette } from "@/components/nav/CommandPalette"
import type { PunchView } from "@/lib/punches"

/**
 * The homepage header: date and a live clock, the greeting, and the tools
 * as icon buttons on the greeting's own line — search, clock, record, new.
 * Search opens the app-wide ⌘K palette the shell mounts; it is only a button here.
 * One row, never wrapping, so nothing below moves. (The status pills that
 * used to sit under the greeting left on 24 Sep 2026; the cards say the
 * same facts where they are acted on. The left-off board button left the
 * same day — Karol will redo that feature later.)
 */
export function HomeHeader({
  greeting,
  clients,
  running,
}: {
  greeting: string
  clients: (ClockClient & NewClient)[]
  running: PunchView[]
}) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const timer = window.setInterval(tick, 15_000)
    return () => window.clearInterval(timer)
  }, [])

  const date = (now ?? new Date()).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  return (
    /* z-10 so the popovers under the toolbar paint above the cards, whose
       entrance animation would otherwise promote them over the header.
       mb-14: Karol wants 50px+ of air before the focus row; the margin
       collapses with the grid's mt-6 when there is no focus row, so it is
       56px either way. */
    <div className="tk-rise relative z-10 mb-14 flex items-end justify-between gap-x-4" style={{ "--i": 0 } as React.CSSProperties}>
      <div className="min-w-0 flex-1">
        <p className="font-ui text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">
          {date}
          {now ? (
            <>
              <span aria-hidden> · </span>
              <span className="tabular-nums">
                {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            </>
          ) : null}
        </p>
        <h1 className="mt-1.5 truncate font-display text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-tk-onyx">
          {greeting}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ToolButton label="Search or jump to… (⌘K)" icon={<Search />} onClick={openPalette} track="home.palette" />
        <ClockPopover clients={clients} running={running} />
        <RecordPopover clients={clients} />
        <NewPopover clients={clients} />
      </div>
    </div>
  )
}
