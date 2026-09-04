import Link from "next/link"
import { Check } from "lucide-react"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { clearedLabel, type UnreadSummary, type UnreadTone } from "@/lib/unread"

/**
 * "Did something arrive that I haven't seen?" — answered as a small table:
 * one row per kind, fixed columns, so the eye learns one shape and scans
 * down the count column. Tone colours the row that needs you first.
 *
 * Quiet is still quiet: at zero the table gives way to a single line, so
 * the loud state is unmissable by contrast.
 */

const ROW_TONE: Record<UnreadTone, string> = {
  clear: "",
  lead: "text-tk-teal",
  warn: "bg-warn/10 text-warn",
  bad: "bg-bad/10 text-bad",
}

type Row = {
  label: string
  count: number
  state: string
  oldest: string | null
  tone: UnreadTone
  href: string
}

export function Unread({ summary }: { summary: UnreadSummary }) {
  // Before migration 0027 there is no triage state to read — say nothing
  // rather than claim a confident zero.
  if (!summary.ready) return null

  const quiet = summary.total === 0
  const rows: Row[] = [
    {
      label: "Tickets",
      count: summary.tickets.count,
      state: summary.tickets.state,
      oldest: summary.tickets.oldest,
      tone: summary.tickets.tone,
      href: summary.tickets.href,
    },
    {
      label: "Leads",
      count: summary.leads.count,
      state: summary.leads.state,
      oldest: summary.leads.oldest,
      tone: summary.leads.tone,
      href: summary.leads.href,
    },
    {
      label: "Emails",
      count: summary.otherMail,
      state: summary.otherMail > 0 ? "unread" : "nothing new",
      oldest: summary.otherMailOldest,
      tone: "clear",
      href: ROUTES.inbox,
    },
    {
      label: "Events",
      count: summary.otherEvents,
      state: summary.otherEvents > 0 ? "info only" : "nothing new",
      oldest: summary.otherEventsOldest,
      tone: "clear",
      href: ROUTES.inbox,
    },
  ]
  const loudest = summary.tickets.count > 0 ? summary.tickets : summary.leads.count > 0 ? summary.leads : null
  const cleared = clearedLabel(summary.clearedAt)

  return (
    <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-card">
      <div className="flex items-center gap-2.5 border-b border-tk-slate/10 px-[18px] py-3">
        <h2 className="font-ui text-[13.5px] font-bold tracking-tight text-tk-onyx">Unread</h2>
        <span
          className={cn(
            "grid h-5 min-w-5 place-items-center rounded-full border px-1.5 font-ui text-[11px] font-bold tabular-nums",
            quiet
              ? "border-tk-slate/15 bg-tk-linen text-tk-slate"
              : "border-transparent bg-bad/10 text-bad"
          )}
        >
          {summary.total}
        </span>
        <Link
          href={ROUTES.inbox}
          className="ml-auto font-ui text-xs font-bold text-tk-slate/70 hover:text-tk-onyx hover:underline"
        >
          Inbox →
        </Link>
      </div>

      <div className="px-[18px] py-3">
        {quiet ? (
          <p className="flex items-center gap-2 text-[13px] text-tk-slate/70">
            <span
              aria-hidden
              className="grid size-4 shrink-0 place-items-center rounded-full bg-accent/10 text-tk-teal"
            >
              <Check className="size-2.5" strokeWidth={3} />
            </span>
            <span>
              Nothing new{cleared ? ` since you last cleared the inbox, ${cleared}` : ""}.
              {summary.needsReply > 0
                ? ` ${summary.needsReply} ${summary.needsReply === 1 ? "item is" : "items are"} still waiting on a reply from you.`
                : ""}
            </span>
          </p>
        ) : (
          <>
            <div
              role="table"
              aria-label="Unread by kind"
              className="overflow-hidden rounded-lg border border-line text-[12.5px]"
            >
              <div
                role="row"
                className="grid h-7 grid-cols-[0.9fr_0.7fr_1.6fr_0.8fr] bg-tk-linen font-ui text-[9.5px] font-bold uppercase tracking-[0.08em] text-tk-slate/70"
              >
                <Cell head>Kind</Cell>
                <Cell head>Unread</Cell>
                <Cell head>State</Cell>
                <Cell head>Oldest</Cell>
              </div>
              {rows.map((row, i) => (
                <Link
                  key={row.label}
                  role="row"
                  href={row.href}
                  aria-label={`${row.label}: ${row.count} unread, ${row.state}${row.oldest ? `, oldest ${row.oldest}` : ""}`}
                  className={cn(
                    "grid min-h-8 grid-cols-[0.9fr_0.7fr_1.6fr_0.8fr] border-t border-line text-tk-slate transition-colors hover:brightness-[0.97]",
                    i % 2 === 1 && "bg-well",
                    row.count > 0 ? ROW_TONE[row.tone] : ""
                  )}
                >
                  <Cell className="font-ui text-[12px] font-semibold text-current">{row.label}</Cell>
                  <Cell
                    className={cn(
                      "font-display text-[15px] font-semibold tabular-nums",
                      row.count === 0 ? "font-medium text-tk-slate/70" : "text-current"
                    )}
                  >
                    {row.count}
                  </Cell>
                  {/* The one cell that can run long ("3 urgent, unanswered") — it
                      wraps to a second line instead of clipping. */}
                  <Cell className="whitespace-normal py-1 text-[11px] leading-[1.2]">{row.state}</Cell>
                  <Cell className="text-[11.5px] tabular-nums">{row.oldest ?? "—"}</Cell>
                </Link>
              ))}
            </div>
            {loudest ? (
              <p className="mt-2 truncate text-xs text-tk-slate/70">
                {loudest.detail}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

function Cell({
  children,
  head,
  className,
}: {
  children: React.ReactNode
  head?: boolean
  className?: string
}) {
  return (
    <span
      role={head ? "columnheader" : "cell"}
      className={cn(
        "grid h-full place-items-center truncate border-l border-line px-1 text-center first:border-l-0",
        !head && "self-stretch",
        className
      )}
    >
      {children}
    </span>
  )
}
