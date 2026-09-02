"use client"

import { useMemo, useState, useTransition } from "react"
import { Play, Square } from "lucide-react"
import { clockLabel, useElapsed } from "@/components/timesheet/useElapsed"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { startPunch, stopPunch } from "@/lib/punch-actions"
import type { PunchTarget, PunchView } from "@/lib/punches"

/**
 * Clock in and out. Big targets, one tap each — this is the screen that gets
 * used on a phone, so nothing here needs a keyboard.
 */
export function ClockPanel({
  running,
  targets,
  today,
  compact = false,
}: {
  running: PunchView | null
  targets: PunchTarget[]
  today: { hours: number; entries: number }
  compact?: boolean
}) {
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const [note, setNote] = useState("")
  const seconds = useElapsed(running?.startedAt ?? null, running?.minutes ?? 0)

  const shown = useMemo(
    () => (compact ? targets.slice(0, 6) : targets),
    [compact, targets]
  )

  function targetKey(target: PunchTarget) {
    return `${target.clientId}:${target.projectId ?? ""}`
  }

  function begin(target: PunchTarget) {
    setError(null)
    setPendingKey(targetKey(target))
    startTransition(async () => {
      const result = await startPunch({
        clientId: target.clientId,
        projectId: target.projectId,
        note,
        // A second tap while something runs means "switch to this".
        switchRunning: Boolean(running),
      })
      setPendingKey(null)
      if (!result.ok) setError(result.error)
      else setNote("")
    })
  }

  function end() {
    setError(null)
    startTransition(async () => {
      const result = await stopPunch({ note })
      if (!result.ok) setError(result.error)
      else setNote("")
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {running ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl bg-tk-teal px-5 py-4 text-tk-linen shadow-sm">
          <span
            aria-hidden
            className="size-2.5 rounded-full bg-tk-linen ring-4 ring-tk-linen/25"
          />
          <p className="font-mono text-3xl font-bold tabular-nums tracking-tight">
            {clockLabel(seconds)}
          </p>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {running.projectName
                ? `${running.clientName} · ${running.projectName}`
                : running.clientName}
            </p>
            <p className="mt-0.5 text-xs text-tk-linen/75">
              Started {running.startClock} · {sourceLabel(running.source)}
              {running.flags.includes("stale") ? " · running since yesterday" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={end}
            disabled={busy}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-tk-linen px-4 py-2 text-xs font-bold text-tk-teal disabled:opacity-60"
          >
            <Square className="size-3.5" />
            {busy ? "Stopping…" : "Clock out"}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-dashed border-tk-slate/25 bg-white px-5 py-4">
          <p className="text-sm font-semibold text-tk-onyx">Not clocked in</p>
          <p className="text-sm text-tk-slate/60">
            {today.hours > 0
              ? `${today.hours} hr approved today across ${today.entries} ${today.entries === 1 ? "entry" : "entries"}.`
              : "Nothing logged today yet."}
          </p>
        </div>
      )}

      {error ? (
        <p
          role="status"
          className="rounded-xl border border-tk-slate/15 bg-white px-4 py-2.5 text-sm text-tk-slate"
        >
          {error}
        </p>
      ) : null}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
            {running ? "Switch to" : "Clock in on"}
          </p>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What are you working on? (optional)"
            aria-label="Session note"
            className="w-full max-w-sm rounded-lg border border-tk-slate/20 bg-white px-3 py-1.5 text-sm text-tk-onyx outline-none placeholder:text-tk-slate/35 focus:border-tk-teal"
          />
        </div>

        {shown.length === 0 ? (
          <p className="mt-3 text-sm text-tk-slate/60">
            No active retainers or open projects yet. Add one and it shows up here.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((target) => {
              const key = targetKey(target)
              const isCurrent =
                running != null &&
                running.clientId === target.clientId &&
                (running.projectId ?? "") === (target.projectId ?? "")
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => begin(target)}
                    disabled={busy || isCurrent}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl border px-4 py-3 text-left transition-colors",
                      isCurrent
                        ? "border-tk-teal/40 bg-tk-teal/5"
                        : "border-tk-slate/15 bg-white hover:border-tk-teal/50",
                      busy && "opacity-60"
                    )}
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: clientColor(target.clientSlug) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-tk-onyx">
                        {target.clientName}
                      </span>
                      <span className="block truncate text-xs text-tk-slate/60">
                        {target.projectName ?? "Retainer · maintenance"}
                      </span>
                    </span>
                    {isCurrent ? (
                      <span className="text-[10px] font-bold uppercase tracking-wide text-tk-teal">
                        Running
                      </span>
                    ) : (
                      <Play className="size-3.5 shrink-0 text-tk-slate/30" />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export function sourceLabel(source: string) {
  if (source === "watch") return "Watch"
  if (source === "web") return "Browser"
  if (source === "api") return "API"
  if (source === "meeting") return "Calendar"
  if (source === "agent") return "Agent"
  if (source === "clock") return "Clock"
  return "Manual"
}
