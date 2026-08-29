import Link from "next/link"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import type { AttentionItem, TimesheetDashboard } from "@/lib/timesheet-dashboard"
import { formatMoney } from "@/lib/work"

/**
 * The landing view. Live engagements, what is leaking, and where the year went
 * — so `/timesheet` opens on answers instead of a filter.
 */
export function DashboardBoard({ data }: { data: TimesheetDashboard }) {
  return (
    <div className="mt-6 flex flex-col gap-4">
      <Tiles data={data} />
      <Engagements data={data} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Attention items={data.attention} />
        <MonthBars data={data} />
      </div>
    </div>
  )
}

function Tile({
  label,
  value,
  note,
  tone = "muted",
  href,
}: {
  label: string
  value: string
  note: string
  tone?: "muted" | "good" | "warn"
  href?: string
}) {
  const body = (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-tk-onyx">
        {value}
      </p>
      <p
        className={cn(
          "mt-0.5 text-[11px] font-medium",
          tone === "good" && "text-emerald-700",
          tone === "warn" && "text-amber-700",
          tone === "muted" && "text-tk-slate/60"
        )}
      >
        {note}
      </p>
    </>
  )

  const className =
    "rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm"

  if (href) {
    return (
      <Link
        href={href}
        className={cn(className, "transition-colors hover:border-tk-teal/40")}
      >
        {body}
      </Link>
    )
  }
  return <div className={className}>{body}</div>
}

function Tiles({ data }: { data: TimesheetDashboard }) {
  const delta = data.hoursThisMonth - data.hoursLastMonth
  const waiting = data.pendingPunches + data.unloggedMeetings

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Tile
        label={`Hours · ${monthLabel(data.month)}`}
        value={data.hoursThisMonth.toLocaleString("en-US", {
          maximumFractionDigits: 2,
        })}
        note={
          data.hoursLastMonth > 0
            ? `on pace for ${data.projectedHours} · last month ${data.hoursLastMonth}`
            : `on pace for ${data.projectedHours}`
        }
        tone={delta >= 0 ? "good" : "muted"}
      />
      <Tile
        label="Unbilled value"
        value={data.unbilledCents > 0 ? formatMoney(data.unbilledCents) : "—"}
        note={`${data.unbilledHours} hr across ${data.unbilledMonths} ${data.unbilledMonths === 1 ? "month" : "months"}`}
        href={ROUTES.timesheetSheets}
      />
      <Tile
        label="Awaiting approval"
        value={String(waiting)}
        note={
          waiting === 0
            ? "nothing waiting"
            : `${data.pendingPunches} ${data.pendingPunches === 1 ? "punch" : "punches"} · ${data.unloggedMeetings} ${data.unloggedMeetings === 1 ? "meeting" : "meetings"}`
        }
        tone={waiting > 0 ? "warn" : "muted"}
        href={ROUTES.timesheetReview}
      />
      <Tile
        label="Last logged"
        value={lastLoggedLabel(data.daysSinceLastEntry)}
        note={
          data.streakDays > 0
            ? `${data.streakDays}-day streak`
            : "no streak running"
        }
        tone={
          data.daysSinceLastEntry != null && data.daysSinceLastEntry > 3
            ? "warn"
            : "muted"
        }
      />
    </div>
  )
}

