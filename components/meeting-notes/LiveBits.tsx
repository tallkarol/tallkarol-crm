"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Square } from "lucide-react"
import { useElapsed } from "@/components/timesheet/useElapsed"
import { formatClock } from "@/lib/meeting-note"
import { stopRecordingAction } from "@/lib/meeting-note-actions"
import { announcePunchChange } from "@/lib/punch-signal"

/** A recording's clock, ticking. mm:ss — a meeting is minutes, not hours. */
export function LiveDuration({ startedAt, className }: { startedAt: string | null; className?: string }) {
  const seconds = useElapsed(startedAt)
  return <span className={className}>{formatClock(seconds)}</span>
}

export function StopButton({ noteId, label = "Stop" }: { noteId: string; label?: string }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const result = await stopRecordingAction(noteId)
          if (result.ok) {
            announcePunchChange()
            router.refresh()
          }
        })
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 py-1 text-[11.5px] font-semibold text-tk-onyx hover:border-line-strong disabled:opacity-60"
    >
      <Square className="size-3" aria-hidden />
      {busy ? "Stopping…" : label}
    </button>
  )
}
