"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ClientAvatar } from "@/components/clients/ClientAvatar"
import { HoursMeter } from "@/components/clients/HoursMeter"
import type { RosterRow } from "@/lib/client-hub"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { formatMoney } from "@/lib/work"

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
  const [q, setQ] = useState("")

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase()
    return rows.filter(
      (row) =>
        (filter === "all" || row.tags.includes(filter)) &&
        (!term || row.name.toLowerCase().includes(term))
    )
  }, [rows, filter, q])

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
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
                  ? "border-tk-onyx bg-tk-onyx text-white"
                  : "border-tk-slate/20 bg-white text-tk-slate/70 hover:border-tk-slate/40"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a client…"
          aria-label="Find a client"
          className="w-52 rounded-lg border border-tk-slate/20 bg-white px-3 py-1.5 text-sm text-tk-onyx placeholder:text-tk-slate/40 focus:border-tk-teal focus:outline-none"
        />
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
        <div
          aria-hidden="true"
          className="hidden grid-cols-[minmax(200px,1.5fr)_130px_64px_minmax(110px,1fr)_100px_16px] items-center gap-4 border-b border-tk-slate/10 px-5 py-2.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-tk-slate/50 md:grid"
        >
          <span>Client</span>
          <span>Hours this month</span>
          <span>Tasks</span>
          <span>Next meeting</span>
          <span className="text-right">Outstanding</span>
          <span />
        </div>

        {visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-tk-slate/60">
            No clients match. Clear the filter or the search above.
          </p>
        ) : (
          visible.map((row) => {
            const meeting = row.nextMeeting ? meetingLabel(row.nextMeeting.startsAt) : null
            return (
              <Link
                key={row.id}
                href={ROUTES.client(row.slug)}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-tk-slate/10 px-5 py-3.5 last:border-0 hover:bg-tk-linen/50 md:grid-cols-[minmax(200px,1.5fr)_130px_64px_minmax(110px,1fr)_100px_16px]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <ClientAvatar name={row.name} slug={row.slug} muted={row.dormant} />
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "block truncate text-[14.5px] font-bold",
                        row.dormant ? "text-tk-slate/50" : "text-tk-onyx"
                      )}
                    >
                      {row.name}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-xs",
                        row.dormant ? "text-tk-slate/40" : "text-tk-slate/70"
                      )}
                    >
                      {row.engagement}
                    </span>
                  </span>
                </span>

                <span className="hidden md:block">
                  {row.hours ? (
                    <>
                      <span className="mb-1 block text-[11.5px] tabular-nums text-tk-slate/70">
                        {fmtHours(row.hours.logged)} / {row.hours.cap} hr
                      </span>
                      <HoursMeter logged={row.hours.logged} cap={row.hours.cap} />
                    </>
                  ) : (
                    <span className="text-xs text-tk-slate/40">{row.hoursNote || "—"}</span>
                  )}
                </span>

                <span className="hidden text-[13px] md:block">
                  {row.openTasks > 0 ? (
                    <>
                      <span className="tabular-nums text-tk-onyx">{row.openTasks}</span>
                      {row.overdueTasks > 0 ? (
                        <span className="block text-[11px] font-semibold text-[#A32C1E]">
                          {row.overdueTasks} overdue
                        </span>
                      ) : row.ticketsWaiting > 0 ? (
                        <span className="block text-[11px] font-semibold text-[#8A5A05]">
                          ticket waiting
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-tk-slate/40">—</span>
                  )}
                </span>

                <span className="hidden text-[13px] md:block">
                  {meeting ? (
                    <>
                      <span className="text-tk-onyx">
                        {meeting.day} <span className="tabular-nums">{meeting.time}</span>
                      </span>
                      <span className="block truncate text-[11px] text-tk-slate/50">
                        {row.nextMeeting?.title}
                      </span>
                    </>
                  ) : (
                    <span className="text-tk-slate/40">—</span>
                  )}
                </span>

                <span
                  className={cn(
                    "text-right text-[13px] tabular-nums",
                    row.outstandingCents > 0
                      ? (row.outstandingAgeDays ?? 0) >= 14
                        ? "font-bold text-[#A32C1E]"
                        : "font-semibold text-tk-onyx"
                      : "text-tk-slate/40"
                  )}
                >
                  {row.outstandingCents > 0 ? formatMoney(row.outstandingCents) : "—"}
                </span>

                <span aria-hidden="true" className="hidden text-tk-slate/30 md:block">
                  ›
                </span>
              </Link>
            )
          })
        )}

        <p className="border-t border-tk-slate/10 bg-tk-linen/40 px-5 py-2.5 text-xs text-tk-slate/60">
          Hours meters reset on the 1st · outstanding = sent, not yet paid
        </p>
      </div>
    </>
  )
}
