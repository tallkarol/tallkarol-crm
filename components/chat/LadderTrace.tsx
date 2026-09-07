import { ArrowUpRight, Check, Loader2, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { dollars, durationLabel, modelLabel, modelPool } from "@/lib/chat/format"
import type { ChatTurn } from "@/db/schema"

/**
 * The rungs a question actually climbed, as a footnote under the reply.
 *
 * One turn renders as a quiet line; two or more render as a chain, with the
 * detector that promoted each step. This reads the billing rows directly,
 * so what the trace claims and what the month was charged cannot disagree.
 */
export function LadderTrace({ turns }: { turns: ChatTurn[] }) {
  if (turns.length === 0) return null

  const cents = turns.reduce((sum, turn) => sum + Number(turn.costCents), 0)
  const ms = turns.reduce((sum, turn) => sum + elapsed(turn), 0)

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-8 font-ui text-[11px] font-medium text-ink-3">
      {turns.map((turn, i) => (
        <span key={turn.id} className="inline-flex items-center gap-2">
          {i > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-warn">
              <ArrowUpRight className="size-[11px]" aria-hidden />
              {turn.detector || "escalated"}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <StatusMark status={turn.status} />
            <span className={cn(modelPool(turn.model) === "other" ? "text-warn" : "text-ink-2")}>
              {modelLabel(turn.model)}
            </span>
          </span>
        </span>
      ))}
      {cents > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span className="font-mono tabular-nums">{dollars(cents)}</span>
        </>
      ) : null}
      {ms > 0 ? (
        <>
          <span aria-hidden>·</span>
          <span>{durationLabel(ms)}</span>
        </>
      ) : null}
      {turns.some((t) => t.status === "failed" && t.error) ? (
        <span className="basis-full text-bad">
          {turns.filter((t) => t.status === "failed" && t.error).map((t) => t.error).join(" · ")}
        </span>
      ) : null}
    </div>
  )
}

function elapsed(turn: ChatTurn): number {
  if (!turn.finishedAt) return 0
  const from = turn.startedAt ?? turn.claimedAt ?? turn.createdAt
  return Math.max(0, new Date(turn.finishedAt).getTime() - new Date(from).getTime())
}

function StatusMark({ status }: { status: ChatTurn["status"] }) {
  if (status === "done") return <Check className="size-[11px] text-good" aria-label="done" />
  if (status === "failed") return <X className="size-[11px] text-bad" aria-label="failed" />
  if (status === "cancelled") return <X className="size-[11px] text-ink-3" aria-label="cancelled" />
  if (status === "queued") {
    return <span className="size-1.5 rounded-full bg-ink-3" aria-label="queued" />
  }
  return <Loader2 className="size-[11px] animate-spin text-accent-ink" aria-label="running" />
}
