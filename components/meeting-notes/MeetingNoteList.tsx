import Link from "next/link"
import { StatusPill } from "@/components/clients/StatusPill"
import { pillTone } from "@/components/meeting-notes/phase"
import { formatClock, formatDayLabel, phaseTone } from "@/lib/meeting-note"
import type { NoteRow } from "@/lib/meeting-notes"
import { ROUTES } from "@/lib/nav"

/** The client hub's block: the latest notes for one client, compact. */
export function MeetingNoteList({ rows }: { rows: NoteRow[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      {rows.map((note) => (
        <li key={note.id} className="flex items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <Link href={ROUTES.meetingNote(note.id)} className="block truncate text-sm font-medium text-tk-onyx hover:text-tk-teal hover:underline">
              {note.title || "Untitled meeting"}
            </Link>
            <p className="mt-0.5 text-xs text-ink-3">
              {formatDayLabel(note.startedAt, note.timeZone || "UTC")}
              {note.durationSec ? ` · ${formatClock(note.durationSec)}` : ""}
              {note.items.proposed ? ` · ${note.items.proposed} to review` : note.items.accepted ? ` · ${note.items.accepted} filed` : ""}
            </p>
          </div>
          <StatusPill tone={pillTone(phaseTone(note))}>{note.phase}</StatusPill>
        </li>
      ))}
    </ul>
  )
}
