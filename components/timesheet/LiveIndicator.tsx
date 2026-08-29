"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Play, Square } from "lucide-react"
import { clockLabel, useElapsed } from "@/components/timesheet/useElapsed"
import { ROUTES } from "@/lib/nav"
import { stopPunch } from "@/lib/punch-actions"
import type { PunchView } from "@/lib/punches"

/**
 * The running clock, pinned in the page header of every timesheet view — so
 * stopping never costs a navigation.
 */
export function LiveIndicator({ running }: { running: PunchView | null }) {
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const seconds = useElapsed(running?.startedAt ?? null, running?.minutes ?? 0)

  if (!running) {
    return (
      <Link
        href={ROUTES.timesheetLive}
        className="inline-flex items-center gap-1.5 rounded-full border border-tk-slate/20 bg-white px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
      >
        <Play className="size-3.5" />
        Clock in
      </Link>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {error ? (
        <span className="text-xs font-semibold text-tk-slate/70" role="status">
          {error}
        </span>
      ) : null}
      <Link
        href={ROUTES.timesheetLive}
        className="inline-flex items-center gap-2 rounded-full bg-tk-teal px-3 py-1.5 text-xs font-semibold text-tk-linen"
      >
        <span
          aria-hidden
          className="size-2 rounded-full bg-tk-linen/90 ring-4 ring-tk-linen/25"
        />
        <span className="tabular-nums">{clockLabel(seconds)}</span>
        <span className="max-w-[12rem] truncate font-medium opacity-80">
          {running.projectName
            ? `${running.clientName} · ${running.projectName}`
            : running.clientName}
        </span>
      </Link>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await stopPunch()
            if (!result.ok) setError(result.error)
          })
        }}
        className="inline-flex items-center gap-1.5 rounded-full border border-tk-slate/20 bg-white px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal disabled:opacity-50"
      >
        <Square className="size-3" />
        {busy ? "Stopping…" : "Clock out"}
      </button>
    </div>
  )
}
