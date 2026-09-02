"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { setTaskDone } from "@/lib/task-actions"
import {
  layoutRows,
  STAGE_LABEL,
  type HubTask,
  type RenderRow,
} from "@/lib/task-view"
import { CADENCE_LABEL } from "@/lib/work"

/**
 * Rows, banded by whatever the list is ordered by. The tint flips on a *run* of
 * the sort key, so a band is always a true statement about the rows inside it —
 * unlike every-other-row striping, where the boundary means nothing.
 */
export function TaskRows({
  tasks,
  sortBy,
  grouping,
  peekBase,
}: {
  tasks: HubTask[]
  sortBy: string
  grouping: string
  /** Where the peek query lands — the hub, or an entity page. */
  peekBase: string
}) {
  const { rows, groups } = layoutRows(tasks, sortBy, grouping)

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-tk-slate/20 bg-white/70 px-6 py-10 text-center">
        <p className="text-sm font-semibold text-tk-onyx">Nothing here</p>
        <p className="mt-1 text-sm text-tk-slate/70">
          Clear a filter above, or add a task to this view.
        </p>
      </div>
    )
  }

  if (groups) {
    // Each group is its own card so its header can sit *outside* the clipping
    // box — a sticky element inside an overflow-hidden ancestor sticks to that
    // ancestor, which never scrolls, so it would never actually stick.
    return (
      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <section key={group.key}>
            <h3 className="sticky top-0 z-10 -mx-1 mb-1 flex items-center gap-2 rounded-lg bg-tk-linen/90 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-tk-slate/60 backdrop-blur">
              {group.color ? (
                <span
                  aria-hidden
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: clientColor(group.color) }}
                />
              ) : null}
              {group.title}
              <span className="ml-auto font-mono text-tk-slate/40">
                {group.rows.length}
              </span>
            </h3>
            <div className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
              {group.rows.map((row) => (
                <Row key={row.id} row={row} peekBase={peekBase} />
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      {rows.map((row) => (
        <Row key={row.id} row={row} peekBase={peekBase} />
      ))}
    </div>
  )
}

function Row({ row, peekBase }: { row: RenderRow; peekBase: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [done, setDone] = useState(row.status === "done")
  const color = row.clientSlug
    ? clientColor(row.clientSlug)
    : row.productSlug
      ? clientColor(row.productSlug)
      : "#8A9794"
  const houseName = row.clientName ?? row.productName
  const showProductBesideClient = Boolean(row.clientName && row.productName)

  function toggle() {
    const next = !done
    setDone(next)
    startTransition(async () => {
      const result = await setTaskDone(row.id, next)
      if (!result.ok) setDone(!next)
      router.refresh()
    })
  }

  const join = peekBase.includes("?") ? "&" : "?"

  return (
    <div
      className={cn(
        "grid grid-cols-[3px_auto_minmax(0,1fr)_auto] items-stretch border-b border-tk-slate/10 last:border-b-0",
        row.band === 1 ? "bg-tk-linen/25" : "bg-white",
        row.first && "border-t border-tk-slate/15 first:border-t-0"
      )}
    >
      <span aria-hidden style={{ backgroundColor: color }} />

      <span className="flex items-start pl-3 pt-[11px]">
        <button
          type="button"
          onClick={toggle}
          aria-pressed={done}
          aria-label={`Mark ${row.title} ${done ? "open" : "done"}`}
          className={cn(
            "grid size-[17px] shrink-0 place-items-center rounded-[5px] border-[1.5px] transition-colors",
            done
              ? "border-tk-teal bg-tk-teal"
              : "border-tk-slate/30 bg-white hover:border-tk-teal"
          )}
        >
          <svg width="10" height="8" viewBox="0 0 11 9" fill="none" aria-hidden>
            <path
              d="M1 4.5L4 7.5L10 1.5"
              stroke="#F1EADC"
              strokeWidth="2"
              strokeLinecap="round"
              className={done ? "opacity-100" : "opacity-0"}
            />
          </svg>
        </button>
      </span>

      <span className="min-w-0 px-3 py-2.5">
        <Link
          href={`${peekBase}${join}peek=task:${row.id}`}
          scroll={false}
          className={cn(
            "block truncate text-[13.5px] font-semibold hover:text-tk-teal",
            done ? "text-tk-slate/45 line-through" : "text-tk-onyx"
          )}
        >
          {row.title}
        </Link>
        <span className="mt-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11.5px] text-tk-slate/60">
          {houseName ? (
            <span
              className="inline-flex shrink-0 items-center gap-1.5 font-semibold text-tk-slate"
              style={{ color }}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              {houseName}
            </span>
          ) : (
            <span className="shrink-0 text-tk-slate/40">No client</span>
          )}
          {showProductBesideClient ? (
            <>
              <span aria-hidden className="shrink-0 text-tk-slate/25">
                ·
              </span>
              <span className="shrink-0">{row.productName}</span>
            </>
          ) : row.projectName ? (
            <>
              <span aria-hidden className="shrink-0 text-tk-slate/25">
                ·
              </span>
              <span className="shrink-0">{row.projectName}</span>
            </>
          ) : row.retainerName ? (
            <>
              <span aria-hidden className="shrink-0 text-tk-slate/25">
                ·
              </span>
              <span className="shrink-0">retainer</span>
            </>
          ) : null}
          {row.deliverableLabel ? (
            <span className="shrink-0 rounded bg-tk-linen px-1.5 font-mono text-[10px] text-tk-slate/70">
              {row.deliverableLabel}
            </span>
          ) : null}
          {row.labels.map((label) => (
            <span
              key={label}
              className="shrink-0 rounded bg-tk-linen px-1.5 font-mono text-[10px] text-tk-slate/70"
            >
              {label}
            </span>
          ))}
          {row.items.total > 0 ? (
            <span className="shrink-0 rounded bg-tk-linen px-1.5 font-mono text-[10px] text-tk-slate/70">
              {row.items.done}/{row.items.total}
            </span>
          ) : null}
          {row.notes ? (
            <span className="min-w-0 truncate text-tk-slate/50">· {row.notes}</span>
          ) : null}
        </span>
      </span>

      <span className="flex items-center gap-2 px-3 py-2.5">
        <span
          aria-hidden
          title={row.priority === 1 ? "High priority" : undefined}
          className={cn(
            "size-[7px] shrink-0 rounded-full",
            row.priority === 1
              ? "bg-[#B4322A]"
              : row.priority === 3
                ? "border border-tk-slate/20"
                : "border-[1.5px] border-tk-slate/25"
          )}
        />
        {row.status === "open" && row.stage === "doing" ? (
          <Pill tone="doing">{STAGE_LABEL.doing}</Pill>
        ) : null}
        {row.waitingDays != null ? (
          <Pill tone={row.waitingDays >= 7 ? "warn" : "wait"}>
            waiting {row.waitingDays}d
          </Pill>
        ) : null}
        {row.overdueDays != null ? (
          <Pill tone="late">
            {row.overdueDays === 1 ? "1 day over" : `${row.overdueDays} days over`}
          </Pill>
        ) : null}
        {row.cadence !== "none" && row.status === "open" ? (
          <Pill tone="rep">{CADENCE_LABEL[row.cadence].toLowerCase()}</Pill>
        ) : null}
        <span className="w-[52px] shrink-0 text-right font-mono text-[11px] text-tk-slate/45">
          {dueLabel(row)}
        </span>
      </span>
    </div>
  )
}

function Pill({
  tone,
  children,
}: {
  tone: "late" | "warn" | "wait" | "doing" | "rep"
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
        tone === "late" && "bg-[#B4322A]/10 text-[#B4322A]",
        tone === "warn" && "bg-amber-100 text-amber-800",
        tone === "wait" && "bg-tk-slate/[0.07] text-tk-slate/60",
        tone === "doing" && "bg-tk-teal/10 text-tk-teal",
        tone === "rep" && "bg-emerald-50 text-emerald-800"
      )}
    >
      {children}
    </span>
  )
}

function dueLabel(row: HubTask) {
  if (row.status === "done") {
    return row.completedAt ? shortDay(row.completedAt.slice(0, 10)) : "done"
  }
  if (row.dueOn) return shortDay(row.dueOn)
  if (row.cadence !== "none" && row.periodNote) return row.periodNote.replace("by ", "")
  return "—"
}

function shortDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((date.getTime() - today.getTime()) / 86_400_000)
  if (diff === 0) return "today"
  if (diff === 1) return "tomorrow"
  if (diff > 1 && diff < 7) return date.toLocaleDateString("en-US", { weekday: "short" })
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short" })
}
