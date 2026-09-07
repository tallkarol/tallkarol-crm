import { cn } from "@/lib/cn"
import { Card } from "@/components/ui/Card"
import type { BudgetView } from "@/components/chat/types"

function money(cents: number): string {
  const d = cents / 100
  return d < 10 && d !== Math.round(d) ? `$${d.toFixed(2)}` : `$${Math.round(d)}`
}

/**
 * Where the month stands, in the two currencies that matter: the Cursor
 * pool (large, included) and the $400 of Other Models. The reserve line is
 * drawn on the bar because it is the number that actually changes routing —
 * past it, routine work stops being allowed to spend.
 *
 * Compact on purpose: it sits under the thread list, and the list is what
 * the sidebar is for.
 */
export function BudgetMeters({ budget }: { budget: BudgetView }) {
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
    <Card
      surface="well"
      radius="xl"
      elevation="none"
      className="mx-3 mb-3 mt-1.5 flex flex-col gap-2 px-3 pb-[11px] pt-2.5"
      aria-label="This month's model budget"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
          {budget.period}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-ink-3">
          reserve {money(other.reserveCents)}
        </span>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-ui text-xs font-semibold text-tk-onyx">Other models</span>
          <span className="font-mono text-[11px] tabular-nums text-ink-3">
            {money(other.spentCents)} / {money(other.limitCents)}
          </span>
        </div>
        <div className="relative mt-1.5 h-[5px] rounded-full bg-line">
          <div
            className={cn("absolute inset-y-0 left-0 rounded-full", fill)}
            style={{ width: `${pct}%` }}
          />
          <span
            className="absolute -bottom-[3px] -top-[3px] w-px bg-ink-3"
            style={{ left: `${reserveAt}%` }}
            title="Routine work stops spending here"
            aria-hidden
          />
        </div>
        <p className="mt-1.5 text-[10.5px] leading-[1.4] text-ink-3">
          {other.cutoff
            ? "Cut off. Escalations run on Grok XHigh instead."
            : other.routineExhausted
              ? "Routine work has spent its share. The rest is held for escalations."
              : `Reserved for escalations past ${money(other.limitCents - other.reserveCents)}.`}
        </p>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="font-ui text-xs font-semibold text-tk-onyx">Cursor pool</span>
        <span className="font-mono text-[11px] tabular-nums text-ink-3">
          {money(budget.cursor.spentCents)} · {budget.cursor.turns} turns
        </span>
      </div>
    </Card>
  )
}
