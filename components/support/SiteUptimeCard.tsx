import Link from "next/link"
import { clientColor, markColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { ageLabel } from "@/lib/support"
import {
  formatRatio,
  hostnameOf,
  statusLabel,
  type SiteUptime,
  type UptimeStatus,
} from "@/lib/uptimerobot"

const STRIP = 24

/**
 * One monitor, one tile, four to a row. Everything that doesn't fit — the
 * ratios, the interval, the full ping history — is a click away in the peek,
 * which is what keeps eight of these to a single screen.
 */
export function SiteUptimeCard({
  row,
  peekHref,
}: {
  row: SiteUptime
  peekHref: string
}) {
  const { site, monitor } = row
  const slug = site.client?.slug ?? site.slug
  const color = site.client ? clientColor(site.client.slug) : "rgba(15,22,21,.22)"
  const status: UptimeStatus = monitor?.status ?? "unknown"
  const bad = status === "down" || status === "seems_down"
  const idle = status === "paused" || status === "pending" || status === "unknown"
  const last = monitor?.pings[monitor.pings.length - 1]
  const pings = monitor?.pings.slice(-STRIP) ?? []
  const peak = Math.max(1, ...pings.map((p) => p.ms))

  return (
    <Link
      href={peekHref}
      scroll={false}
      className="group flex overflow-hidden rounded-xl border border-line bg-card shadow-card transition-colors hover:border-line-strong"
    >
      <span aria-hidden className="w-[3px] shrink-0" style={{ background: markColor(color) }} />
      <div className="min-w-0 flex-1 px-3 py-2">
        <p className="flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-3">
            {site.client?.name ?? "House"}
          </span>
          <span
            aria-hidden
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              bad ? "bg-bad" : idle ? "bg-line-strong" : "bg-good"
            )}
          />
        </p>
        <p className="mt-0.5 truncate text-[13px] font-semibold text-tk-onyx">
          {site.name}
        </p>
        <p className="truncate font-mono text-[10.5px] text-ink-3">
          {hostnameOf(monitor?.url || site.origin) || site.slug}
        </p>
        <p
          className={cn(
            "mt-1 flex items-baseline gap-1.5 font-mono text-[10.5px]",
            bad ? "font-semibold text-bad" : "text-ink-3"
          )}
        >
          <span>{monitor ? statusLabel(status) : "unmatched"}</span>
          {monitor ? (
            <>
              <span className="text-ink-3">·</span>
              <span>{formatRatio(monitor.ratio30)} 30d</span>
            </>
          ) : null}
          {last ? (
            <>
              <span className="text-ink-3">·</span>
              <span className="text-ink-3">{ageLabel(last.at)} ago</span>
            </>
          ) : null}
        </p>
        <span className="mt-1.5 flex h-3.5 items-end gap-px" aria-hidden>
          {pings.length === 0
            ? Array.from({ length: STRIP }, (_, i) => (
                <span key={i} className="min-w-0 flex-1 rounded-[1px] bg-well" style={{ height: "20%" }} />
              ))
            : pings.map((ping) => (
                <span
                  key={ping.at.toISOString()}
                  className="min-w-0 flex-1 rounded-[1px] bg-good opacity-70"
                  style={{ height: `${Math.max(12, Math.round((ping.ms / peak) * 100))}%` }}
                />
              ))}
        </span>
      </div>
    </Link>
  )
}
