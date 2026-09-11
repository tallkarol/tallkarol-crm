import { Check } from "lucide-react"
import { cn } from "@/lib/cn"
import { formatClock, formatTimeLabel, phaseSteps } from "@/lib/meeting-note"
import type { NoteDetail } from "@/lib/meeting-notes"

/**
 * Recorded → transcribed → notes → review → filed, with what each step knows.
 * The order is real, so the numbering is the content.
 */
export function PhaseLine({ note }: { note: NoteDetail }) {
  const tz = note.timeZone || "UTC"
  const steps = phaseSteps(note)
  const stamps: Record<string, string> = {
    recorded:
      note.status === "requested"
        ? "waiting for the recorder"
        : note.status === "recording"
          ? `since ${formatTimeLabel(note.startedAt, tz)}`
          : [note.endedAt ? formatTimeLabel(note.endedAt, tz) : "", note.durationSec ? formatClock(note.durationSec) : ""].filter(Boolean).join(" · ") || "—",
    transcribed:
      note.transcriptStatus === "done"
        ? [note.transcriptModel, note.tracks.length ? `${note.tracks.length} ${note.tracks.length === 1 ? "track" : "tracks"}` : ""].filter(Boolean).join(" · ") || "done"
        : note.transcriptStatus === "failed"
          ? "failed"
          : note.transcriptStatus === "running"
            ? "running on the Mac"
            : note.transcriptStatus === "queued"
              ? "queued"
              : "—",
    notes:
      note.analysisStatus === "done"
        ? note.analysisModel || "done"
        : note.analysisStatus === "failed"
          ? "failed"
          : note.analysisStatus === "running"
            ? "writing"
            : "—",
    review: note.status === "review" ? `${note.items.proposed} ${note.items.proposed === 1 ? "proposal" : "proposals"}` : note.status === "filed" ? "done" : "—",
    filed: note.filedAt ? formatTimeLabel(note.filedAt, tz) : "—",
  }
  return (
    <ol className="mt-5 grid grid-cols-5 gap-0" aria-label="Where this note is">
      {steps.map((step, index) => (
        <li key={step.key} className="relative flex flex-col gap-1.5 pr-3">
          {index < steps.length - 1 ? (
            <span
              aria-hidden
              className={cn("absolute left-[18px] right-1.5 top-[9px] h-0.5 rounded", step.state === "done" ? "bg-accent-mark" : "bg-line")}
            />
          ) : null}
          <span
            className={cn(
              "relative z-[1] grid size-5 place-items-center rounded-full border-2",
              step.state === "done" && "border-accent-mark bg-accent-mark text-tk-linen",
              step.state === "now" && "border-tk-teal bg-card ring-4 ring-accent-soft",
              step.state === "failed" && "border-bad bg-bad-soft",
              step.state === "todo" && "border-line-strong bg-card"
            )}
          >
            {step.state === "done" ? <Check className="size-3" aria-hidden /> : null}
            {step.state === "now" ? <span aria-hidden className="size-2 rounded-full bg-tk-teal" /> : null}
            {step.state === "failed" ? <span aria-hidden className="size-2 rounded-full bg-bad" /> : null}
          </span>
          <span className={cn("text-[11.5px] font-bold", step.state === "todo" ? "text-ink-3" : "text-tk-onyx")}>{step.label}</span>
          <span className="truncate font-mono text-[10.5px] tabular-nums text-ink-3">{stamps[step.key]}</span>
        </li>
      ))}
    </ol>
  )
}
