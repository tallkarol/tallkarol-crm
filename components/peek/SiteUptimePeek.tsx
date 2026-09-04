import { eq } from "drizzle-orm"
import { GonePeek, PeekSection } from "@/components/peek/bits"
import { db } from "@/db"
import { sites } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { ageLabel } from "@/lib/support"
import {
  fetchUptimeMonitor,
  formatInterval,
  formatRatio,
  hostnameOf,
  statusLabel,
  uptimeRobotConfigured,
} from "@/lib/uptimerobot"

/**
 * Everything the condensed site tile had to drop: the three ratios, the probe
 * interval, the full response history, and the numbers behind the strip.
 */
export async function SiteUptimePeek({ slug }: { slug: string }) {
  const site = await db.query.sites.findFirst({
    where: eq(sites.slug, slug),
    with: { client: { columns: { slug: true, name: true } } },
  })
  if (!site) return <GonePeek />

  const monitor =
    site.uptimeMonitorId && uptimeRobotConfigured()
      ? await fetchUptimeMonitor(site.uptimeMonitorId).catch(() => null)
      : null

  const color = site.client ? clientColor(site.client.slug) : "rgba(15,22,21,.22)"
  const status = monitor?.status ?? "unknown"
  const bad = status === "down" || status === "seems_down"
  const host = hostnameOf(monitor?.url || site.origin) || site.slug
  const pings = monitor?.pings ?? []
  const peak = Math.max(1, ...pings.map((p) => p.ms))
  const last = pings[pings.length - 1]
  const slowest = pings.reduce<(typeof pings)[number] | null>(
    (worst, ping) => (!worst || ping.ms > worst.ms ? ping : worst),
    null
  )

  return (
    <>
      <div className="px-6 pb-5 pt-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold leading-snug text-tk-onyx">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: color }} />
          {site.name}
        </h2>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-ink-3">
          <span className={cn("font-semibold", bad ? "text-bad" : "text-tk-onyx")}>
            {monitor ? statusLabel(status) : "No monitor"}
          </span>
          <span className="text-ink-3">·</span>
          <a
            href={monitor?.url || site.origin || `https://${host}`}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-tk-teal hover:underline"
          >
            {host}
          </a>
          <span className="text-ink-3">·</span>
          <span>{site.client?.name ?? "House"}</span>
        </p>

        {monitor ? (
          <div className="mt-4 grid grid-cols-3 gap-1.5">
            {(
              [
                ["24h", monitor.ratio1],
                ["7d", monitor.ratio7],
                ["30d", monitor.ratio30],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="rounded-lg border border-line px-2 py-1.5 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                  {label}
                </p>
                <p
                  className={cn(
                    "font-mono text-[14px] font-semibold",
                    value != null && value < 99.9 ? "text-warn" : "text-tk-onyx"
                  )}
                >
                  {formatRatio(value)}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {monitor ? (
        <>
          <PeekSection title={`Response · last ${pings.length} checks`}>
            <span className="flex h-12 items-end gap-px" aria-hidden>
              {pings.length === 0 ? (
                <span className="font-mono text-[11.5px] text-ink-3">no history yet</span>
              ) : (
                pings.map((ping) => (
                  <span
                    key={ping.at.toISOString()}
                    title={`${ping.ms} ms · ${ping.at.toISOString().slice(0, 16).replace("T", " ")} UTC`}
                    className="min-w-0 flex-1 rounded-[1px] bg-good opacity-70"
                    style={{ height: `${Math.max(8, Math.round((ping.ms / peak) * 100))}%` }}
                  />
                ))
              )}
            </span>
            <dl className="mt-3 space-y-1.5">
              <Row label="Average" value={monitor.avgResponseMs != null ? `${Math.round(monitor.avgResponseMs)} ms` : "—"} />
              <Row label="Slowest" value={slowest ? `${slowest.ms} ms · ${ageLabel(slowest.at)} ago` : "—"} />
              <Row label="Last check" value={last ? `${last.ms} ms · ${ageLabel(last.at)} ago` : "—"} />
            </dl>
          </PeekSection>

          <PeekSection title="Monitor">
            <dl className="space-y-1.5">
              <Row label="UptimeRobot" value={`#${monitor.id}`} />
              <Row label="Name" value={monitor.name || "—"} />
              <Row label="Probe" value={formatInterval(monitor.intervalSec)} />
              <Row label="URL" value={monitor.url || "—"} />
            </dl>
          </PeekSection>
        </>
      ) : (
        <PeekSection title="Monitor">
          <p className="text-sm text-ink-3">
            {site.uptimeMonitorId
              ? "A monitor id is attached but UptimeRobot did not return it — check the read-only key."
              : "No monitor attached yet."}
          </p>
          <pre className="mt-3 overflow-x-auto rounded-lg bg-tk-onyx px-3.5 py-3 font-mono text-[11px] leading-relaxed text-[#CFD8D4]">
            <code>{`npm run site:discover
npm run site:set -- ${site.slug} uptimeMonitorId <id>`}</code>
          </pre>
        </PeekSection>
      )}

      <PeekSection title="Site">
        <dl className="space-y-1.5">
          <Row label="Slug" value={site.slug} />
          <Row label="Client" value={site.client?.name ?? "House"} />
          <Row label="GA4" value={site.ga4PropertyId || "—"} />
          <Row label="Search Console" value={site.gscSiteUrl || "—"} />
        </dl>
      </PeekSection>
    </>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-[12px] text-ink-3">{label}</dt>
      <dd className="min-w-0 truncate text-right font-mono text-[11.5px] text-tk-onyx">
        {value}
      </dd>
    </div>
  )
}
