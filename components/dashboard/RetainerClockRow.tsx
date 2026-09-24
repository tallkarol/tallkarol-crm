"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Play, Square } from "lucide-react"
import { useRunningClock } from "@/components/timesheet/RunningClockProvider"
import { clockLabel, useElapsed } from "@/components/timesheet/useElapsed"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { startPunch, stopPunch } from "@/lib/punch-actions"
import { announcePunchChange } from "@/lib/punch-signal"
import type { PunchView } from "@/lib/punches"

export type RetainerShortcut = {
  id: string
  name: string
  clientId: string
  clientName: string
  clientSlug: string
  hoursPerMonth: number
}

/**
 * One button per active retainer: tap to clock in on that client, tap again
 * to clock out. Side by side at equal widths, or stacked full-width when the
 * column is narrow. Starting one switches
 * whatever else is running, the way the client panel's clock card does, so
 * the row is a set of "I am on this now" switches rather than a second
 * timer. The running clock context is the source of truth; the floating
 * pill and the header's clock catch up through the same announce + refresh.
 */
export function RetainerClockRow({
  retainers,
  stacked = false,
}: {
  retainers: RetainerShortcut[]
  /** One button per line instead of a row of equal widths. */
  stacked?: boolean
}) {
  const router = useRouter()
  const { running } = useRunningClock()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  if (retainers.length === 0) return null

  function toggle(retainer: RetainerShortcut, punch: PunchView | null) {
    setError(null)
    start(async () => {
      const result = punch
        ? await stopPunch({ punchId: punch.id })
        : await startPunch({ clientId: retainer.clientId, switchRunning: true })
      if (!result.ok) {
        setError(result.error)
        return
      }
      announcePunchChange()
      router.refresh()
    })
  }

  return (
    <div>
      <div
        className={cn("grid gap-2", stacked ? "grid-cols-1" : "auto-cols-fr grid-flow-col")}
        role="group"
        aria-label="Clock in to a retainer"
      >
        {retainers.map((retainer) => {
          const punch = running.find((p) => p.clientId === retainer.clientId) ?? null
          return (
            <ShortcutButton
              key={retainer.id}
              retainer={retainer}
              punch={punch}
              busy={busy}
              onClick={() => toggle(retainer, punch)}
            />
          )
        })}
      </div>
      {error ? (
        <p role="status" className="mt-1.5 text-xs font-medium text-bad">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function ShortcutButton({
  retainer,
  punch,
  busy,
  onClick,
}: {
  retainer: RetainerShortcut
  punch: PunchView | null
  busy: boolean
  onClick: () => void
}) {
  const seconds = useElapsed(punch?.startedAt ?? null, punch?.minutes ?? 0)
  const on = punch !== null

  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? `Clock out of ${retainer.clientName}` : `Clock in on ${retainer.clientName}`}
      onClick={onClick}
      style={{ "--c": clientColor(retainer.clientSlug) } as React.CSSProperties}
      className={cn(
        "tk-client-edge flex min-w-0 items-center gap-2.5 rounded-xl border border-line border-l-[3px] px-3 py-2.5 text-left font-ui shadow-card",
        "transition-[transform,box-shadow,border-color,color,background-color] duration-150 hover:-translate-y-px hover:border-line-strong",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0 disabled:opacity-60 disabled:hover:translate-y-0",
        on ? "tk-client-tint" : "bg-card"
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-tk-onyx">{retainer.clientName}</span>
        <span className={cn("block truncate text-[11px] tabular-nums", on ? "tk-client-ink font-semibold" : "text-ink-3")}>
          {on ? `${clockLabel(seconds)} · running` : `Clock in · ${retainer.hoursPerMonth} hr/mo`}
        </span>
      </span>
      <span
        aria-hidden
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg",
          on ? "bg-tk-onyx/10 text-tk-onyx" : "bg-accent text-tk-linen"
        )}
      >
        {on ? <Square className="size-3" /> : <Play className="size-3" />}
      </span>
    </button>
  )
}
