"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { AlertTriangle, Check, Mic, Square } from "lucide-react"
import { RecorderPill } from "@/components/meeting-notes/RecorderPill"
import { useElapsed } from "@/components/timesheet/useElapsed"
import type { WorkerStatus } from "@/lib/chat/worker-status"
import { clientColor, markColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { formatClock, formatTimeLabel, levelBars, STRANDED_AFTER_MS } from "@/lib/meeting-note"
import { discardNoteAction, liveRecordingNow, startRecordingAction, stopRecordingAction } from "@/lib/meeting-note-actions"
import type { CalendarSuggestion, LiveView } from "@/lib/meeting-notes"
import { ROUTES } from "@/lib/nav"
import { announcePunchChange, onPunchChange } from "@/lib/punch-signal"
import type { PunchTarget } from "@/lib/punches"

/** The lifted tomato the recording mark wears on onyx. Literal because the surface is literal in both themes. */
export const REC_MARK = "rgb(240 138 106)"

/**
 * Record a meeting, under the clock. The same targets as the clock plus
 * "No client yet"; Start opens a punch when there is a client. The row sits
 * `requested` until the Mac claims it — amber, never a red dot — and after
 * twenty seconds the panel says plainly that nobody is recording.
 */
export function RecordPanel({
  live: initialLive,
  targets,
  suggestion,
  recorder,
}: {
  live: LiveView | null
  targets: PunchTarget[]
  suggestion: CalendarSuggestion | null
  recorder: WorkerStatus
}) {
  const [live, setLive] = useState<LiveView | null>(initialLive)
  const [lastId, setLastId] = useState<string | null>(null)
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [requestId, setRequestId] = useState<string>("")
  const [patient, setPatient] = useState(false)

  useEffect(() => {
    setRequestId(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()))
  }, [live?.id])

  const refresh = useCallback(async () => {
    try {
      const next = await liveRecordingNow()
      setLive((prev) => {
        if (prev && !next) setLastId(prev.id)
        return next
      })
    } catch {
      /* the next poll retries */
    }
  }, [])

  useEffect(() => {
    if (!live) return
    const ms = live.status === "recording" ? 5000 : 2000
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh()
    }, ms)
    return () => window.clearInterval(timer)
  }, [live, refresh])

  useEffect(() => onPunchChange(() => void refresh()), [refresh])

  function begin(target: { clientId: string | null; projectId: string | null }) {
    setError(null)
    setLastId(null)
    start(async () => {
      const result = await startRecordingAction({
        clientId: target.clientId,
        projectId: target.projectId,
        title,
        clientRequestId: requestId,
        calendarEventId: suggestion && (!target.clientId || suggestion.clientId === target.clientId) ? suggestion.eventId : null,
      })
      if (!result.ok) setError(result.error)
      else {
        setTitle("")
        setPatient(false)
        announcePunchChange()
        await refresh()
      }
    })
  }

  function stop() {
    if (!live) return
    setError(null)
    start(async () => {
      const result = await stopRecordingAction(live.id)
      if (!result.ok) setError(result.error)
      announcePunchChange()
      await refresh()
    })
  }

  function cancel() {
    if (!live) return
    setError(null)
    start(async () => {
      const result = await discardNoteAction(live.id)
      if (!result.ok) setError(result.error)
      setLastId(null)
      announcePunchChange()
      await refresh()
    })
  }

  const stranded = live?.status === "requested" && live.waitingSec * 1000 >= STRANDED_AFTER_MS && !patient

  return (
    <section id="record" className="flex flex-col gap-3 scroll-mt-16" aria-label="Record a meeting">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">Record a meeting</p>
        <RecorderPill status={live?.recorder ?? recorder} />
      </div>

      {live?.status === "recording" ? (
        <RecordingBand live={live} busy={busy} onStop={stop} />
      ) : live?.status === "stopping" ? (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-tk-onyx px-5 py-4 text-tk-linen shadow-card ring-1 ring-inset ring-tk-linen/10">
          <span aria-hidden className="size-3 rounded-full bg-tk-linen/45" />
          <span className="font-mono text-2xl font-bold tabular-nums text-tk-linen/60">{formatClock(live.durationSec || elapsedSeconds(live.startedAt))}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{live.title || live.client?.name || "Untitled meeting"}</p>
            <p className="mt-0.5 text-xs text-tk-linen/70">Finishing… saving the recording</p>
          </div>
          <span className="relative h-0.5 w-40 overflow-hidden rounded bg-tk-linen/20" aria-hidden>
            <span className="absolute inset-y-0 w-1/3 animate-pulse rounded bg-[color:var(--rail-active-icon)]" />
          </span>
        </div>
      ) : live?.status === "requested" ? (
        stranded ? (
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-amber-700/30 bg-amber-50 px-5 py-4">
            <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
            <p className="min-w-[220px] flex-1 text-sm text-tk-slate">
              <b className="font-semibold text-tk-onyx">Nobody is recording.</b> The recorder{live.recorder.name ? ` on ${live.recorder.name}` : ""}{" "}
              {live.recorder.secondsAgo == null ? "has never checked in" : `was last seen ${ago(live.recorder.secondsAgo)}`}. Wake the Mac, or run{" "}
              <code className="rounded border border-line bg-well px-1 font-mono text-[11.5px]">npm run meeting:worker</code>. Nothing has been captured.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={cancel} disabled={busy} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-tk-linen disabled:opacity-60">
                Cancel
              </button>
              <button type="button" onClick={() => setPatient(true)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-3 hover:text-tk-onyx">
                Keep waiting
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-card px-5 py-4">
            <span aria-hidden className="size-2.5 animate-pulse rounded-full bg-warn ring-4 ring-warn-soft" />
            <p className="min-w-[220px] flex-1 text-sm text-tk-slate">
              <b className="font-semibold text-tk-onyx">Starting…</b> Waiting for the recorder{live.recorder.name ? ` on ${live.recorder.name}` : ""} to pick this up. Usually a second or two.
            </p>
            <button type="button" onClick={cancel} disabled={busy} className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-onyx hover:border-line-strong disabled:opacity-60">
              Cancel
            </button>
          </div>
        )
      ) : (
        <>
          {lastId ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card px-5 py-3 text-sm text-tk-slate">
              <Check className="size-4 text-good" aria-hidden />
              <span className="flex-1">
                <b className="font-semibold text-tk-onyx">Recorded.</b> The notes are being written on the Mac; the punch, if one opened, is waiting in Review.
              </span>
              <Link href={ROUTES.meetingNote(lastId)} className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-onyx hover:border-line-strong">
                Open the note
              </Link>
            </div>
          ) : null}
          <div className="rounded-2xl border border-line bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-tk-onyx">Not recording</p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title (optional) — the notes propose one"
                aria-label="Meeting title"
                className="w-full max-w-sm rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal"
              />
            </div>
            <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {targets.map((target) => {
                const suggested = suggestion?.clientId === target.clientId && !target.projectId
                return (
                  <li key={`${target.clientId}:${target.projectId ?? ""}`}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => begin({ clientId: target.clientId, projectId: target.projectId })}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-xl border px-4 py-3 text-left transition-colors",
                        suggested ? "border-tk-teal/40 bg-tk-teal/5" : "border-line bg-card hover:border-line-strong",
                        busy && "opacity-60"
                      )}
                    >
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: markColor(clientColor(target.clientSlug)) }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-tk-onyx">{target.clientName}</span>
                        <span className={cn("block truncate text-xs", suggested ? "text-tk-teal" : "text-ink-3")}>
                          {suggested ? `On your calendar now · ${suggestion!.title || "meeting"}` : target.projectName ?? "Retainer · maintenance"}
                        </span>
                      </span>
                      <Mic className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                    </button>
                  </li>
                )
              })}
              <li className="sm:col-span-2 lg:col-span-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => begin({ clientId: null, projectId: null })}
                  className={cn("flex w-full items-center gap-2.5 rounded-xl border border-dashed border-line-strong bg-card px-4 py-3 text-left hover:border-tk-teal/40", busy && "opacity-60")}
                >
                  <span aria-hidden className="size-2.5 shrink-0 rounded-full border-[1.5px] border-dashed border-line-strong" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-tk-onyx">No client yet</span>
                    <span className="block truncate text-xs text-ink-3">
                      {suggestion && !suggestion.clientId ? `On your calendar now · ${suggestion.title || "meeting"} · ` : ""}A lead call, or decide later — no punch opens
                    </span>
                  </span>
                  <Mic className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                </button>
              </li>
            </ul>
          </div>
        </>
      )}

      {error ? (
        <p role="status" className="rounded-xl border border-line bg-card px-4 py-2.5 text-sm text-tk-slate">
          {error}
        </p>
      ) : null}
    </section>
  )
}

