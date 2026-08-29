import Link from "next/link"
import type { Monitor, MonitorRun } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { ageLabel } from "@/lib/support"

type MonitorWithClient = Monitor & { client?: { slug: string; name: string } | null }

/** Thirty runs as a heartbeat strip — the shape of the last month at a glance. */
export function MonitorRow({
  monitor,
  runs,
  ticket,
}: {
  monitor: MonitorWithClient
  runs: MonitorRun[]
  ticket: { href: string; label: string } | null
}) {
  const color = monitor.client ? clientColor(monitor.client.slug) : "rgba(15,22,21,.22)"
  const last = runs[runs.length - 1]
  const failing = monitor.failStreak > 0
  const overdue = isOverdue(monitor)

  return (
    <div className="flex border-b border-tk-slate/[0.07] last:border-0">
      <span aria-hidden className="w-[3px] shrink-0" style={{ background: color }} />
      <div className="min-w-0 flex-1 px-3.5 py-2.5">
        <p className="truncate text-[13.5px] font-semibold text-tk-onyx">{monitor.name}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-tk-slate/60">
          <span className="font-semibold text-tk-slate/80">
            {monitor.client?.name ?? "Unassigned"}
          </span>
          <span className="text-tk-slate/25">·</span>
          <span>{monitor.scheduleNote || `every ${monitor.expectEveryMinutes} min`}</span>
          {monitor.paused ? (
            <>
              <span className="text-tk-slate/25">·</span>
              <span className="rounded bg-tk-linen px-1.5 font-mono text-[10px]">paused</span>
            </>
          ) : null}
          {ticket ? (
            <>
              <span className="text-tk-slate/25">·</span>
              <Link href={ticket.href} className="font-semibold text-tk-teal hover:underline">
                {ticket.label}
              </Link>
            </>
          ) : null}
          {overdue && !failing ? (
            <>
              <span className="text-tk-slate/25">·</span>
              <span className="font-semibold text-[#8A5A05]">window open</span>
            </>
          ) : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3 px-3.5 py-2.5">
        <span className="hidden items-end gap-[2px] sm:flex" aria-hidden>
          {runs.length === 0 ? (
            <span className="font-mono text-[11px] text-tk-slate/35">no runs yet</span>
          ) : (
            runs.map((run) => (
              <span
                key={run.id}
                title={`${run.status} · ${run.startedAt.toISOString().slice(0, 16).replace("T", " ")}`}
                className={cn("w-1.5 rounded-[2px]", beatTone(run.status), beatHeight(run.status))}
              />
            ))
          )}
        </span>
        <span
          className={cn(
            "w-[5.5rem] text-right font-mono text-[11px]",
            failing ? "font-semibold text-[#B4322A]" : "text-tk-slate/45"
          )}
        >
          {last
            ? `${statusWord(last.status)} ${ageLabel(last.startedAt)} ago`
            : "never run"}
        </span>
      </div>
    </div>
  )
}

function isOverdue(monitor: Monitor) {
  if (monitor.paused) return false
  const since = monitor.lastRunAt ?? monitor.createdAt
  const dueBy = since.getTime() + (monitor.expectEveryMinutes + monitor.graceMinutes) * 60_000
  return Date.now() > dueBy
}

function statusWord(status: string) {
  if (status === "succeeded") return "ok"
  if (status === "running") return "running"
  if (status === "missed") return "missed"
  if (status === "partial") return "partial"
  return "failed"
}

function beatTone(status: string) {
  if (status === "succeeded") return "bg-[#2E7D57]"
  if (status === "partial") return "bg-[#A97A22]"
  if (status === "running") return "bg-tk-teal/50"
  if (status === "missed") return "bg-tk-slate/20"
  return "bg-[#B4322A]"
}

function beatHeight(status: string) {
  return status === "missed" ? "h-2.5" : "h-5"
}
