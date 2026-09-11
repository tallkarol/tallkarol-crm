"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, Copy, Pencil, Search } from "lucide-react"
import { transcriptMarkdown } from "@/components/meeting-notes/notes-markdown"
import { cn } from "@/lib/cn"
import { formatClock, SPEAKER_MIC, SPEAKER_SYSTEM, speakerLabel } from "@/lib/meeting-note"
import { renameSpeakerAction } from "@/lib/meeting-note-actions"
import type { NoteDetail } from "@/lib/meeting-notes"

/**
 * The evidence, beside the notes. Speaker labels come from the tracks — mic
 * is Karol, system audio is Others — and Others can be renamed per note. A
 * timestamp link on an item lands here (`#s-<index>`) and lights the segment.
 */
export function TranscriptPane({ note }: { note: NoteDetail }) {
  const router = useRouter()
  const [, start] = useTransition()
  const [q, setQ] = useState("")
  const [highlight, setHighlight] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const read = () => {
      const m = /^#s-(\d+)$/.exec(window.location.hash)
      if (!m) return
      const index = Number(m[1])
      setHighlight(index)
      const el = document.getElementById(`s-${index}`)
      el?.scrollIntoView({ block: "center", behavior: "smooth" })
    }
    read()
    window.addEventListener("hashchange", read)
    return () => window.removeEventListener("hashchange", read)
  }, [])

  const speakers = useMemo(() => {
    const set = new Set<string>()
    for (const s of note.segments) if (s.speaker) set.add(s.speaker)
    return Array.from(set)
  }, [note.segments])

  const needle = q.trim().toLowerCase()
  const shown = needle ? note.segments.filter((s) => s.text.toLowerCase().includes(needle) || speakerLabel(note.speakerNames, s.speaker).toLowerCase().includes(needle)) : note.segments

  function rename(speaker: string) {
    const current = speakerLabel(note.speakerNames, speaker)
    const next = window.prompt(`Name for “${speaker}” in this note`, current === speaker ? "" : current)
    if (next == null) return
    start(async () => {
      await renameSpeakerAction(note.id, speaker, next)
      router.refresh()
    })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(transcriptMarkdown(note))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard denied — nothing to do */
    }
  }

  if (!note.segments.length) {
    return (
      <aside className="rounded-2xl border border-line bg-card p-5 shadow-card" aria-label="Transcript">
        <h3 className="text-[12.5px] font-bold text-tk-onyx">Transcript</h3>
        <p className="mt-2 text-sm text-ink-3">
          {note.transcriptStatus === "failed"
            ? `Transcription failed: ${note.transcriptError || "no detail"}.`
            : note.status === "recording" || note.status === "requested" || note.status === "stopping"
              ? "The transcript arrives after Stop."
              : "Nothing transcribed yet."}
        </p>
      </aside>
    )
  }

  return (
    <aside className="flex max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-card lg:sticky lg:top-4" aria-label="Transcript">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <h3 className="flex-1 text-[12.5px] font-bold text-tk-onyx">Transcript</h3>
        <span className="font-mono text-[11px] tabular-nums text-ink-3">
          {note.durationSec ? `${formatClock(note.durationSec)} · ` : ""}
          {speakers.length} {speakers.length === 1 ? "speaker" : "speakers"}
        </span>
      </header>
      <div className="flex flex-wrap gap-1.5 px-4 pb-1.5 pt-2.5">
        {speakers.map((speaker) => {
          const label = speakerLabel(note.speakerNames, speaker)
          const sub = speaker === SPEAKER_MIC ? "mic" : speaker === SPEAKER_SYSTEM ? "system" : ""
          return (
            <button
              key={speaker}
              type="button"
              onClick={() => rename(speaker)}
              title="Rename for this note"
              className="inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-card pl-1.5 pr-2 text-[11px] font-semibold text-tk-slate hover:border-line-strong"
            >
              <span aria-hidden className={cn("size-2 rounded-sm", speaker === SPEAKER_MIC ? "bg-accent-mark" : "bg-warn")} />
              {label}
              {sub ? <span className="text-ink-3">· {sub}</span> : null}
              <Pencil className="size-2.5 text-ink-3" aria-hidden />
            </button>
          )
        })}
      </div>
      <label className="mx-4 mb-1.5 flex h-8 items-center gap-2 rounded-lg border border-line bg-well px-2.5 text-ink-3 focus-within:border-line-strong focus-within:bg-card">
        <Search className="size-3.5" aria-hidden />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the transcript" className="w-full bg-transparent text-xs text-tk-onyx outline-none placeholder:text-ink-3" />
        {needle ? <span className="font-mono text-[10.5px] tabular-nums">{shown.length}</span> : null}
      </label>
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {shown.map((s) => (
          <div
            key={s.i}
            id={`s-${s.i}`}
            className={cn("grid grid-cols-[40px_minmax(0,1fr)] items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-well", highlight === s.i && "bg-accent-soft")}
          >
            <span className="pt-0.5 font-mono text-[10.5px] leading-[1.7] tabular-nums text-ink-3">{s.start != null ? formatClock(s.start) : ""}</span>
            <p className="text-[12.5px] leading-relaxed text-tk-onyx">
              {s.speaker ? (
                <span className={cn("mr-1.5 text-[10.5px] font-bold uppercase tracking-wide", s.speaker === SPEAKER_MIC ? "text-tk-teal" : "text-warn")}>
                  {speakerLabel(note.speakerNames, s.speaker)}
                </span>
              ) : null}
              {s.text}
            </p>
          </div>
        ))}
        {shown.length === 0 ? <p className="px-3 py-6 text-center text-xs text-ink-3">Nothing matches.</p> : null}
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-line px-3 py-2 text-[11px] text-ink-3">
        <span>Segment timestamps · audio stays on the Mac</span>
        <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-ink-3 hover:bg-well hover:text-tk-onyx">
          {copied ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
          {copied ? "Copied" : "Copy transcript"}
        </button>
      </footer>
    </aside>
  )
}
