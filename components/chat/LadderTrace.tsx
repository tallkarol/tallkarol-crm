import { ArrowUpRight, Check, Loader2, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { MODELS, type ModelKey } from "@/lib/chat/models"
import type { ChatTurn } from "@/db/schema"

/**
 * The rungs a question actually climbed.
 *
 * One turn renders as a quiet footnote; two or more render as a chain, with
 * the detector that promoted each step. This reads the billing rows directly,
 * so what the trace claims and what the month was charged cannot disagree.
 */
export function LadderTrace({ turns }: { turns: ChatTurn[] }) {
  if (turns.length === 0) return null

  const cents = turns.reduce((sum, turn) => sum + Number(turn.costCents), 0)

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-3">
      {turns.map((turn, i) => {
        const spec = MODELS[turn.model as ModelKey]
        return (
          <span key={turn.id} className="inline-flex items-center gap-1.5">
            {i > 0 ? (
              <span className="inline-flex items-center gap-1 text-warn">
                <ArrowUpRight className="size-3" />
                {turn.detector ? `${turn.detector} → ` : ""}
              </span>
            ) : null}
            <StatusDot status={turn.status} />
            <span
              className={cn(
                "font-medium",
                turn.pool === "other" ? "text-warn" : "text-tk-slate"
              )}
            >
              {spec?.label ?? turn.model}
            </span>
          </span>
        )
      })}
      {cents > 0 ? (
        <span className="font-mono">· ${(cents / 100).toFixed(3)}</span>
      ) : null}
    </div>
  )
}

function StatusDot({ status }: { status: ChatTurn["status"] }) {
  if (status === "done") return <Check className="size-3 text-good" />
  if (status === "failed") return <X className="size-3 text-bad" />
  if (status === "queued") {
    return <span className="size-1.5 rounded-full bg-tk-slate" aria-hidden />
  }
  return <Loader2 className="size-3 animate-spin text-accent-ink" />
}
