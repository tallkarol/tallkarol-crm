import { PageHeader } from "@/components/PageHeader"
import { RevenueChart } from "@/components/dashboard/RevenueChart"
import { db } from "@/db"
import { chartColor, CHART_ORDER } from "@/lib/client-colors"
import { getGoals } from "@/lib/goals"
import { formatMoney } from "@/lib/work"

export const metadata = { title: "Revenue" }
export const dynamic = "force-dynamic"

const MONTHS_SHOWN = 16

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}
function monthLabel(d: Date) {
  return `${d.toLocaleDateString("en-US", { month: "short" })} ${String(d.getFullYear()).slice(2)}`
}

export default async function RevenuePage() {
  const [invoices, goals] = await Promise.all([
    db.query.invoices.findMany({ with: { client: true } }),
    getGoals(),
  ])
  const now = new Date()

  const months: { key: string; label: string }[] = []
  for (let i = MONTHS_SHOWN - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ key: monthKey(d), label: monthLabel(d) })
  }
  const byMonth = new Map<string, Record<string, number>>()
  for (const inv of invoices) {
    const key = inv.issuedOn.slice(0, 7)
    const bucket = byMonth.get(key) ?? {}
    bucket[inv.client.slug] = (bucket[inv.client.slug] ?? 0) + inv.amountCents
    byMonth.set(key, bucket)
  }
  const points = months.map((m) => ({ month: m.label, values: byMonth.get(m.key) ?? {} }))
  const presentSlugs = new Set(points.flatMap((p) => Object.keys(p.values)))
  const series = CHART_ORDER.filter((slug) => presentSlugs.has(slug)).map((slug) => ({
    slug,
    name: invoices.find((i) => i.client.slug === slug)?.client.name ?? slug,
  }))
  const chartTotal = points.reduce(
    (s, p) => s + Object.values(p.values).reduce((a, b) => a + b, 0),
    0
  )

  return (
    <>
      <PageHeader title="Revenue" />

      <section className="mt-8 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tk-slate/10 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-tk-onyx">Revenue by month</h2>
          <span className="text-xs tabular-nums text-tk-slate/60">
            {goals.annualCents ? (
              <>
                {now.getFullYear()} YTD{" "}
                {formatMoney(
                  invoices
                    .filter((i) => i.issuedOn.startsWith(String(now.getFullYear())))
                    .reduce((s, i) => s + i.amountCents, 0)
                )}{" "}
                of {formatMoney(goals.annualCents)} goal ·{" "}
              </>
            ) : null}
            last {MONTHS_SHOWN} months · {formatMoney(chartTotal)}
          </span>
        </div>
        <div className="px-3 pt-4">
          <RevenueChart points={points} series={series} />
        </div>
        <div className="flex flex-wrap gap-4 px-5 pb-4 pt-2 text-xs text-tk-slate/80">
          {series.map((s) => (
            <span key={s.slug} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-[3px]"
                style={{ background: chartColor(s.slug) }}
              />
              {s.name}
            </span>
          ))}
        </div>
      </section>
    </>
  )
}
