"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Play, Square } from "lucide-react"
import { clockLabel, useElapsed } from "@/components/timesheet/useElapsed"
import { ROUTES } from "@/lib/nav"
import { stopPunch } from "@/lib/punch-actions"
import type { PunchView } from "@/lib/punches"

/**
 * The running clocks, pinned in the page header of every timesheet view — so
 * stopping never costs a navigation. One pill per open punch.
 */
export function LiveIndicator({ running }: { running: PunchView[] }) {
  const [error, setError] = useState<string | null>(null)

  if (running.length === 0) {
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
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error ? (
        <span className="text-xs font-semibold text-tk-slate/70" role="status">
          {error}
        </span>
      ) : null}
      {running.map((punch) => (
        <RunningPill key={punch.id} punch={punch} onError={setError} />
      ))}
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
    <span className="inline-flex items-center overflow-hidden rounded-full bg-tk-teal text-xs font-semibold text-tk-linen">
      <Link
        href={ROUTES.timesheetLive}
        className="inline-flex items-center gap-2 py-1.5 pl-3 pr-2"
      >
        <span
          aria-hidden
          className="size-2 rounded-full bg-tk-linen/90 ring-4 ring-tk-linen/25"
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
          })
        }}
        className="inline-flex items-center gap-1 border-l border-tk-linen/25 py-1.5 pl-2 pr-3 hover:bg-tk-linen/15 disabled:opacity-50"
      >
        <Square className="size-3" />
        <span className="sr-only sm:not-sr-only">{busy ? "Stopping…" : "Out"}</span>
      </button>
    </span>
  )
}
