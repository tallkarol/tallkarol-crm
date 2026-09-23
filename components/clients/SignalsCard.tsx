import Link from "next/link"
import { ArrowRight, Zap } from "lucide-react"
import { cn } from "@/lib/cn"
import type { SignalsData } from "@/lib/client-rooms"
import { markColor } from "@/lib/client-colors"
import { KIND_LABEL, KIND_TONE } from "@/lib/inbox"
import { ROUTES } from "@/lib/nav"

const EXTRA_LABEL = { approval: "Approval", proposal: "Proposal" } as const
const EXTRA_TONE = { approval: "bg-accent-soft text-accent-ink", proposal: "bg-well text-ink-2 border border-line" } as const
const MAX = 5

/**
 * The condensed Signals list beside the week: one line per item waiting on
 * you — a dot, the kind, the title, the age. No verbs; those are in the
 * Inbox room, which every row opens.
 */
export function SignalsCard({
  signals,
  clientSlug,
  max = MAX,
  stretch = false,
}: {
  signals: SignalsData
  /** The client's own room; absent on the everyone view, where rows carry their client. */
  clientSlug?: string
  max?: number
  /** Fill the column (the roster page) rather than the Board's short card. */
  stretch?: boolean
}) {
  const rows = signals.rows.slice(0, max)
  const inboxHref = clientSlug ? ROUTES.clientRoom(clientSlug, "inbox") : ROUTES.inbox
  return (
    <section className="flex min-w-0 flex-col gap-1.5" aria-label="Signals">
      <div className="flex items-center gap-2 px-0.5">
        <h2 className="flex items-center gap-1.5 font-ui text-[13px] font-bold text-tk-onyx">
          <Zap className="size-3.5" aria-hidden />
          Signals
        </h2>
        <Link href={inboxHref} className="inline-flex items-center gap-0.5 font-ui text-[11px] font-semibold text-accent-ink hover:underline">
          Inbox <ArrowRight className="size-2.5" aria-hidden />
        </Link>
        {!clientSlug ? <span className="ml-auto text-[11.5px] text-ink-3">{signals.total} need you</span> : null}
      </div>
      <div className={cn("flex flex-1 flex-col rounded-[14px] border border-line bg-card p-1.5 shadow-card", stretch ? "min-h-[320px]" : "min-h-[120px]")}>
        {rows.length === 0 ? (
          <p className="m-auto text-[12px] text-ink-3">Nothing needs you</p>
        ) : (
          rows.map((r) => {
            const label = r.kind === "approval" || r.kind === "proposal" ? EXTRA_LABEL[r.kind] : KIND_LABEL[r.kind]
            const tone = r.kind === "approval" || r.kind === "proposal" ? EXTRA_TONE[r.kind] : KIND_TONE[r.kind]
            return (
              <Link
                key={r.key}
                href={r.href}
                className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-tk-onyx hover:bg-well"
              >
                <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", r.late ? "bg-bad" : "bg-warn")} />
                {!clientSlug && r.client ? (
                  <span className="flex shrink-0 items-center gap-1 font-ui text-[10.5px] font-semibold text-ink-2">
                    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: markColor(r.client.color) }} />
                    {r.client.name}
                  </span>
                ) : null}
                <span className={cn("shrink-0 rounded-md px-1.5 py-px font-ui text-[9px] font-bold uppercase tracking-[0.06em]", tone)}>{label}</span>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <span className={cn("shrink-0 font-mono text-[10.5px]", r.late ? "font-bold text-bad" : "text-ink-3")}>{r.age}</span>
              </Link>
            )
          })
        )}
        {signals.total > max ? (
          <Link href={inboxHref} className="px-2 pb-1 pt-1.5 font-ui text-[11px] font-semibold text-accent-ink hover:underline">
            +{signals.total - max} more in the inbox
          </Link>
        ) : null}
      </div>
    </section>
  )
}
