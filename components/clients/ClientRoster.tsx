"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ClientAvatar } from "@/components/clients/ClientAvatar"
import { ClientStatusMenu } from "@/components/clients/ClientStatusMenu"
import { HoursMeter } from "@/components/clients/HoursMeter"
import type { ClientStatus } from "@/db/schema"
import type { RosterRow } from "@/lib/client-hub"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { CLIENT_STATUS_LABEL, CLIENT_STATUSES, formatMoney } from "@/lib/work"
import { Card } from "@/components/ui/Card"

const FILTERS = [
  { id: "all", label: "All" },
  { id: "retainer", label: "Retainer" },
  { id: "project", label: "Active project" },
  { id: "product", label: "Products" },
  { id: "dormant", label: "Dormant" },
] as const

type FilterId = (typeof FILTERS)[number]["id"]

function fmtHours(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "")
}

function meetingLabel(iso: string) {
  const d = new Date(iso)
  return {
    day: d.toLocaleDateString(undefined, { weekday: "short" }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  }
}

export function ClientRoster({ rows }: { rows: RosterRow[] }) {
  const [filter, setFilter] = useState<FilterId>("all")
  const [status, setStatus] = useState<ClientStatus | "all">("all")
  const [q, setQ] = useState("")

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter(
      (row) =>
        (filter === "all" || row.tags.includes(filter)) &&
        (status === "all" || row.status === status) &&
        (!term || row.name.toLowerCase().includes(term))
    )
  }, [rows, filter, status, q])

  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter clients">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold",
                filter === f.id
                  ? "border-ink bg-ink text-canvas"
                  : "border-line bg-card text-ink-3 hover:border-line-strong"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="roster-status">
            Status
          </label>
          <select
            id="roster-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as ClientStatus | "all")}
            className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-tk-onyx focus:border-tk-teal"
          >
            <option value="all">All statuses</option>
            {CLIENT_STATUSES.map((id) => (
              <option key={id} value={id}>
                {CLIENT_STATUS_LABEL[id]}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Find a client…"
            aria-label="Find a client"
            className="w-52 rounded-lg border border-line bg-card px-3 py-1.5 text-sm text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal"
          />
        </div>
      </div>

      <Card className="mt-3 overflow-hidden">
        <div
          aria-hidden="true"
          className="hidden grid-cols-[minmax(200px,1.5fr)_130px_64px_minmax(110px,1fr)_100px_16px] items-center gap-4 border-b border-line px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3 md:grid"
        >
          <span>Client</span>
          <span>Hours this month</span>
          <span>Tasks</span>
          <span>Next meeting</span>
          <span className="text-right">Outstanding</span>
          <span />
        </div>

        {visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-3">
            No clients match. Clear the filter or the search above.
          </p>
        ) : (
          visible.map((row) => {
            const meeting = row.nextMeeting ? meetingLabel(row.nextMeeting.startsAt) : null
            return (
              <Link
                key={row.id}
                href={ROUTES.client(row.slug)}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-line px-5 py-3.5 last:border-0 hover:bg-well md:grid-cols-[minmax(200px,1.5fr)_130px_64px_minmax(110px,1fr)_100px_16px]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <ClientAvatar name={row.name} slug={row.slug} muted={row.dormant} />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-[14.5px] font-bold",
                        row.dormant ? "text-ink-3" : "text-tk-onyx"
                      )}
                    >
                      {row.name}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5">
                      <ClientStatusMenu clientId={row.id} status={row.status} />
                      <span
                        className={cn(
                          "truncate text-xs",
                          row.dormant ? "text-ink-3" : "text-ink-3"
                        )}
                      >
                        {row.engagement}
                      </span>
                    </span>
                  </span>
                </span>

                <span className="hidden md:block">
                  {row.hours ? (
                    <>
                      <span className="mb-1 block text-[11.5px] tabular-nums text-ink-3">
                        {fmtHours(row.hours.logged)} / {row.hours.cap} hr
                      </span>
                      <HoursMeter logged={row.hours.logged} cap={row.hours.cap} />
                    </>
                  ) : (
                    <span className="text-xs text-ink-3">{row.hoursNote || "—"}</span>
                  )}
                </span>

                <span className="hidden text-[13px] md:block">
                  {row.openTasks > 0 ? (
                    <>
                      <span className="tabular-nums text-tk-onyx">{row.openTasks}</span>
                      {row.overdueTasks > 0 ? (
                        <span className="block text-[11px] font-semibold text-bad">
                          {row.overdueTasks} overdue
                        </span>
                      ) : row.ticketsWaiting > 0 ? (
                        <span className="block text-[11px] font-semibold text-warn">
                          ticket waiting
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </span>

                <span className="hidden text-[13px] md:block">
                  {meeting ? (
                    <>
                      <span className="text-tk-onyx">
                        {meeting.day} <span className="tabular-nums">{meeting.time}</span>
                      </span>
                      <span className="block truncate text-[11px] text-ink-3">
                        {row.nextMeeting?.title}
                      </span>
                    </>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </span>

                <span
                  className={cn(
                    "text-right text-[13px] tabular-nums",
                    row.outstandingCents > 0
                      ? (row.outstandingAgeDays ?? 0) >= 14
                        ? "font-bold text-bad"
                        : "font-semibold text-tk-onyx"
                      : "text-ink-3"
                  )}
                >
                  {row.outstandingCents > 0 ? formatMoney(row.outstandingCents) : "—"}
                </span>

                <span aria-hidden="true" className="hidden text-ink-3 md:block">
                  ›
                </span>
              </Link>
            )
          })
        )}

        <p className="border-t border-line bg-well px-5 py-2.5 text-xs text-ink-3">
          Hours meters reset on the 1st · outstanding = sent, not yet paid
        </p>
      </Card>
    </>
  )
}