function elapsedSeconds(startedAt: string | null) {
  return startedAt ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)) : 0
}

function ago(seconds: number) {
  if (seconds < 90) return "moments ago"
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`
  return `${Math.round(seconds / 86_400)} d ago`
}

/** Onyx in both themes, so the tomato mark reads; teal stays for plain punches. */
function RecordingBand({ live, busy, onStop }: { live: LiveView; busy: boolean; onStop: () => void }) {
  const seconds = useElapsed(live.startedAt)
  const who = [live.client?.name, live.project?.name].filter(Boolean).join(" · ")
  const started = formatTimeLabel(live.startedAt, live.timeZone || "UTC")
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl bg-tk-onyx px-5 py-4 text-tk-linen shadow-card ring-1 ring-inset ring-tk-linen/10">
      <span aria-hidden className="size-3 shrink-0 animate-pulse rounded-full motion-reduce:animate-none" style={{ backgroundColor: REC_MARK, boxShadow: `0 0 0 4px rgb(240 138 106 / 0.22)` }} />
      <p className="font-mono text-3xl font-bold tabular-nums tracking-tight">{formatClock(seconds)}</p>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{live.title || who || "Untitled meeting"}</p>
        <p className="mt-0.5 truncate text-xs text-tk-linen/75">
          {[who, started ? `started ${started}` : null, live.punchId ? "clocked in" : "no punch", `on ${live.worker || "the Mac"}`].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex items-center gap-4" aria-label="Levels">
        <Meter label="MIC" level={live.levels?.mic ?? null} />
        <Meter label="SYSTEM" level={live.levels?.sys ?? null} />
      </div>
      <button
        type="button"
        onClick={onStop}
        disabled={busy}
        className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-tk-linen px-4 py-2 text-xs font-bold text-tk-onyx disabled:opacity-60"
      >
        <Square className="size-3.5" aria-hidden />
        {busy ? "Stopping…" : "Stop"}
      </button>
    </div>
  )
}

/** Four bars, lit from the helper's per-second RMS. Answers the one question that matters: is the far side being captured? */
function Meter({ label, level }: { label: string; level: number | null }) {
  const lit = levelBars(level)
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-tk-linen/60">{label}</span>
      <span className="flex h-3.5 items-end gap-0.5" title={level == null ? "no signal yet" : `level ${Math.round(level * 100)}%`}>
        {[5, 8, 11, 14].map((h, i) => (
          <span
            key={h}
            className="w-1 rounded-[1px]"
            style={{ height: h, backgroundColor: i < lit ? "var(--rail-active-icon)" : "rgb(241 234 220 / 0.22)" }}
          />
        ))}
      </span>
    </span>
  )
}
