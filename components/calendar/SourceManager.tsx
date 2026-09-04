"use client"

import { useState, useTransition } from "react"
import { Badge } from "@/components/work/Badge"
import { SOURCE_KIND_LABEL, type CalendarSnapshot } from "@/lib/calendar-types"
import {
  addCalendarSource,
  deleteCalendarSource,
  syncCalendars,
  updateCalendarSource,
} from "@/lib/calendar-actions"
import type { CalendarSourceKind } from "@/db/schema"
import { cn } from "@/lib/cn"

const field =
  "mt-1 w-full rounded-xl border border-line bg-card px-3 py-2 text-sm text-tk-onyx outline-none focus:border-tk-teal"
const label =
  "text-[11px] font-semibold uppercase tracking-wide text-ink-3"

function relative(iso: string | null) {
  if (!iso) return "never"
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  return `${Math.round(hours / 24)} d ago`
}

export function SourceManager({ snapshot }: { snapshot: CalendarSnapshot }) {
  const [kind, setKind] = useState<CalendarSourceKind>("google")
  const [name, setName] = useState("")
  const [externalId, setExternalId] = useState("")
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function act(run: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setNotice(null)
    startTransition(async () => {
      const result = await run()
      if (!result.ok) setNotice(result.error ?? "That did not work.")
      else if (done) setNotice(done)
    })
  }

  const hasCalCom = snapshot.sources.some((source) => source.kind === "cal_com")

  return (
    <>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <ConfigRow
          label="Google service account"
          ok={snapshot.config.google}
          okText="Configured. Share each calendar with the service account address."
          missingText="Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_KEY."
        />
        <ConfigRow
          label="Cal.com"
          ok={snapshot.config.calCom}
          okText="API key present."
          missingText="Set CALCOM_API_KEY."
        />
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-tk-onyx">Connected</h2>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              act(async () => {
                const result = await syncCalendars()
                if (!result.ok) return result
                return result.errors.length
                  ? { ok: false, error: result.errors.join(" · ") }
                  : { ok: true }
              }, "Synced.")
            }
            className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal disabled:opacity-50"
          >
            {pending ? "Working…" : "Sync all"}
          </button>
        </div>

        {snapshot.sources.length === 0 ? (
          <p className="px-5 py-8 text-sm text-ink-3">
            Nothing connected yet.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {snapshot.sources.map((source) => (
              <li key={source.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: source.color }}
                      />
                      <p className="font-medium text-tk-onyx">{source.label}</p>
                      <Badge tone="neutral">
                        {SOURCE_KIND_LABEL[source.kind]}
                      </Badge>
                      {source.writable ? (
                        <Badge tone="teal">Destination</Badge>
                      ) : null}
                      {!source.enabled ? <Badge tone="muted">Off</Badge> : null}
                    </div>
                    {source.externalId ? (
                      <p className="mt-1 break-all text-sm text-ink-3">
                        {source.externalId}
                      </p>
                    ) : null}
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        source.lastError ? "text-tk-slate" : "text-ink-3"
                      )}
                    >
                      {source.lastError
                        ? source.lastError
                        : `Last synced ${relative(source.lastSyncedAt)}`}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        act(() =>
                          updateCalendarSource(source.id, {
                            enabled: !source.enabled,
                          })
                        )
                      }
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal disabled:opacity-50"
                    >
                      {source.enabled ? "Turn off" : "Turn on"}
                    </button>
                    {source.kind === "google" && !source.writable ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          act(
                            () =>
                              updateCalendarSource(source.id, { writable: true }),
                            `${source.label} now receives events made here.`
                          )
                        }
                        className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal disabled:opacity-50"
                      >
                        Make destination
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => act(() => deleteCalendarSource(source.id))}
                      className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold text-ink-3 hover:border-line-strong disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {notice ? (
        <p className="mt-3 rounded-2xl border border-line bg-card px-4 py-2.5 text-sm text-tk-slate shadow-card">
          {notice}
        </p>
      ) : null}

      <section className="mt-6 rounded-2xl border border-line bg-card px-5 py-4 shadow-card">
        <h2 className="text-sm font-semibold text-tk-onyx">Connect a calendar</h2>

        <div className="mt-3 flex flex-wrap gap-2">
          {(["google", "cal_com"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              disabled={option === "cal_com" && hasCalCom}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40",
                kind === option
                  ? "bg-accent text-tk-linen"
                  : "border border-line text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
              )}
            >
              {SOURCE_KIND_LABEL[option]}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label>
            <span className={label}>Name</span>
            <input
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "cal_com" ? "Cal.com bookings" : "Work — Gmail"}
            />
          </label>
          {kind === "google" ? (
            <label>
              <span className={label}>Calendar id</span>
              <input
                className={field}
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="you@gmail.com"
              />
            </label>
          ) : null}
        </div>

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            act(async () => {
              const result = await addCalendarSource({ kind, label: name, externalId })
              if (result.ok) {
                setName("")
                setExternalId("")
              }
              return result
            }, "Connected. Run a sync to pull events.")
          }
          className="mt-4 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-tk-linen disabled:opacity-50"
        >
          Connect
        </button>

        {kind === "google" ? (
          <p className="mt-3 max-w-2xl text-xs text-ink-3">
            In Google Calendar, open that calendar’s settings → <em>Share with
            specific people</em> → add the service account address. Use{" "}
            <em>See all event details</em> to read it, or <em>Make changes to
            events</em> if it should also be the destination calendar.
          </p>
        ) : null}
      </section>
    </>
  )
}

function ConfigRow({
  label: title,
  ok,
  okText,
  missingText,
}: {
  label: string
  ok: boolean
  okText: string
  missingText: string
}) {
  return (
    <div className="rounded-2xl border border-line bg-card px-5 py-3 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          {title}
        </p>
        <Badge tone={ok ? "teal" : "muted"}>{ok ? "Ready" : "Missing"}</Badge>
      </div>
      <p className="mt-2 text-sm text-tk-onyx">{ok ? okText : missingText}</p>
    </div>
  )
}
