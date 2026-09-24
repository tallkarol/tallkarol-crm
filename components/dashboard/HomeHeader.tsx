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
 * On a phone (24 Sep 2026) only search stays on that line; clock, record
 * and new become a row of three labelled buttons under the greeting.
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
  // The phone's one line: "Thursday, Sep 24" — the year and the long month wrapped it.
  const shortDate = (now ?? new Date()).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })

  return (
    /* z-10 so the popovers under the toolbar paint above the cards, whose
       entrance animation would otherwise promote them over the header.
       mb-14: Karol wants 50px+ of air before the focus row; the margin
       collapses with the grid's mt-6 when there is no focus row, so it is
       56px either way. */
    <div className="tk-rise relative z-10 mb-6 rail:mb-14" style={{ "--i": 0 } as React.CSSProperties}>
      <div className="flex items-end justify-between gap-x-4">
      <div className="min-w-0 flex-1">
        <p className="font-ui text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">
          <span className="rail:hidden">{shortDate}</span>
          <span className="hidden rail:inline">{date}</span>
          {now ? (
            <>
              <span aria-hidden> · </span>
              <span className="tabular-nums">
                {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </span>
            </>
          ) : null}
        </p>
        <h1 className="mt-1.5 font-display text-[28px] font-semibold leading-[1.05] tracking-[-0.03em] text-tk-onyx rail:truncate rail:text-[30px]">
          {greeting}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ToolButton label="Search or jump to… (⌘K)" icon={<Search />} onClick={openPalette} track="home.palette" />
        <span className="hidden rail:contents">
          <ClockPopover clients={clients} running={running} />
          <RecordPopover clients={clients} />
          <NewPopover clients={clients} />
        </span>
      </div>
      </div>
      {/* The phone's verbs. `relative` so a wide button's popover spans this row. */}
      <div className="relative mt-4 grid grid-cols-[1.3fr_1fr_1fr] gap-2.5 rail:hidden">
        <ClockPopover clients={clients} running={running} wide />
        <RecordPopover clients={clients} wide />
        <NewPopover clients={clients} wide />
      </div>
    </div>
  )
}
