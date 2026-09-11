import Link from "next/link"
import { StatusPill } from "@/components/clients/StatusPill"
import { LiveDuration, StopButton } from "@/components/meeting-notes/LiveBits"
import { pillTone } from "@/components/meeting-notes/phase"
import { clientColor, markColor } from "@/lib/client-colors"
import { BANDS, formatClock, formatDayLabel, formatTimeLabel, phaseTone } from "@/lib/meeting-note"
import type { NoteRow } from "@/lib/meeting-notes"
import { ROUTES } from "@/lib/nav"

/** Banded by what needs Karol, drawn only when a band has rows — the punch-list idiom. */
export function NoteList({ notes }: { notes: NoteRow[] }) {
  return (
    <div className="mt-6 space-y-7">
      {BANDS.map((band) => {
        const rows = notes.filter((n) => n.band === band.key)
        if (!rows.length) return null
        return (
          <section key={band.key}>
            <div className="flex items-baseline justify-between px-1 pb-2">
              <h2 className="text-[12.5px] font-bold text-tk-onyx">{band.title}</h2>
              <span className="font-mono text-[11px] tabular-nums text-ink-3">{rows.length}</span>
            </div>
            <ul className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
              {rows.map((note) => (
                <NoteRowView key={note.id} note={note} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function itemsLine(note: NoteRow): { head: string; sub: string } {
  const c = note.items
  if (note.status === "recording" || note.status === "requested" || note.status === "stopping") {
    return { head: "—", sub: "notes come after Stop" }
  }
  if (note.status === "recorded") return { head: "—", sub: note.transcriptStatus === "done" ? "writing notes" : "transcribing" }
  const total = c.proposed + c.accepted
  if (!total && !c.dismissed) return { head: "No items", sub: "" }
  const parts = [c.tasks ? `${c.tasks} ${c.tasks === 1 ? "task" : "tasks"}` : "", c.events ? `${c.events} ${c.events === 1 ? "event" : "events"}` : "", c.dismissed ? `${c.dismissed} dismissed` : ""].filter(Boolean)
  const head =
    note.status === "filed"
      ? `${c.accepted} filed`
      : `${c.proposed} ${c.proposed === 1 ? "proposal" : "proposals"}`
  return { head, sub: parts.join(" · ") }
}

function NoteRowView({ note }: { note: NoteRow }) {
  const live = note.status === "recording"
  const tz = note.timeZone || "UTC"
  const items = itemsLine(note)
  const meta = [
    note.client?.name ?? "No client",
    note.project?.name,
    live ? `recording since ${formatTimeLabel(note.startedAt, tz)}` : note.source === "import" ? "imported" : note.source === "paste" ? "pasted" : null,
    note.status === "failed" ? "No recorder was listening" : null,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <li className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line px-4 py-3 last:border-0 sm:grid-cols-[14px_minmax(0,1fr)_120px_64px_150px_150px] sm:gap-x-4 sm:px-5">
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={
          note.client
            ? { backgroundColor: markColor(clientColor(note.client.slug)) }
            : { border: "1.5px dashed var(--line-strong)" }
        }
      />
      <div className="min-w-0">
        <Link href={ROUTES.meetingNote(note.id)} className="block truncate font-medium text-tk-onyx hover:text-tk-teal hover:underline">
          {note.title || "Untitled meeting"}
          {note.language && note.language !== "en" ? (
            <span className="ml-1.5 rounded border border-line px-1 align-[1px] text-[9.5px] font-bold uppercase tracking-wide text-ink-3">{note.language}</span>
          ) : null}
        </Link>
        <p className="mt-0.5 truncate text-xs text-ink-3">{meta}</p>
      </div>
      <div className="hidden text-xs text-tk-slate sm:block">
        {formatDayLabel(note.startedAt, tz)}
        <span className="block text-[10.5px] text-ink-3">{formatTimeLabel(note.startedAt, tz)}</span>
      </div>
      <div className="hidden font-mono text-xs tabular-nums text-tk-slate sm:block">
        {live ? <LiveDuration startedAt={note.startedAt} /> : note.durationSec ? formatClock(note.durationSec) : "—"}
      </div>
      <div className="hidden text-xs text-tk-slate sm:block">
        {items.head}
        {items.sub ? <span className="block text-[10.5px] text-ink-3">{items.sub}</span> : null}
      </div>
      <div className="flex items-center justify-end gap-2">
        <StatusPill tone={pillTone(phaseTone(note))}>{note.phase}</StatusPill>
        {live ? <StopButton noteId={note.id} /> : null}
      </div>
    </li>
  )
}
