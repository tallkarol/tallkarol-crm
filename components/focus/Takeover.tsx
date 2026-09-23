"use client"

import { useEffect } from "react"
import { Minimize2, Play, Timer } from "lucide-react"
import { useRunningClock } from "@/components/timesheet/RunningClockProvider"
import { clockLabel, useElapsed } from "@/components/timesheet/useElapsed"
import { cn } from "@/lib/cn"
import { clientColor, markColor } from "@/lib/client-colors"
import { FOCUS_MAX, type FocusCard, type FocusMode } from "@/lib/focus"
import { FocusTray, ModeSwitch } from "@/components/focus/FocusTray"
import type { NoteOps } from "@/components/focus/FocusNote"

/**
 * The takeover: only the cards, larger, on a plain canvas over everything —
 * dock, panel, header, queue, board. A fixed overlay rather than a route, so
 * the Board's drag context and state stay mounted underneath; Esc or the
 * button brings it all back.
 */
export function Takeover({
  client,
  showing,
  queueCount,
  mode,
  ops,
  onMode,
  onPromote,
  onClose,
}: {
  client: { id: string; slug: string; name: string; short: string }
  showing: FocusCard[]
  queueCount: number
  mode: FocusMode
  ops: NoteOps
  onMode: (mode: FocusMode) => void
  onPromote: (id: string) => void
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const color = clientColor(client.slug)
  return (
    <div
      role="dialog"
      aria-label={`Focus · ${client.name}`}
      className="fixed inset-0 z-[70] flex flex-col bg-canvas"
      style={{ backgroundImage: "radial-gradient(120% 90% at 50% 0%, var(--accent-soft), transparent 60%)" }}
    >
      <div className="flex items-center gap-2.5 border-b border-line px-5 py-3">
        <span
          className="grid size-7 place-items-center rounded-lg font-ui text-[10px] font-extrabold text-white"
          style={{ backgroundColor: markColor(color) }}
        >
          {client.short}
        </span>
        <span className="font-display text-[15px] font-bold tracking-[-0.01em] text-tk-onyx">{client.name}</span>
        <span className="text-xs text-ink-3">
          {showing.length} of {FOCUS_MAX[mode]} in focus · {queueCount} queued behind
        </span>
        <span className="flex-1" />
        <ClockChip clientId={client.id} />
        <ModeSwitch mode={mode} onMode={onMode} />
        <button
          type="button"
          onClick={onClose}
          title="Back to the board · Esc"
          aria-label="Back to the board"
          className="grid size-[30px] place-items-center rounded-lg text-ink-3 hover:bg-well hover:text-tk-onyx"
        >
          <Minimize2 className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 py-7 sm:px-10">
        <div className={cn("w-full", mode === "one" ? "max-w-[940px]" : "max-w-[1180px]")}>
          <FocusTray showing={showing} queue={[]} mode={mode} ops={ops} onMode={onMode} onPromote={onPromote} compact />
        </div>
      </div>

      <p className="px-5 pb-3.5 pt-2 text-center font-ui text-[11px] font-medium text-ink-3">
        <kbd className="rounded border border-line bg-card px-1 font-ui text-[10px] font-semibold">Esc</kbd> back ·{" "}
        <kbd className="rounded border border-line bg-card px-1 font-ui text-[10px] font-semibold">1</kbd> one ·{" "}
        <kbd className="rounded border border-line bg-card px-1 font-ui text-[10px] font-semibold">3</kbd> three · ✓ done pulls the next from the queue
      </p>
    </div>
  )
}

function ClockChip({ clientId }: { clientId: string }) {
  const { running } = useRunningClock()
  const punch = running.find((p) => p.clientId === clientId) ?? running[0]
  const seconds = useElapsed(punch ? punch.startedAt : null, punch?.minutes ?? 0)
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-ui text-[11.5px] font-semibold tabular-nums",
        punch ? "border-transparent bg-accent-soft text-accent-ink" : "border-line bg-card text-ink-3"
      )}
    >
      {punch ? <Timer className="size-3" aria-hidden /> : <Play className="size-3" aria-hidden />}
      {punch ? clockLabel(seconds) : "not on the clock"}
    </span>
  )
}