function Engagements({ data }: { data: TimesheetDashboard }) {
  if (data.engagements.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-6 py-8 text-center">
        <p className="text-sm font-semibold text-tk-onyx">No live retainers</p>
        <p className="mt-1 text-sm text-tk-slate/70">
          Retainers marked active show their month against their cap here.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {data.engagements.map((row) => {
        const color = clientColor(row.clientSlug)
        const pct =
          row.capHours > 0
            ? Math.min(100, Math.round((row.hours / row.capHours) * 100))
            : row.hours > 0
              ? 100
              : 0
        const over = row.overBy > 0
        return (
          <Link
            key={row.clientId}
            href={ROUTES.timesheetFor(row.clientSlug, data.month)}
            className="flex flex-col gap-2.5 rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm transition-colors hover:border-tk-teal/40"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: over ? "#B45309" : color }}
              />
              <p className="truncate text-sm font-semibold text-tk-onyx">
                {row.clientName}
              </p>
              <p className="ml-auto shrink-0 font-mono text-xs tabular-nums text-tk-slate/70">
                {row.hours} / {row.capHours}
              </p>
            </div>

            <div
              className="h-1.5 overflow-hidden rounded-full bg-tk-linen"
              role="img"
              aria-label={`${row.hours} of ${row.capHours} hours`}
            >
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${pct}%`,
                  backgroundColor: over ? "#B45309" : color,
                }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-tk-slate/60">
              <span>
                {over
                  ? `${row.overBy} hr over cap`
                  : row.valueCents != null
                    ? `${formatMoney(row.valueCents)} · ${pct}% of cap`
                    : `${pct}% of cap`}
              </span>
              <span>{sinceLabel(row.lastLoggedOn)}</span>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

const SEVERITY_COLOR: Record<AttentionItem["severity"], string> = {
  critical: "#8E3521",
  warning: "#B45309",
  note: "#6E7A77",
}

function Attention({ items }: { items: AttentionItem[] }) {
  return (
    <section className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
        Needs attention
      </h2>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-tk-slate/60">
          Nothing unbilled, nothing waiting, nothing over cap.
        </p>
      ) : (
        <ul className="mt-1.5">
          {items.map((item) => (
            <li key={item.id} className="border-b border-tk-slate/10 last:border-0">
              <Link
                href={item.href}
                className="group flex items-center gap-3 py-2.5 text-sm"
              >
                <span
                  aria-hidden
                  className="h-8 w-[3px] shrink-0 rounded-full"
                  style={{ backgroundColor: SEVERITY_COLOR[item.severity] }}
                />
                <span className="min-w-0 flex-1 text-tk-slate">{item.text}</span>
                {item.amount ? (
                  <span className="shrink-0 font-mono text-xs tabular-nums text-tk-slate/70">
                    {item.amount}
                  </span>
                ) : null}
                <span className="shrink-0 text-[11px] font-semibold text-tk-teal group-hover:underline">
                  {item.action} →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function MonthBars({ data }: { data: TimesheetDashboard }) {
  const max = Math.max(1, ...data.series.map((row) => row.hours))
  return (
    <section className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
          Hours · last 12 months
        </h2>
        <Link
          href={ROUTES.timesheetSheets}
          className="text-[11px] font-semibold text-tk-teal hover:underline"
        >
          All sheets →
        </Link>
      </div>

      <ol className="mt-3 flex h-24 items-end gap-1.5">
        {data.series.map((row, index) => {
          const current = index === data.series.length - 1
          const height = row.hours > 0 ? Math.max(4, (row.hours / max) * 100) : 2
          return (
            <li key={row.month} className="flex-1">
              <Link
                href={`${ROUTES.timesheetSheets}?year=${row.month.slice(0, 4)}`}
                title={`${row.full} — ${row.hours} hr`}
                className="block"
              >
                <span
                  className={cn(
                    "block rounded-t-sm transition-colors",
                    current ? "bg-tk-teal" : "bg-tk-teal/20 hover:bg-tk-teal/40"
                  )}
                  style={{ height: `${height}%`, minHeight: 2 }}
                />
              </Link>
            </li>
          )
        })}
      </ol>
      <ol className="mt-1.5 flex gap-1.5">
        {data.series.map((row) => (
          <li
            key={row.month}
            className="flex-1 text-center font-mono text-[9px] text-tk-slate/50"
          >
            {row.label}
          </li>
        ))}
      </ol>
    </section>
  )
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long" })
}

function lastLoggedLabel(days: number | null) {
  if (days == null) return "Never"
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  return `${days} days ago`
}

function sinceLabel(iso: string | null) {
  if (!iso) return "never logged"
  const [y, m, d] = iso.split("-").map(Number)
  const then = Date.UTC(y, m - 1, d)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const days = Math.round((today - then) / 86_400_000)
  if (days <= 0) return "logged today"
  if (days === 1) return "yesterday"
  return `${days} days ago`
}
