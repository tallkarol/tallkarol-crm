import { cn } from "@/lib/cn"
import { formatCents, type BudgetState } from "@/lib/chat/budget"

/**
 * Where the month stands, in the two currencies that matter: the Cursor pool
 * (large, included) and the $400 of Other Models. The reserve line is drawn
 * on the bar because it is the number that actually changes routing — past
 * it, routine work stops being allowed to spend.
 */
export function BudgetMeters({ budget }: { budget: BudgetState }) {
  const other = budget.other
  const pct = Math.min(other.fraction, 1) * 100
  const reserveAt =
    ((other.limitCents - other.reserveCents) / other.limitCents) * 100

  const fill =
    other.level === "cutoff" || other.level === "warn"
      ? "bg-bad"
      : other.level === "alert"
        ? "bg-warn"
        : "bg-accent-mark"

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 shadow-card">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          This month
        </span>
        <span className="font-mono text-[11px] text-ink-3">
          {budget.periodStart.toISOString().slice(0, 7)}
        </span>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="font-semibold text-tk-slate">Other Models</span>
          <span className="font-mono text-ink-3">
            {formatCents(other.spentCents)} / {formatCents(other.limitCents)}
          </span>
        </div>
        <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-tk-slate">
          <div
            className={cn("h-full rounded-full", fill)}
            style={{ width: `${pct}%` }}
          />
          <span
            className="absolute inset-y-0 w-px bg-ink-3"
            style={{ left: `${reserveAt}%` }}
            aria-hidden
          />
        </div>
        <p className="mt-1.5 text-[11px] text-ink-3">
          {other.cutoff
            ? "Cut off. Escalations are running on Grok XHigh instead."
            : other.routineExhausted
              ? "Routine work has spent its share. The rest is held for escalations."
              : `Reserved for escalations past ${formatCents(other.limitCents - other.reserveCents)}.`}
        </p>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="font-semibold text-tk-slate">Cursor Models</span>
          <span className="font-mono text-ink-3">
            {formatCents(budget.cursor.spentCents)} · {budget.cursor.turns} turns
          </span>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-3">
          Priced from the registry, not billed. Included on Ultra until the
          allowance runs out, then it spills into the $400 above.
        </p>
      </div>
    </div>
  )
}
