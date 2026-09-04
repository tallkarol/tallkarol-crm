"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Calendar, Layers } from "lucide-react"
import { ClockPopover, type ClockClient } from "@/components/dashboard/ClockPopover"
import { CommandPalette, type PaletteEntry } from "@/components/dashboard/CommandPalette"
import { LEFTOFF_OPEN_EVENT } from "@/components/dashboard/LeftOffBoard"
import { NewPopover, type NewClient } from "@/components/dashboard/NewPopover"
import { ToolButton } from "@/components/dashboard/ToolButton"
import { cn } from "@/lib/cn"
import type { PunchView } from "@/lib/punches"

export type PillTone = "bad" | "warn" | "ok" | "neutral"

/** One status pill under the greeting. `board` opens the left-off board. */
export type StatusPill = {
  label: string
  tone: PillTone
  href?: string
  board?: boolean
  icon?: "calendar"
}

const PILL: Record<PillTone, string> = {
  bad: "bg-bad/10 text-bad",
  warn: "bg-warn/10 text-warn",
  ok: "bg-ok/10 text-ok",
  neutral: "border border-line bg-card text-tk-slate",
}

function openBoard() {
  window.dispatchEvent(new CustomEvent(LEFTOFF_OPEN_EVENT))
}

/**
 * The homepage header: date and a live clock, the greeting, a status line
 * built from the same loaders as the cards, and the four tools as icon
 * buttons — search, clock, the left-off board, new.
 */
export function HomeHeader({
  greeting,
  pills,
  leftOff,
  clients,
  running,
  palette,
}: {
  greeting: string
  pills: StatusPill[]
  /** Null until the left-off tables exist. */
  leftOff: { blocked: number; working: number; parked: number; done: number } | null
  clients: (ClockClient & NewClient)[]
  running: PunchView[]
  palette: PaletteEntry[]
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
       entrance animation would otherwise promote them over the header. */
    <div className="tk-rise relative z-10 flex flex-wrap items-end justify-between gap-x-6 gap-y-4" style={{ "--i": 0 } as React.CSSProperties}>
      <div className="min-w-0">
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
        <h1 className="mt-1.5 font-display text-[30px] font-semibold leading-[1.05] tracking-[-0.03em] text-tk-onyx">
          {greeting}
        </h1>
        {pills.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pills.map((pill) => {
              const body = (
                <>
                  {pill.icon === "calendar" ? (
                    <Calendar className="size-3" aria-hidden />
                  ) : (
                    <span aria-hidden className="size-1.5 rounded-full bg-current" />
                  )}
                  {pill.label}
                </>
              )
              const className = cn(
                "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-ui text-[11.5px] font-semibold transition-[filter] hover:brightness-95",
                PILL[pill.tone]
              )
              if (pill.board) {
                return (
                  <button key={pill.label} type="button" onClick={openBoard} className={className}>
                    {body}
                  </button>
                )
              }
              if (pill.href) {
                return (
                  <Link key={pill.label} href={pill.href} className={className}>
                    {body}
                  </Link>
                )
              }
              return (
                <span key={pill.label} className={className}>
                  {body}
                </span>
              )
            })}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <CommandPalette entries={palette} />
        <ClockPopover clients={clients} running={running} />
        {leftOff ? (
          <ToolButton
            label={`Where I left off — ${leftOff.blocked} need a yes, ${leftOff.working} working, ${leftOff.parked} parked, ${leftOff.done} done today`}
            icon={<Layers />}
            badge={leftOff.blocked}
            dot={leftOff.blocked === 0 && leftOff.working > 0}
            onClick={openBoard}
          />
        ) : null}
        <NewPopover clients={clients} />
      </div>
    </div>
  )
}
