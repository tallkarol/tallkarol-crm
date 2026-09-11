import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowUpRight } from "lucide-react"
import { Prose } from "@/components/chat/Prose"
import { ItemsTable } from "@/components/meeting-notes/ItemsTable"
import { NoteHeader } from "@/components/meeting-notes/NoteHeader"
import { PhaseLine } from "@/components/meeting-notes/PhaseLine"
import { TimeCard } from "@/components/meeting-notes/TimeCard"
import { TranscriptPane } from "@/components/meeting-notes/TranscriptPane"
import { getSessionUser } from "@/lib/auth"
import { formatClock } from "@/lib/meeting-note"
import { loadNote, targetOptions } from "@/lib/meeting-notes"
import { ROUTES } from "@/lib/nav"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { id: string } }) {
  const note = await loadNote(params.id)
  return { title: note?.title || "Meeting note" }
}

export default async function MeetingNotePage({ params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return null
  const [note, options] = await Promise.all([loadNote(params.id), targetOptions()])
  if (!note) notFound()

  const a = note.analysis
  const quoteFor = (text: string) => {
    // A decision or question is a line of the notes; find the segment that says it, if one does.
    const needle = text.toLowerCase().slice(0, 40)
    return note.segments.find((s) => s.text.toLowerCase().includes(needle)) ?? null
  }

  return (
    <>
      <Link href={ROUTES.meetingNotes} className="inline-flex items-center gap-1.5 text-sm font-semibold text-tk-teal hover:underline">
        <ArrowLeft className="size-3.5" aria-hidden />
        Meeting notes
      </Link>

      <NoteHeader note={note} clients={options.clients} projects={options.projects} />
      <PhaseLine note={note} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
            <header className="mb-2.5 flex items-baseline justify-between gap-3">
              <h3 className="text-[12.5px] font-bold text-tk-onyx">Summary</h3>
              <span className="font-mono text-[11px] tabular-nums text-ink-3">
                {note.analysisStatus === "done" ? `${note.summary.split(/\n{2,}/).filter(Boolean).length} paragraphs` : note.analysisStatus}
              </span>
            </header>
            {note.analysisStatus === "failed" ? (
              <p className="mb-3 rounded-xl border border-amber-700/30 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                The notes could not be written{note.analysisError ? `: ${note.analysisError}` : ""}. The transcript is intact — use <b>Analyze again</b>.
              </p>
            ) : null}
            {note.summary ? (
              <div className="max-w-[66ch] text-[13.5px] leading-relaxed text-tk-onyx">
                <Prose text={note.summary} />
              </div>
            ) : (
              <p className="text-sm text-ink-3">
                {note.status === "recording" || note.status === "requested" || note.status === "stopping"
                  ? "Recording. The summary is written after Stop."
                  : note.transcriptStatus !== "done"
                    ? "Waiting for the transcript."
                    : "Writing the notes…"}
              </p>
            )}
          </section>

          {a.topics.length ? (
            <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
              <header className="mb-2.5 flex items-baseline justify-between gap-3">
                <h3 className="text-[12.5px] font-bold text-tk-onyx">Topics</h3>
                <span className="font-mono text-[11px] tabular-nums text-ink-3">{a.topics.length}</span>
              </header>
              <div className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                {a.topics.map((t, i) => (
                  <div key={i}>
                    <p className="text-[12.5px] font-semibold text-tk-onyx">{t.title}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-tk-slate">{t.detail}</p>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {a.decisions.length || a.questions.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {a.decisions.length ? (
                <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
                  <header className="mb-2.5 flex items-baseline justify-between gap-3">
                    <h3 className="text-[12.5px] font-bold text-tk-onyx">Decisions</h3>
                    <span className="font-mono text-[11px] tabular-nums text-ink-3">{a.decisions.length}</span>
                  </header>
                  <ul className="flex flex-col gap-2">
                    {a.decisions.map((d, i) => {
                      const seg = quoteFor(d)
                      return (
                        <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 text-[13px] leading-snug text-tk-onyx">
                          <span>{d}</span>
                          {seg && seg.start != null ? <TimeLink index={seg.i} start={seg.start} /> : null}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ) : null}
              {a.questions.length ? (
                <section className="rounded-2xl border border-line bg-card p-5 shadow-card">
                  <header className="mb-2.5 flex items-baseline justify-between gap-3">
                    <h3 className="text-[12.5px] font-bold text-tk-onyx">Open questions</h3>
                    <span className="font-mono text-[11px] tabular-nums text-ink-3">{a.questions.length}</span>
                  </header>
                  <ul className="flex flex-col gap-2">
                    {a.questions.map((q, i) => {
                      const seg = quoteFor(q)
                      return (
                        <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 text-[13px] leading-snug text-tk-onyx">
                          <span>{q}</span>
                          {seg && seg.start != null ? <TimeLink index={seg.i} start={seg.start} /> : null}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}

          <ItemsTable note={note} />
          <TimeCard note={note} />
        </div>

        <TranscriptPane note={note} />
      </div>
    </>
  )
}

function TimeLink({ index, start }: { index: number; start: number }) {
  return (
    <a href={`#s-${index}`} className="inline-flex items-center gap-0.5 rounded bg-accent-soft px-1.5 py-px font-mono text-[10.5px] font-medium tabular-nums text-tk-teal hover:underline">
      {formatClock(start)}
      <ArrowUpRight className="size-2.5" aria-hidden />
    </a>
  )
}
