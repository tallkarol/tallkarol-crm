"use client"

import Link from "next/link"
import { useMemo, useState, useTransition } from "react"
import { Badge } from "@/components/work/Badge"
import { cn } from "@/lib/cn"
import type { MeetingProposal } from "@/lib/meetings"
import { dismissMeeting, logMeeting } from "@/lib/meetings-actions"
import { ROUTES } from "@/lib/nav"

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/** Wall-clock in the viewer's zone — the timesheet stores a plain day + HH:mm. */
function localParts(iso: string) {
  const d = new Date(iso)
  return {
    day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    clock: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  }
}

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
}

export function MeetingInbox({
  proposals,
  unmatched,
}: {
  proposals: MeetingProposal[]
  unmatched: { domain: string; hours: number }[]
}) {
  const [done, setDone] = useState<Record<string, "logged" | "dismissed">>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const open = useMemo(
    () => proposals.filter((p) => !done[p.eventId]),
    [proposals, done]
  )

  const totalHours = open.reduce((sum, p) => sum + p.hours, 0)
  const loggedCount = Object.values(done).filter((v) => v === "logged").length

  function accept(p: MeetingProposal) {
    setError(null)
    setBusy(p.eventId)
    const start = localParts(p.startsAt)
    const end = localParts(p.endsAt)
    startTransition(async () => {
      const result = await logMeeting({
        eventId: p.eventId,
        clientId: p.clientId,
        occurredOn: start.day,
        startedAt: start.clock,
        endedAt: end.clock,
        hours: p.hours,
        summary: p.title,
      })
      setBusy(null)
      if (result.ok) setDone((d) => ({ ...d, [p.eventId]: "logged" }))
      else setError(result.error)
    })
  }

  function skip(p: MeetingProposal) {
    setError(null)
    setBusy(p.eventId)
    startTransition(async () => {
      const result = await dismissMeeting(p.eventId)
      setBusy(null)
      if (result.ok) setDone((d) => ({ ...d, [p.eventId]: "dismissed" }))
      else setError(result.error)
    })
  }

  // Group by local day so a week reads the way a calendar does.
  const grouped = useMemo(() => {
    const map = new Map<string, MeetingProposal[]>()
    for (const p of open) {
      const key = localParts(p.startsAt).day
      const bucket = map.get(key)
      if (bucket) bucket.push(p)
      else map.set(key, [p])
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [open])

  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Unlogged meetings" value={String(open.length)} />
        <Stat label="Hours waiting" value={totalHours.toFixed(1)} />
        <Stat label="Logged this visit" value={String(loggedCount)} />
      </div>

      {error ? (
        <p className="mt-3 rounded-2xl border border-tk-slate/15 bg-white px-4 py-2.5 text-sm text-tk-slate shadow-sm">
          {error}
        </p>
      ) : null}

      {open.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-6 py-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-tk-onyx">Nothing waiting</p>
          <p className="mt-1 text-sm text-tk-slate/70">
            Every matched meeting is either logged or waved off.
          </p>
        </div>
      ) : (
        grouped.map(([day, items]) => (
          <section key={day} className="mt-6">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
              {dayLabel(items[0].startsAt)}
            </h2>
            <ul className="mt-2 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
              {items.map((p) => (
                <li
                  key={p.eventId}
                  className="flex flex-wrap items-start justify-between gap-3 border-b border-tk-slate/10 px-5 py-3.5 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-tk-onyx">{p.title}</p>
                      <Badge tone="teal">{p.clientName}</Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-tk-slate/70">
                      {localParts(p.startsAt).clock}–{localParts(p.endsAt).clock} ·{" "}
                      {p.hours.toFixed(2)} hr · matched on {p.matchedDomain}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={busy === p.eventId}
                      onClick={() => accept(p)}
                      className="rounded-full bg-tk-teal px-3 py-1.5 text-xs font-semibold text-tk-linen disabled:opacity-50"
                    >
                      {busy === p.eventId ? "Logging…" : "Log it"}
                    </button>
                    <button
                      type="button"
                      disabled={busy === p.eventId}
                      onClick={() => skip(p)}
                      className="rounded-full border border-tk-slate/20 px-3 py-1.5 text-xs font-semibold text-tk-slate/70 hover:border-tk-slate/50 disabled:opacity-50"
                    >
                      Not billable
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {unmatched.length ? (
        <section className="mt-8 rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
          <h2 className="text-sm font-semibold text-tk-onyx">
            Meeting time with no client
          </h2>
          <p className="mt-1 text-sm text-tk-slate/70">
            These domains appear on meetings but match no client. Add one to a
            client on its page and the meetings show up here.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unmatched.slice(0, 10).map((row) => (
              <li
                key={row.domain}
                className={cn(
                  "rounded-full border border-tk-slate/20 px-3 py-1.5 text-xs text-tk-slate"
                )}
              >
                {row.domain}
                <span className="ml-1.5 font-semibold tabular-nums">
                  {row.hours} hr
                </span>
              </li>
            ))}
          </ul>
          <Link
            href={ROUTES.clients}
            className="mt-3 inline-block text-xs font-semibold text-tk-teal hover:underline"
          >
            Go to clients
          </Link>
        </section>
      ) : null}
    </>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-tk-onyx">
        {value}
      </p>
    </div>
  )
}
