"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { hoursFromSeconds } from "@/lib/meeting-note"
import { approveNotePunchAction, logNoteTimeAction } from "@/lib/meeting-note-actions"
import type { NoteDetail } from "@/lib/meeting-notes"
import { ROUTES } from "@/lib/nav"

/**
 * The time a meeting took, as a separate card: the recorder's punch waits in
 * Review like any other; approving here carries the summary across. A note
 * with a client and no punch logs its time retroactively; one with no client
 * is asked to pick one first.
 */
export function TimeCard({ note }: { note: NoteDetail }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const punch = note.punch
  const hours = punch ? punch.hours : hoursFromSeconds(note.durationSec)
  if (!punch && !note.client && note.durationSec === 0) return null

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    start(async () => {
      const result = await fn()
      if (!result.ok) setError(result.error ?? "That did not work.")
      router.refresh()
    })
  }

  let body: React.ReactNode
  let action: React.ReactNode = null
  if (punch?.status === "running") {
    body = (
      <>
        <b className="font-semibold text-tk-onyx">{punch.clientName}</b> · the punch is still running.{" "}
        <Link href={ROUTES.timesheetLive} className="font-semibold text-tk-teal hover:underline">
          Clock
        </Link>
      </>
    )
  } else if (punch?.status === "stopped") {
    body = (
      <>
        <b className="font-semibold text-tk-onyx">{punch.projectName ? `${punch.clientName} · ${punch.projectName}` : `${punch.clientName} retainer`}</b> · punch
        stopped {punch.endClock} · waiting in Review. Approving here uses the first line of the summary as the entry.
      </>
    )
    action = (
      <>
        <button type="button" onClick={() => run(() => approveNotePunchAction(note.id))} disabled={busy || !note.summary} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-tk-linen disabled:opacity-50">
          {busy ? "Approving…" : "Approve with this summary"}
        </button>
        <Link href={ROUTES.timesheetReview} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-ink-3 hover:text-tk-onyx">
          Open Review
        </Link>
      </>
    )
  } else if (punch?.status === "approved") {
    body = (
      <>
        Logged to <b className="font-semibold text-tk-onyx">{punch.clientName}</b> on {punch.occurredOn}.{" "}
        <Link href={ROUTES.timesheetEntries} className="font-semibold text-tk-teal hover:underline">
          Ledger
        </Link>
      </>
    )
  } else if (punch?.status === "discarded") {
    body = <>The punch was discarded in Review.</>
  } else if (!punch && note.client) {
    body = (
      <>
        Not on the timesheet yet. Log it to <b className="font-semibold text-tk-onyx">{note.project ? `${note.client.name} · ${note.project.name}` : `${note.client.name} retainer`}</b> as an approved entry with the summary.
      </>
    )
    action = (
      <button type="button" onClick={() => run(() => logNoteTimeAction(note.id))} disabled={busy || note.durationSec === 0} className="rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-tk-linen disabled:opacity-50">
        {busy ? "Logging…" : `Log ${hours} h`}
      </button>
    )
  } else {
    body = <>Pick a client in the header to log this time.</>
  }

  return (
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-well px-4 py-3" aria-label="Time">
      <span className="text-2xl font-semibold tracking-tight tabular-nums text-tk-onyx">
        {hours}
        <span className="ml-1 text-[11px] font-semibold text-ink-3">h</span>
      </span>
      <p className="min-w-[200px] flex-1 text-xs text-tk-slate">{body}</p>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
      {error ? (
        <p role="status" className="basis-full text-xs text-bad">
          {error}
        </p>
      ) : null}
    </section>
  )
}
