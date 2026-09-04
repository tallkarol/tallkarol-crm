import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { Badge } from "@/components/work/Badge"
import { Card } from "@/components/insights/Card"
import { EmptySnapshot } from "@/components/insights/EmptySnapshot"
import { LoopStrip } from "@/components/insights/LoopStrip"
import { RangeSwitcher } from "@/components/insights/RangeSwitcher"
import { isHouseSite, loadCrmSlice, windowDates } from "@/lib/insights/crm"
import { deriveWindow, fmtInt, parseRange } from "@/lib/insights/derive"
import { getInsightsContext } from "@/lib/insights/queries"

export const metadata = { title: "Conversions · Insights" }
export const dynamic = "force-dynamic"

const QUAL_TONE: Record<string, "teal" | "neutral" | "muted"> = {
  fit: "teal",
  maybe: "neutral",
  unreviewed: "neutral",
  pass: "muted",
}

export default async function InsightsConversionsPage({
  params,
  searchParams,
}: {
  params: { site: string }
  searchParams: { range?: string }
}) {
  const ctx = await getInsightsContext(params.site)
  if (!ctx) notFound()
  const { site, snapshot } = ctx

  // Inquiries only flow from the house property — no tab for client sites.
  if (!isHouseSite(site)) redirect(`/insights/${site.slug}`)
  if (!snapshot) return <EmptySnapshot slug={site.slug} siteName={site.name} />

  const range = parseRange(searchParams.range)
  const win = deriveWindow(snapshot, range)
  const { start, end } = win.current.length
    ? windowDates(win.current[0].date, win.current[win.current.length - 1].date)
    : windowDates("1970-01-01", "1970-01-01")
  const crm = await loadCrmSlice(start, end)

  const leadEvents = snapshot.ga4.events.filter((row) =>
    /lead|form|cta|contact/i.test(row.name)
  )

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-ink-3">
          {win.label} · GA4 events joined with this CRM&rsquo;s inquiries
        </p>
        <RangeSwitcher />
      </div>

      <Card title="Sessions to signed-off leads" note="GA4 ↔ CRM" className="mt-4">
        <LoopStrip
          sessions={win.totals.sessions}
          keyEvents={win.totals.keyEvents}
          crm={crm}
        />
      </Card>

      <div className="mt-3 grid gap-3 xl:grid-cols-12">
        <Card title="Inquiries in this window" className="xl:col-span-8">
          {crm.recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-3">
              No inquiries landed in this window.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wide text-ink-3">
                    <th className="px-5 py-2 font-bold">Who</th>
                    <th className="px-3 py-2 font-bold">Source</th>
                    <th className="px-3 py-2 font-bold">Qualification</th>
                    <th className="px-5 py-2 text-right font-bold">When</th>
                  </tr>
                </thead>
                <tbody>
                  {crm.recent.map((row) => (
                    <tr key={row.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5">
                        <Link
                          href={`/inquiries/${row.id}`}
                          className="font-semibold text-tk-onyx hover:text-tk-teal"
                        >
                          {row.name}
                        </Link>
                        {row.company ? (
                          <span className="ml-1.5 text-ink-3">· {row.company}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 text-tk-slate">
                        {row.sourceLabel ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={QUAL_TONE[row.qualification] ?? "neutral"}>
                          {row.qualification}
                        </Badge>
                      </td>
                      <td className="px-5 py-2.5 text-right tabular-nums text-ink-3">
                        {new Date(row.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="border-t border-line px-5 py-2.5 text-[11px] text-ink-3">
            Attribution is first/last-touch from the intake form.{" "}
            <Link href="/leads" className="font-semibold text-tk-teal hover:underline">
              Work the leads →
            </Link>
          </p>
        </Card>

        <Card
          title="Conversion-shaped events"
          note="28d · from GA4"
          className="xl:col-span-4"
        >
          {leadEvents.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-3">
              No lead, form, or CTA events in the window yet.
            </p>
          ) : (
            <div>
              {leadEvents.map((row) => (
                <p
                  key={row.name}
                  className="flex justify-between border-b border-line px-5 py-2 text-xs last:border-0"
                >
                  <span className="font-medium text-tk-onyx">{row.name}</span>
                  <span className="tabular-nums text-tk-onyx">{fmtInt(row.value)}</span>
                </p>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
