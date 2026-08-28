import { notFound } from "next/navigation"
import { BarList, MeterList } from "@/components/insights/BarList"
import { Card } from "@/components/insights/Card"
import { CsvLink } from "@/components/insights/CsvLink"
import { EmptySnapshot } from "@/components/insights/EmptySnapshot"
import { fmtInt } from "@/lib/insights/derive"
import { getInsightsContext } from "@/lib/insights/queries"
import { TABLE_WINDOW_DAYS } from "@/lib/insights/types"

export const metadata = { title: "Traffic · Insights" }
export const dynamic = "force-dynamic"

export default async function InsightsTrafficPage({
  params,
}: {
  params: { site: string }
}) {
  const ctx = await getInsightsContext(params.site)
  if (!ctx) notFound()
  const { site, snapshot } = ctx
  if (!snapshot) return <EmptySnapshot slug={site.slug} siteName={site.name} />

  if (!snapshot.ga4.ok) {
    return (
      <div className="rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-6 py-10 text-center shadow-sm">
        <p className="text-sm font-semibold text-tk-onyx">GA4 is not connected</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-tk-slate/70">
          {snapshot.ga4.error ||
            "Add a GA4 property id to this site and grant the service account, then refresh."}{" "}
          The Health tab has the exact steps.
        </p>
      </div>
    )
  }

  const ga4 = snapshot.ga4

  return (
    <>
      <p className="text-xs text-tk-slate/60">
        Breakdowns cover the fixed {TABLE_WINDOW_DAYS}-day fetch window · realtime is as of
        the last fetch
      </p>

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <Card
          title="Channels"
          right={<CsvLink slug={site.slug} table="channels" />}
        >
          <BarList rows={ga4.channels} />
        </Card>

        <Card
          title="Events"
          right={<CsvLink slug={site.slug} table="events" />}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <tbody>
                {ga4.events.map((row) => (
                  <tr key={row.name} className="border-b border-tk-slate/[.06] last:border-0">
                    <td className="px-5 py-2 font-medium text-tk-onyx">{row.name}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-tk-onyx">
                      {fmtInt(row.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card
        title={`Landing pages · top ${ga4.pages.length}`}
        right={<CsvLink slug={site.slug} table="pages" />}
        className="mt-3"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-tk-slate/12 text-left text-[10px] font-bold uppercase tracking-wide text-tk-slate/55">
                <th className="px-5 py-2 font-bold">Page</th>
                <th className="px-3 py-2 text-right font-bold">Sessions</th>
                <th className="px-5 py-2 text-right font-bold">Key events</th>
              </tr>
            </thead>
            <tbody>
              {ga4.pages.map((row) => (
                <tr key={row.name} className="border-b border-tk-slate/[.06] last:border-0">
                  <td className="max-w-[26rem] truncate px-5 py-2 font-medium text-tk-onyx" title={row.name}>
                    {row.name}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-tk-onyx">
                    {fmtInt(row.sessions)}
                  </td>
                  <td className="px-5 py-2 text-right tabular-nums text-tk-onyx">
                    {fmtInt(row.keyEvents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        <Card title="Devices" right={<CsvLink slug={site.slug} table="devices" />}>
          <MeterList rows={ga4.devices} />
        </Card>
        <Card title="Countries" right={<CsvLink slug={site.slug} table="countries" />}>
          <BarList rows={ga4.countries.slice(0, 8)} />
        </Card>
        <Card title="Realtime at last fetch">
          <div className="px-5 py-3.5">
            <p className="text-3xl font-semibold tabular-nums text-tk-onyx">
              {fmtInt(ga4.realtimeUsers)}
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60">
              Active users
            </p>
          </div>
          {ga4.realtimeEvents.length > 0 ? (
            <div className="border-t border-tk-slate/[.06]">
              {ga4.realtimeEvents.map((row) => (
                <p
                  key={row.name}
                  className="flex justify-between border-b border-tk-slate/[.06] px-5 py-2 text-xs last:border-0"
                >
                  <span className="font-medium text-tk-onyx">{row.name}</span>
                  <span className="tabular-nums text-tk-onyx">{fmtInt(row.value)}</span>
                </p>
              ))}
            </div>
          ) : (
            <p className="border-t border-tk-slate/[.06] px-5 py-3 text-xs text-tk-slate/60">
              No events in the 30 minutes before the last fetch.
            </p>
          )}
        </Card>
      </div>
    </>
  )
}
