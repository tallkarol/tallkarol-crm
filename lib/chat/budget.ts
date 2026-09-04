import { and, gte, sql } from "drizzle-orm"
import { db } from "@/db"
import { chatTurns } from "@/db/schema"
import type { ChatPool } from "@/db/schema"
import { MODELS, type ModelKey } from "@/lib/chat/models"

/**
 * The pool ledger.
 *
 * Ultra includes $400 of Other Models a month plus a large, unpublished
 * Cursor Models allowance. We can only meter what we run, so this prices our
 * own turns from the registry and treats the total as a FLOOR: the SDK does
 * not report subagent tokens, and cost settles late. Reconcile against the
 * Cursor dashboard rather than trusting this to the cent.
 *
 * The reserve is the point. Left alone, ordinary work drifts onto premium
 * models and the escalations that actually need them arrive to an empty
 * allowance in week three. So routine work is capped well below the ceiling
 * and the rest is held back for the ladder's top rungs.
 */

/** Ultra's included Other Models allowance, in cents. */
export const OTHER_POOL_CENTS = 400_00

/** Held for escalations. Routine work may spend the difference. */
export const OTHER_RESERVE_CENTS = 250_00

export const ALERT_AT = 0.6
export const WARN_AT = 0.8
/** Past this, routing refuses the Other pool and falls back to Grok XHigh. */
export const CUTOFF_AT = 0.9

export type PoolSpend = {
  pool: ChatPool
  cents: number
  turns: number
}

export type BudgetState = {
  periodStart: Date
  other: {
    spentCents: number
    limitCents: number
    reserveCents: number
    fraction: number
    /** Routine (non-escalation) work is refused past the reserve line. */
    routineExhausted: boolean
    /** Everything is refused past the cutoff. */
    cutoff: boolean
    level: "ok" | "alert" | "warn" | "cutoff"
  }
  cursor: {
    spentCents: number
    turns: number
  }
  totalCents: number
}

/**
 * Both pools reset with the monthly billing cycle. We do not know Karol's
 * billing day, so the calendar month is the approximation — documented in
 * CHAT.md, and wrong by at most a few days of spend.
 */
export function periodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export async function poolSpend(now = new Date()): Promise<PoolSpend[]> {
  const start = periodStart(now)
  const rows = await db
    .select({
      pool: chatTurns.pool,
      cents: sql<string>`coalesce(sum(${chatTurns.costCents}), 0)`,
      turns: sql<number>`count(*)::int`,
    })
    .from(chatTurns)
    .where(and(gte(chatTurns.createdAt, start)))
    .groupBy(chatTurns.pool)

  return rows.map((row) => ({
    pool: row.pool,
    cents: Number(row.cents) || 0,
    turns: row.turns,
  }))
}

export async function budgetState(now = new Date()): Promise<BudgetState> {
  const spend = await poolSpend(now)
  const other = spend.find((s) => s.pool === "other")
  const cursor = spend.find((s) => s.pool === "cursor")

  const spentCents = other?.cents ?? 0
  const fraction = spentCents / OTHER_POOL_CENTS

  const level: BudgetState["other"]["level"] =
    fraction >= CUTOFF_AT
      ? "cutoff"
      : fraction >= WARN_AT
        ? "warn"
        : fraction >= ALERT_AT
          ? "alert"
          : "ok"

  return {
    periodStart: periodStart(now),
    other: {
      spentCents,
      limitCents: OTHER_POOL_CENTS,
      reserveCents: OTHER_RESERVE_CENTS,
      fraction,
      routineExhausted: spentCents >= OTHER_POOL_CENTS - OTHER_RESERVE_CENTS,
      cutoff: fraction >= CUTOFF_AT,
      level,
    },
    cursor: {
      spentCents: cursor?.cents ?? 0,
      turns: cursor?.turns ?? 0,
    },
    totalCents: spend.reduce((sum, s) => sum + s.cents, 0),
  }
}

export type Gate =
  | { allowed: true; model: ModelKey }
  | { allowed: false; model: ModelKey; reason: string; fallback: ModelKey }

/**
 * The last thing between a routing decision and a spend.
 *
 * `escalation` marks a turn that earned its way up a ladder — those may draw
 * on the reserve. Routine first-rung work may not. When the Other pool is
 * refused, the caller drops to the best model in the Cursor pool rather than
 * failing the turn, because a slightly worse answer beats no answer.
 */
export function gate(
  want: ModelKey,
  budget: BudgetState,
  opts: { escalation?: boolean } = {}
): Gate {
  const spec = MODELS[want]
  const fallback: ModelKey = "grok-4.6-xhigh"

  if (!spec || spec.pool !== "other") return { allowed: true, model: want }

  if (budget.other.cutoff) {
    return {
      allowed: false,
      model: want,
      fallback,
      reason: `Other Models is at ${(budget.other.fraction * 100).toFixed(0)}% of $400. Holding the rest — running ${MODELS[fallback].label} instead.`,
    }
  }

  if (budget.other.routineExhausted && !opts.escalation) {
    return {
      allowed: false,
      model: want,
      fallback,
      reason: `Routine work has spent its share of the $400; the remainder is reserved for escalations. Running ${MODELS[fallback].label} instead.`,
    }
  }

  return { allowed: true, model: want }
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}
