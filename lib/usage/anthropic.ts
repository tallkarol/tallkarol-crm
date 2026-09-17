import { db } from "@/db"
import { usageSnapshots } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { revalidatePath } from "next/cache"
import { dayInZone, startOfMonthInZone } from "@/lib/usage/time"
import { ageMs, isStale, latestBySource } from "@/lib/usage/snapshots"

/**
 * Anthropic Console spend for the calendar month, via the Admin API.
 *
 * Needs `ANTHROPIC_ADMIN_API_KEY` (`sk-ant-admin…`). The Messages key
 * (`sk-ant-api03…`) cannot read this and is never sent here. A typed
 * Console reading on /usage is the same row shape, so the tile does not
 * change if polling is off.
 *
 * Amounts on the wire are cents as a decimal string (`"123.45"` → $1.23).
 * We convert before storing so every reader sees dollars.
 */

const ADMIN = process.env.ANTHROPIC_ADMIN_API_KEY ?? process.env.ANTHROPIC_ADMIN_KEY ?? ""
const ENDPOINT = "https://api.anthropic.com/v1/organizations/cost_report"
const TIMEOUT_MS = 5_000

export function hasAnthropicAdminKey(): boolean {
  return ADMIN.startsWith("sk-ant-admin")
}

export type AnthropicCostPayload = {
  month_usd: number
  period_start: string
  period_end: string
  by_model: { model: string; usd: number }[]
}

type CostItem = {
  amount?: string
  model?: string | null
  description?: string | null
}

type CostBucket = {
  starting_at?: string
  ending_at?: string
  results?: CostItem[]
}

type CostReport = {
  data?: CostBucket[]
  has_more?: boolean
  next_page?: string | null
}

/** Cents-as-decimal-string → dollars. `"123.45"` is $1.23. */
export function centsStringToUsd(amount: string): number {
  const n = Number(amount)
  return Number.isFinite(n) ? n / 100 : 0
}

export function summarizeCostReport(
  report: CostReport,
  periodStart: string,
  periodEnd: string
): AnthropicCostPayload {
  const byModel = new Map<string, number>()
  let monthUsd = 0
  for (const bucket of report.data ?? []) {
    for (const item of bucket.results ?? []) {
      const usd = centsStringToUsd(String(item.amount ?? "0"))
      if (usd <= 0) continue
      monthUsd += usd
      const model = (item.model && item.model.trim()) || item.description || "other"
      byModel.set(model, (byModel.get(model) ?? 0) + usd)
    }
  }
  return {
    month_usd: Math.round(monthUsd * 100) / 100,
    period_start: periodStart,
    period_end: periodEnd,
    by_model: Array.from(byModel.entries())
      .map(([model, usd]) => ({ model, usd: Math.round(usd * 100) / 100 }))
      .sort((a, b) => b.usd - a.usd),
  }
}

async function pullPage(url: URL, signal: AbortSignal): Promise<CostReport> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "x-api-key": ADMIN,
      "anthropic-version": "2023-06-01",
    },
    signal,
    cache: "no-store",
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Anthropic cost report ${res.status}${text ? `: ${text.slice(0, 180)}` : ""}`)
  }
  return (await res.json()) as CostReport
}

export async function fetchAnthropicMonth(now: Date, tz: string): Promise<AnthropicCostPayload> {
  if (!hasAnthropicAdminKey()) throw new Error("No Anthropic Admin API key.")
  const start = startOfMonthInZone(now, tz)
  const periodStart = dayInZone(start, tz)
  const periodEnd = dayInZone(now, tz)
  const merged: CostReport = { data: [] }
  let page: string | null = null
  const signal = AbortSignal.timeout(TIMEOUT_MS)

  for (let i = 0; i < 4; i++) {
    const url = new URL(ENDPOINT)
    url.searchParams.set("starting_at", start.toISOString())
    url.searchParams.set("ending_at", now.toISOString())
    url.searchParams.set("bucket_width", "1d")
    url.searchParams.set("limit", "31")
    url.searchParams.append("group_by[]", "description")
    if (page) url.searchParams.set("page", page)
    const body = await pullPage(url, signal)
    merged.data!.push(...(body.data ?? []))
    if (!body.has_more || !body.next_page) break
    page = body.next_page
  }

  return summarizeCostReport(merged, periodStart, periodEnd)
}

export async function storeAnthropicReading(
  payload: AnthropicCostPayload,
  observedAt: Date,
  basis: "api" | "manual" = "api",
  revalidate = true
) {
  await db
    .insert(usageSnapshots)
    .values({
      source: "anthropic",
      basis,
      observedAt,
      periodStart: payload.period_start,
      periodEnd: payload.period_end,
      payload,
      note: basis === "api" ? "Anthropic Admin API cost_report" : "typed from Console Cost",
    })
    .onConflictDoNothing({ target: [usageSnapshots.source, usageSnapshots.observedAt] })
  if (revalidate) {
    revalidatePath(ROUTES.usage)
    revalidatePath(ROUTES.chat)
  }
}

/**
 * Pull a fresh month if the last reading is stale and an admin key is set.
 * Failures are swallowed — the rail keeps the last good reading.
 */
export async function refreshAnthropicIfStale(now = new Date(), tz: string): Promise<void> {
  if (!hasAnthropicAdminKey()) return
  const latest = (await latestBySource()).anthropic
  if (latest && !isStale("anthropic", latest.observedAt, now) && ageMs(latest.observedAt, now) < 12 * 3_600_000) {
    return
  }
  try {
    const payload = await fetchAnthropicMonth(now, tz)
    await storeAnthropicReading(payload, now, "api", false)
  } catch {
    /* keep the last reading */
  }
}
