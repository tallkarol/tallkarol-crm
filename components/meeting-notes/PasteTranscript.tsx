"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { FileText, X } from "lucide-react"
import { createFromTranscriptAction } from "@/lib/meeting-note-actions"
import { MAX_PASTE_CHARS } from "@/lib/meeting-note"
import type { Party, ProjectOption } from "@/lib/meeting-notes"
import { ROUTES } from "@/lib/nav"

const INPUT = "w-full rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal"

/**
 * A transcript from anywhere — Zoom, Teams, a Voice Memo run through
 * Whisper — pasted in. The notes are written on submit; the row lands in
 * review with the Mac asleep. Text fits a server action; audio does not, and
 * goes through `npm run meeting:import` instead.
 */
export function PasteTranscript({ clients, projects }: { clients: Party[]; projects: ProjectOption[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [clientId, setClientId] = useState("")
  const [projectId, setProjectId] = useState("")
  const [when, setWhen] = useState("")
  const [text, setText] = useState("")

  const clientProjects = useMemo(() => projects.filter((p) => !clientId || p.clientId === clientId), [projects, clientId])

  function submit() {
    setError(null)
    if (!text.trim()) {
      setError("Paste the transcript first.")
      return
    }
    start(async () => {
      const result = await createFromTranscriptAction({
        title,
        clientId: clientId || null,
        projectId: projectId || null,
        startedAt: when ? new Date(when).toISOString() : null,
        text,
      })
      if (!result.ok) setError(result.error)
      else router.push(ROUTES.meetingNote(result.data.id))
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-onyx hover:border-line-strong"
      >
        <FileText className="size-3.5" aria-hidden />
        Paste a transcript
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-scrim p-4 pt-[6vh] sm:pt-[10vh]" role="dialog" aria-modal="true" aria-label="Paste a transcript">
      <div className="w-full max-w-2xl rounded-2xl border border-line bg-card p-5 shadow-overlay">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-bold text-tk-onyx">Paste a transcript</h2>
            <p className="mt-0.5 text-xs text-ink-3">
              VTT, SRT, “Name: line” or plain text. The notes are written the moment you save; nothing is filed until you review them.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-lg p-1.5 text-ink-3 hover:bg-well hover:text-tk-onyx">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Title</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Optional — the notes propose one" className={`${INPUT} mt-1`} />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Client</span>
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value)
                setProjectId("")
              }}
              className={`${INPUT} mt-1`}
            >
              <option value="">No client yet</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={`${INPUT} mt-1`} disabled={!clientId}>
              <option value="">{clientId ? "Retainer · none" : "Pick a client first"}</option>
              {clientProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">When the meeting happened</span>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={`${INPUT} mt-1`} />
            <span className="mt-1 block text-[11px] text-ink-3">Leave empty for now. Relative dates in the notes (“by Friday”) count from this.</span>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Transcript</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX_PASTE_CHARS))}
              rows={12}
              placeholder={"[00:04] Rebecca: We need the toll filling page live before the trade show…"}
              className={`${INPUT} mt-1 min-h-[220px] font-mono text-[12.5px] leading-relaxed`}
            />
            <span className="mt-1 block text-right font-mono text-[10.5px] tabular-nums text-ink-3">
              {text.length.toLocaleString()} / {MAX_PASTE_CHARS.toLocaleString()}
            </span>
          </label>
        </div>

        {error ? (
          <p role="status" className="mt-2 rounded-xl border border-line bg-well px-3 py-2 text-sm text-tk-slate">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-3 hover:text-tk-onyx">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-bold text-tk-linen disabled:opacity-60"
          >
            {busy ? "Writing the notes…" : "Save and write the notes"}
          </button>
        </div>
      </div>
    </div>
  )
}
