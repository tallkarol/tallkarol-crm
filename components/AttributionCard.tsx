import type { Attribution, AttributionTouch } from "@/lib/attribution"

function TouchRows({ touch, title }: { touch?: AttributionTouch; title: string }) {
  if (!touch || Object.keys(touch).length === 0) return null
  const rows: [string, string][] = [
    ["Source", touch.utm_source || "direct"],
    ["Medium", touch.utm_medium || "—"],
    ["Campaign", touch.utm_campaign || "—"],
    ["Landing", touch.landing_page || "—"],
    ["Referrer", touch.referrer || "—"],
  ]
  if (touch.gclid) rows.push(["gclid", touch.gclid])
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-tk-slate/70">
        {title}
      </h3>
      <dl className="mt-2 grid gap-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[7rem_1fr] gap-2">
            <dt className="text-tk-slate/70">{label}</dt>
            <dd className="break-all text-tk-onyx">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

export function AttributionCard({ attribution }: { attribution: Attribution }) {
  const path = attribution.path || []
  return (
    <section className="mt-4 rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-tk-onyx">How they got here</h2>
      <div className="mt-4 grid gap-6 sm:grid-cols-2">
        <TouchRows touch={attribution.first} title="First touch" />
        <TouchRows touch={attribution.last} title="Last touch" />
      </div>
      {path.length > 0 && (
        <div className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-tk-slate/70">
            Session path
          </h3>
          <p className="mt-2 flex flex-wrap gap-1.5">
            {path.map((page, i) => (
              <span key={`${page}-${i}`} className="inline-flex items-center gap-1.5">
                <span className="rounded-full bg-tk-linen px-2 py-0.5 font-mono text-xs text-tk-slate">
                  {page}
                </span>
                {i < path.length - 1 && (
                  <span className="text-tk-slate/40" aria-hidden="true">
                    →
                  </span>
                )}
              </span>
            ))}
          </p>
        </div>
      )}
      {attribution.client_id && (
        <p className="mt-4 font-mono text-[11px] text-tk-slate/70">
          client_id {attribution.client_id}
        </p>
      )}
    </section>
  )
}
