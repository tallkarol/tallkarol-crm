import Link from "next/link"
import { StatusPill } from "@/components/clients/StatusPill"
import type { PillTone } from "@/components/clients/StatusPill"
import type { HubTicket } from "@/lib/client-hub"
import { STATE_LABEL, ticketSlug } from "@/lib/support"
import type { TicketState } from "@/lib/support"
import { formatDay } from "@/lib/work"

const STATE_TONE: Record<TicketState, PillTone> = {
  open: "warn",
  progress: "teal",
  waiting: "muted",
  closed: "good",
}

export function TicketList({ tickets }: { tickets: HubTicket[] }) {
  if (tickets.length === 0) {
    return <p className="px-5 py-8 text-sm text-ink-3">No open tickets.</p>
  }
  return (
    <div className="divide-y divide-line">
      {tickets.map((t) => (
        <div key={t.id} className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={`/support/${ticketSlug(t)}`}
              className="text-[13.5px] font-bold text-tk-onyx hover:text-tk-teal"
            >
              {t.title}
            </Link>
            {t.waitingOnYouDays != null ? (
              <StatusPill tone="warn">
                Waiting on you · {t.waitingOnYouDays}d
              </StatusPill>
            ) : (
              <StatusPill tone={STATE_TONE[t.state]}>{STATE_LABEL[t.state]}</StatusPill>
            )}
          </div>
          {t.snippet ? (
            <p className="mt-2 border-l-2 border-line pl-2.5 text-[13px] leading-snug text-ink-3">
              “{t.snippet}
              {t.snippet.length >= 200 ? "…" : ""}”
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
            <span>
              {[t.submittedBy, `via ${t.source}`, formatDay(t.openedAt.toISOString().slice(0, 10))]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <Link
              href={`/support/${ticketSlug(t)}`}
              className="font-semibold text-tk-teal hover:underline"
            >
              Open in support →
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
