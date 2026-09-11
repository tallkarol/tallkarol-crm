import { formatClock, formatDayLabel, formatTimeLabel, speakerLabel } from "@/lib/meeting-note"
import type { NoteDetail } from "@/lib/meeting-notes"

/** What "Copy notes" puts on the clipboard — the page, as Markdown. */
export function notesMarkdown(note: NoteDetail): string {
  const tz = note.timeZone || "UTC"
  const out: string[] = []
  out.push(`# ${note.title || "Meeting notes"}`)
  const meta = [
    note.client?.name,
    note.project?.name,
    note.startedAt ? `${formatDayLabel(note.startedAt, tz)} · ${formatTimeLabel(note.startedAt, tz)} (${tz})` : null,
    note.durationSec ? formatClock(note.durationSec) : null,
  ].filter(Boolean)
  if (meta.length) out.push(meta.join(" · "))
  if (note.summary.trim()) out.push("", note.summary.trim())
  if (note.analysis.topics.length) {
    out.push("", "## Topics")
    for (const t of note.analysis.topics) out.push(`- **${t.title}** — ${t.detail}`)
  }
  if (note.analysis.decisions.length) {
    out.push("", "## Decisions")
    for (const d of note.analysis.decisions) out.push(`- ${d}`)
  }
  if (note.analysis.questions.length) {
    out.push("", "## Open questions")
    for (const q of note.analysis.questions) out.push(`- ${q}`)
  }
  const items = note.itemRows.filter((i) => i.state !== "dismissed")
  if (items.length) {
    out.push("", "## Action items")
    for (const i of items) {
      const when = i.kind === "event" ? i.startsAt : i.dueOn
      out.push(`- [${i.state === "accepted" ? "x" : " "}] ${i.title}${i.owner ? ` — ${i.owner}` : ""}${when ? ` (${when})` : ""}`)
    }
  }
  return out.join("\n")
}

export function transcriptMarkdown(note: NoteDetail): string {
  return note.segments
    .map((s) => {
      const t = s.start != null ? `[${formatClock(s.start)}] ` : ""
      const who = s.speaker ? `**${speakerLabel(note.speakerNames, s.speaker)}:** ` : ""
      return `${t}${who}${s.text}`
    })
    .join("\n")
}
