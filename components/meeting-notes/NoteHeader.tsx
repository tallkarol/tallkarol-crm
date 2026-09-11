"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, Copy, MoreHorizontal, Pencil, RefreshCw } from "lucide-react"
import { StatusPill } from "@/components/clients/StatusPill"
import { pillTone, zoneShort } from "@/components/meeting-notes/phase"
import { notesMarkdown } from "@/components/meeting-notes/notes-markdown"
import { clientColor, inkColor, markColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { formatClock, formatDayLabel, formatTimeLabel, phaseTone } from "@/lib/meeting-note"
import {
  discardNoteAction,
  reanalyzeAction,
  requeueTranscriptionAction,
  setNoteTargetAction,
  setNoteTitleAction,
} from "@/lib/meeting-note-actions"
import type { NoteDetail, Party, ProjectOption } from "@/lib/meeting-notes"
import { ROUTES } from "@/lib/nav"

const BTN = "inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-onyx hover:border-line-strong disabled:opacity-60"

export function NoteHeader({ note, clients, projects }: { note: NoteDetail; clients: Party[]; projects: ProjectOption[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(note.title)
  const [copied, setCopied] = useState(false)
  const [menu, setMenu] = useState(false)
  const [picking, setPicking] = useState(false)
  const tz = note.timeZone || "UTC"

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null)
    start(async () => {
      const result = await fn()
      if (!result.ok) setError(result.error ?? "That did not work.")
      else {
        router.refresh()
        after?.()
      }
    })
  }

  function saveTitle() {
    setEditing(false)
    if (title.trim() === note.title) return
    run(() => setNoteTitleAction(note.id, title))
  }

  async function copyNotes() {
    try {
      await navigator.clipboard.writeText(notesMarkdown(note))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError("Could not reach the clipboard.")
    }
  }

  const attendees = note.analysis.attendees.length
    ? note.analysis.attendees.map((a) => a.name)
    : (note.calendarEvent?.attendees ?? []).map((a) => a.name || a.email)
  const clientProjects = projects.filter((p) => !note.client || p.clientId === note.client.id)

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle()
                if (e.key === "Escape") {
                  setTitle(note.title)
                  setEditing(false)
                }
              }}
              aria-label="Title"
              className="w-full max-w-xl rounded-lg border border-line bg-card px-2 py-1 text-xl font-semibold tracking-tight text-tk-onyx focus:border-tk-teal"
            />
          ) : (
            <h1 className="text-2xl font-semibold tracking-tight text-tk-onyx">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="group inline-flex max-w-full items-center gap-2 text-left"
                title="Rename"
              >
                <span className="truncate">{note.title || "Untitled meeting"}</span>
                <Pencil className="size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </button>
            </h1>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-3">
            {picking ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <select
                  defaultValue={note.client?.id ?? ""}
                  onChange={(e) => run(() => setNoteTargetAction(note.id, { clientId: e.target.value || null, projectId: null }), () => setPicking(false))}
                  className="rounded-lg border border-line bg-card px-2 py-1 text-xs text-tk-onyx"
                  aria-label="Client"
                >
                  <option value="">No client</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {note.client ? (
                  <select
                    defaultValue={note.project?.id ?? ""}
                    onChange={(e) =>
                      run(() => setNoteTargetAction(note.id, { clientId: note.client!.id, projectId: e.target.value || null }), () => setPicking(false))
                    }
                    className="rounded-lg border border-line bg-card px-2 py-1 text-xs text-tk-onyx"
                    aria-label="Project"
                  >
                    <option value="">Retainer · none</option>
                    {clientProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button type="button" onClick={() => setPicking(false)} className="text-[11px] font-semibold text-ink-3 hover:text-tk-onyx">
                  Done
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setPicking(true)} className="inline-flex items-center gap-1.5 hover:underline" title="Change client or project">
                {note.client ? (
                  <>
                    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: markColor(clientColor(note.client.slug)) }} />
                    <span className="font-semibold" style={{ color: inkColor(clientColor(note.client.slug)) }}>
                      {note.client.name}
                    </span>
                    {note.project ? <span>· {note.project.name}</span> : <span>· Retainer</span>}
                  </>
                ) : (
                  <span className="font-semibold text-warn">No client yet · pick one</span>
                )}
              </button>
            )}
            {note.startedAt ? (
              <>
                <span className="opacity-50">·</span>
                <span>
                  {formatDayLabel(note.startedAt, tz)} · {formatTimeLabel(note.startedAt, tz)}
                  {note.endedAt ? `–${formatTimeLabel(note.endedAt, tz)}` : ""} {zoneShort(note.startedAt, tz)}
                </span>
              </>
            ) : null}
            {note.durationSec ? (
              <>
                <span className="opacity-50">·</span>
                <span className="font-mono tabular-nums">{formatClock(note.durationSec)}</span>
              </>
            ) : null}
            {attendees.length ? (
              <>
                <span className="opacity-50">·</span>
                <span className="truncate">{attendees.slice(0, 5).join(", ")}</span>
              </>
            ) : null}
            {note.worker || note.transcriptModel ? (
              <>
                <span className="opacity-50">·</span>
                <span>
                  {note.source === "live" ? `Recorded on ${note.worker || "the Mac"}` : note.source === "import" ? `Imported on ${note.worker || "the Mac"}` : "Pasted"}
                  {note.transcriptModel ? ` · ${note.transcriptModel}` : ""}
                </span>
              </>
            ) : null}
            {note.language ? (
              <span className="rounded border border-line px-1 text-[9.5px] font-bold uppercase tracking-wide text-ink-3">{note.language}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={pillTone(phaseTone(note))}>{note.phase}</StatusPill>
          <button type="button" onClick={copyNotes} className={BTN} disabled={!note.summary}>
            {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
            {copied ? "Copied" : "Copy notes"}
          </button>
          {note.transcriptStatus === "done" ? (
            <button type="button" onClick={() => run(() => reanalyzeAction(note.id))} disabled={busy} className={BTN}>
              <RefreshCw className={cn("size-3.5", busy && "animate-spin")} aria-hidden />
              {note.analysisStatus === "done" ? "Analyze again" : "Write the notes"}
            </button>
          ) : null}
          <div className="relative">
            <button type="button" onClick={() => setMenu((v) => !v)} aria-label="More" className="rounded-lg p-1.5 text-ink-3 hover:bg-well hover:text-tk-onyx">
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
            {menu ? (
              <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-xl border border-line bg-card p-1 shadow-overlay">
                {note.transcriptStatus === "failed" || (note.transcriptStatus === "done" && note.recordingPath) ? (
                  <button
                    type="button"
                    onClick={() => run(() => requeueTranscriptionAction(note.id), () => setMenu(false))}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-tk-onyx hover:bg-well"
                  >
                    Transcribe again on the Mac
                  </button>
                ) : null}
                <Link href={ROUTES.timesheetReview} className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-tk-onyx hover:bg-well">
                  Open the review queue
                </Link>
                {note.status !== "discarded" ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm("Discard this note? The transcript stays on the Mac; the row is kept as a receipt.")) return
                      run(() => discardNoteAction(note.id), () => router.push(ROUTES.meetingNotes))
                    }}
                    className="block w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-bad hover:bg-well"
                  >
                    Discard this note
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {error ? (
        <p role="status" className="mt-3 rounded-xl border border-line bg-well px-3 py-2 text-sm text-tk-slate">
          {error}
        </p>
      ) : null}
    </div>
  )
}
