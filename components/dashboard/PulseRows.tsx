"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { ChevronDown, ChevronRight, Mail, SquareCheck, Ticket, TrendingUp } from "lucide-react"
import { cn } from "@/lib/cn"
import { digestOf, isPulseRowKey, PULSE_FOLD_KEY, type Pulse, type PulseRow, type PulseRowKey, type PulseStat, type PulseTone } from "@/lib/pulse"

const ICON: Record<PulseRowKey, typeof Ticket> = { tickets: Ticket, mail: Mail, tasks: SquareCheck, pipeline: TrendingUp }
const NUMBER: Record<PulseTone, string> = { bad: "text-bad", warn: "text-warn", good: "text-good", neutral: "text-tk-onyx" }
const STATE: Record<PulseTone, string> = {
  bad: "font-semibold text-bad",
  warn: "font-semibold text-warn",
  good: "font-semibold text-good",
  neutral: "text-ink-3",
}
const ICON_BOX: Record<PulseTone, string> = {
  bad: "border-transparent bg-bad-soft text-bad",
  warn: "border-transparent bg-warn-soft text-warn",
  good: "border-transparent bg-good-soft text-good",
  neutral: "border-line bg-card text-ink-2",
}

/**
 * The four rows — tickets, mail, tasks, pipeline — each its own card: the
 * left block names it and says its state, the stats read left to right,
 * the › at the end opens its page. The left block folds the row down to a
 * one-line digest of what needs you; which rows are folded is remembered
 * per browser. Every stat is a door: a page, or the expanded list filtered
 * to that bucket (`onGroup`).
 */
export function PulseRows({ pulse, onGroup }: { pulse: Pulse; onGroup: (group: string) => void }) {
  const [folded, setFolded] = useState<Set<PulseRowKey>>(() => new Set())

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PULSE_FOLD_KEY)
      const keys = raw ? (JSON.parse(raw) as unknown) : []
      if (Array.isArray(keys)) setFolded(new Set(keys.filter(isPulseRowKey)))
    } catch {
      /* private mode: nothing folded */
    }
  }, [])

  function toggle(key: PulseRowKey) {
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      try {
        window.localStorage.setItem(PULSE_FOLD_KEY, JSON.stringify(Array.from(next)))
      } catch {
        /* noop */
      }
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {pulse.rows.map((row) => (
        <Row key={row.key} row={row} folded={folded.has(row.key)} onToggle={() => toggle(row.key)} onGroup={onGroup} />
      ))}
    </div>
  )
}

function Row({ row, folded, onToggle, onGroup }: { row: PulseRow; folded: boolean; onToggle: () => void; onGroup: (group: string) => void }) {
  const Icon = ICON[row.key]
  const digest = digestOf(row)
  return (
    <div
      data-pulse-row={row.key}
      data-folded={folded ? "true" : "false"}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_34px] overflow-hidden rounded-[14px] border border-line bg-card shadow-card sm:grid-cols-[168px_minmax(0,1fr)_34px]",
        folded ? "sm:min-h-[58px]" : "sm:min-h-[92px]"
      )}
    >
      <button
        type="button"
        aria-expanded={!folded}
        onClick={onToggle}
        data-track="home.pulse.fold"
        data-track-value={row.key}
        className="flex min-w-0 items-center gap-2.5 border-b border-line bg-well px-3.5 py-3.5 text-left transition-colors hover:bg-card sm:border-b-0 sm:border-r"
      >
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-[10px] border", ICON_BOX[row.tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-ui text-[13.5px] font-bold tracking-[-0.01em] text-tk-onyx">
            {row.name}
            <ChevronDown className={cn("size-2.5 shrink-0 text-ink-3 transition-transform", folded && "-rotate-90")} aria-hidden />
          </span>
          <span className={cn("mt-0.5 block truncate text-[11.5px] leading-[1.3]", STATE[row.tone])}>{row.state}</span>
        </span>
      </button>

      <Link
        href={row.href}
        aria-label={`Open ${row.name}`}
        data-track="home.pulse.open"
        data-track-value={row.key}
        className="col-start-2 row-start-1 grid place-items-center border-b border-l border-line text-ink-3 transition-colors hover:bg-well hover:text-accent-ink sm:col-start-3 sm:border-b-0"
      >
        <ChevronRight className="size-4" aria-hidden />
      </Link>

      {folded ? (
        <div className="col-span-2 flex min-w-0 items-center gap-1.5 truncate px-4 py-2.5 text-[12.5px] text-ink-3 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:py-0">
          {digest.length === 0 ? (
            <span className="text-good">nothing needs you</span>
          ) : (
            digest.map((d, i) => (
              <span key={d.text} className="flex items-center gap-1.5">
                {i > 0 ? <span className="text-line-strong">·</span> : null}
                <b className={cn("font-semibold", NUMBER[d.tone])}>{d.text}</b>
              </span>
            ))
          )}
        </div>
      ) : (
        <div className="col-span-2 grid grid-cols-2 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:auto-cols-[minmax(0,1fr)] sm:grid-flow-col sm:grid-cols-none">
          {row.stats.map((stat, i) => (
            <Stat key={stat.key} stat={stat} row={row.key} index={i} onGroup={onGroup} />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ stat, row, index, onGroup }: { stat: PulseStat; row: PulseRowKey; index: number; onGroup: (group: string) => void }) {
  const zero = stat.n === 0
  const cls = cn(
    "flex min-w-0 items-center gap-2.5 border-line px-3 py-4 text-left transition-colors hover:bg-well",
    // two per line on a phone, one line from sm up
    index % 2 === 1 && "border-l",
    index >= 2 && "border-t",
    "sm:border-t-0",
    index > 0 ? "sm:border-l" : "sm:border-l-0"
  )
  const body = (
    <>
      <span className={cn("min-w-[30px] font-display text-[26px] font-semibold leading-none tracking-[-0.02em] tabular-nums", zero ? "text-ink-3 opacity-45" : NUMBER[stat.tone])}>
        {stat.n}
      </span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className={cn("truncate text-[12.5px] font-medium leading-[1.2]", zero ? "text-ink-3" : "text-tk-onyx")}>{stat.label}</span>
        {stat.hint ? <span className={cn("truncate text-[11px] leading-[1.25] text-ink-3", zero && "opacity-70")}>{stat.hint}</span> : null}
      </span>
    </>
  )
  const track = { "data-track": "home.pulse.stat", "data-track-value": `${row}.${stat.key}` }
  if (stat.group) {
    const group = stat.group
    return (
      <button type="button" onClick={() => onGroup(group)} className={cls} {...track}>
        {body}
      </button>
    )
  }
  return (
    <Link href={stat.href ?? "#"} className={cls} {...track}>
      {body}
    </Link>
  )
}
