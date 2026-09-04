"use client"

import { useMemo, useState, useTransition } from "react"
import { AlertTriangle } from "lucide-react"
import { Badge } from "@/components/work/Badge"
import { sourceLabel } from "@/lib/punch-source"
import { clientColor, markColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { FLAG_LABEL, approvalBlocker } from "@/lib/punch"
import { approvePunchEntry, dropPunch, editPunch } from "@/lib/punch-actions"
import type { PunchView } from "@/lib/punches"

type ProjectOption = { id: string; name: string; clientId: string }

type Draft = { summary: string; hours: string; projectId: string | null }

/**
 * Stopped punches waiting to become billable time. A punch is evidence; an
 * entry is a claim — this is where one becomes the other.
 */
export function PunchQueue({
  punches,
  projects,
}: {
  punches: PunchView[]
  projects: ProjectOption[]
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      punches.map((punch) => [
        punch.id,
        {
          summary: punch.note,
          hours: punch.hours.toFixed(2),
          projectId: punch.projectId,
        },
      ])
    )
  )
  const [done, setDone] = useState<Record<string, "approved" | "discarded">>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const open = useMemo(
    () => punches.filter((punch) => !done[punch.id]),
    [punches, done]
  )

  const byDay = useMemo(() => {
    const map = new Map<string, PunchView[]>()
    for (const punch of open) {
      const bucket = map.get(punch.occurredOn)
      if (bucket) bucket.push(punch)
      else map.set(punch.occurredOn, [punch])
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [open])

  function draftFor(punch: PunchView): Draft {
    return (
      drafts[punch.id] ?? {
        summary: punch.note,
        hours: punch.hours.toFixed(2),
        projectId: punch.projectId,
      }
    )
  }

  function patch(id: string, next: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...next },
    }))
  }

  function blockerFor(punch: PunchView) {
    const draft = draftFor(punch)
    if (punch.flags.length > 0) return FLAG_LABEL[punch.flags[0]]
    return approvalBlocker({
      clientId: punch.clientId,
      projectId: draft.projectId,
      summary: draft.summary,
      hours: Number(draft.hours),
    })
  }

  function approve(punch: PunchView) {
    const draft = draftFor(punch)
    setErrors((e) => ({ ...e, [punch.id]: "" }))
    setBusy(punch.id)
    startTransition(async () => {
      const result = await approvePunchEntry({
        punchId: punch.id,
        summary: draft.summary,
        hours: Number(draft.hours),
        projectId: draft.projectId,
      })
      setBusy(null)
      if (result.ok) setDone((d) => ({ ...d, [punch.id]: "approved" }))
      else setErrors((e) => ({ ...e, [punch.id]: result.error }))
    })
  }

  function discard(punch: PunchView) {
    setErrors((e) => ({ ...e, [punch.id]: "" }))
    setBusy(punch.id)
    startTransition(async () => {
      const result = await dropPunch(punch.id)
      setBusy(null)
      if (result.ok) setDone((d) => ({ ...d, [punch.id]: "discarded" }))
      else setErrors((e) => ({ ...e, [punch.id]: result.error }))
    })
  }

  function saveTimes(punch: PunchView, endedAt: string) {
    setErrors((e) => ({ ...e, [punch.id]: "" }))
    setBusy(punch.id)
    startTransition(async () => {
      const result = await editPunch({ punchId: punch.id, endedAt })
      setBusy(null)
      if (!result.ok) setErrors((e) => ({ ...e, [punch.id]: result.error }))
    })
  }

  function approveDay(items: PunchView[]) {
    const ready = items.filter((punch) => !blockerFor(punch))
    if (ready.length === 0) return
    setBusy("day")
    startTransition(async () => {
      for (const punch of ready) {
        const draft = draftFor(punch)
        const result = await approvePunchEntry({
          punchId: punch.id,
          summary: draft.summary,
          hours: Number(draft.hours),
          projectId: draft.projectId,
        })
        if (result.ok) setDone((d) => ({ ...d, [punch.id]: "approved" }))
        else setErrors((e) => ({ ...e, [punch.id]: result.error }))
      }
      setBusy(null)
    })
  }

  const approvedCount = Object.values(done).filter((v) => v === "approved").length

  if (open.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-line bg-well px-6 py-10 text-center shadow-card">
        <p className="text-sm font-semibold text-tk-onyx">Nothing waiting</p>
        <p className="mt-1 text-sm text-ink-3">
          {approvedCount > 0
            ? `${approvedCount} ${approvedCount === 1 ? "punch is" : "punches are"} on the timesheet.`
            : "Every punch has been approved or waved off."}
        </p>
      </div>
    )
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {byDay.map(([day, items]) => {
        const readyCount = items.filter((punch) => !blockerFor(punch)).length
        const readyHours = items
          .filter((punch) => !blockerFor(punch))
          .reduce((sum, punch) => sum + Number(draftFor(punch).hours || 0), 0)
        return (
          <section key={day}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {dayLabel(day)}
              </h2>
              {readyCount > 0 ? (
                <button
                  type="button"
                  disabled={busy != null}
                  onClick={() => approveDay(items)}
                  className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-tk-linen disabled:opacity-50"
                >
                  Approve {readyCount} · {readyHours.toFixed(2)} hr
                </button>
              ) : null}
            </div>

            <ul className="mt-2 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
              {items.map((punch) => {
                const draft = draftFor(punch)
                const blocker = blockerFor(punch)
                const clientProjects = projects.filter(
                  (project) => project.clientId === punch.clientId
                )
                return (
                  <li
                    key={punch.id}
                    className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-line px-5 py-4 last:border-0"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: markColor(clientColor(punch.clientSlug)) }}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-tk-onyx">
                          {punch.clientName}
                        </p>
                        {punch.projectName ? (
                          <Badge tone="teal">{punch.projectName}</Badge>
                        ) : (
                          <Badge tone="muted">No project</Badge>
                        )}
                        <span className="font-mono text-xs tabular-nums text-ink-3">
                          {punch.elapsed} raw → {punch.hours.toFixed(2)} hr
                        </span>
                      </div>

                      <p className="mt-0.5 text-sm text-ink-3">
                        {punch.startClock} – {punch.endClock} ·{" "}
                        {sourceLabel(punch.source)}
                      </p>

                      {punch.flags.length > 0 ? (
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800">
                          <AlertTriangle className="size-3.5" />
                          {FLAG_LABEL[punch.flags[0]]}
                        </p>
                      ) : null}

                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <input
                          value={draft.summary}
                          onChange={(event) =>
                            patch(punch.id, { summary: event.target.value })
                          }
                          placeholder={
                            draft.projectId
                              ? "Session highlights (optional)"
                              : "No project — write what this was"
                          }
                          aria-label={`Summary for the ${punch.clientName} punch`}
                          className={cn(
                            "min-w-[16rem] flex-1 rounded-lg border bg-card px-3 py-1.5 text-sm text-tk-onyx outline-none placeholder:text-ink-3 focus:border-tk-teal",
                            !draft.projectId && !draft.summary.trim()
                              ? "border-warn"
                              : "border-line"
                          )}
                        />
                        {clientProjects.length > 0 ? (
                          <select
                            value={draft.projectId ?? ""}
                            onChange={(event) =>
                              patch(punch.id, {
                                projectId: event.target.value || null,
                              })
                            }
                            aria-label={`Project for the ${punch.clientName} punch`}
                            className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-tk-slate outline-none focus:border-tk-teal"
                          >
                            <option value="">— retainer</option>
                            {clientProjects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <input
                          value={draft.hours}
                          onChange={(event) =>
                            patch(punch.id, { hours: event.target.value })
                          }
                          inputMode="decimal"
                          aria-label={`Hours for the ${punch.clientName} punch`}
                          className="w-20 rounded-lg border border-line bg-card px-2.5 py-1.5 text-right text-sm tabular-nums text-tk-onyx outline-none focus:border-tk-teal"
                        />
                      </div>

                      {punch.flags.includes("crosses_midnight") ||
                      punch.flags.includes("long") ? (
                        <EndTimeFix
                          punch={punch}
                          disabled={busy != null}
                          onSave={(iso) => saveTimes(punch, iso)}
                        />
                      ) : null}

                      {errors[punch.id] ? (
                        <p className="mt-2 text-xs font-semibold text-red-700">
                          {errors[punch.id]}
                        </p>
                      ) : blocker ? (
                        <p className="mt-2 text-xs text-ink-3">{blocker}</p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={busy != null || Boolean(blocker)}
                        onClick={() => approve(punch)}
                        title={blocker ?? undefined}
                        className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-tk-linen disabled:opacity-40"
                      >
                        {busy === punch.id ? "Approving…" : "Approve"}
                      </button>
                      <button
                        type="button"
                        disabled={busy != null}
                        onClick={() => discard(punch)}
                        className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-3 hover:border-line-strong disabled:opacity-50"
                      >
                        Discard
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

/** A forgotten clock-out is fixed by editing the end, not by deleting the punch. */
function EndTimeFix({
  punch,
  disabled,
  onSave,
}: {
  punch: PunchView
  disabled: boolean
  onSave: (iso: string) => void
}) {
  const [value, setValue] = useState(() => toLocalInput(punch.endedAt))

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <label className="text-xs font-semibold text-ink-3" htmlFor={`end-${punch.id}`}>
        End time
      </label>
      <input
        id={`end-${punch.id}`}
        type="datetime-local"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-tk-onyx outline-none focus:border-tk-teal"
      />
      <button
        type="button"
        disabled={disabled || !value}
        onClick={() => onSave(new Date(value).toISOString())}
        className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal disabled:opacity-50"
      >
        Save end time
      </button>
    </div>
  )
}

function toLocalInput(iso: string | null) {
  if (!iso) return ""
  const date = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function dayLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
}
