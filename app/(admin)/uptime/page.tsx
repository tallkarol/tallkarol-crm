import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { PeekRouter, peekHref } from "@/components/peek/PeekRouter"
import { AppHealthCard } from "@/components/support/AppHealthCard"
import { MonitorRow } from "@/components/support/MonitorRow"
import { SiteUptimeCard } from "@/components/support/SiteUptimeCard"
import { APP_HEALTH, WIRED } from "@/lib/app-health"
import { db } from "@/db"
import { loadMonitorBoard } from "@/lib/monitors"
import { ROUTES } from "@/lib/nav"
import { ticketNumber, ticketSlug } from "@/lib/support"
import { loadSiteUptimeBoard, type SiteUptime } from "@/lib/uptimerobot"
import { Card } from "@/components/ui/Card"

export const metadata = { title: "Uptime" }
export const dynamic = "force-dynamic"

export default async function UptimePage({
  searchParams,
}: {
  searchParams: { peek?: string }
}) {
  const [board, sites] = await Promise.all([loadMonitorBoard(), loadSiteUptimeBoard()])
  const openIds = board.map((b) => b.monitor.openTicketId).filter(Boolean) as string[]
  const tickets = openIds.length
    ? await db.query.supportTickets.findMany({
        where: (t, { inArray }) => inArray(t.id, openIds),
        columns: { id: true, number: true, title: true, priority: true },
      })
    : []
  const ticketById = new Map(tickets.map((t) => [t.id, t]))
  const failing = board.filter((b) => b.monitor.failStreak > 0).length
  const down = sites.rows.filter((row) => row.monitor && row.monitor.status !== "up").length

  return (
    <>
      <PageHeader title="Uptime" />
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref={ROUTES.uptime} />
      ) : null}

      <section className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            Apps
          </h2>
          {!WIRED ? (
            <p className="rounded-full border border-dashed border-line-strong px-2 py-0.5 font-mono text-[10.5px] text-ink-3">
              preview · nothing polled yet
            </p>
          ) : null}
        </div>
        <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">
          {APP_HEALTH.length} {APP_HEALTH.length === 1 ? "app" : "apps"} · server,
          frontend, latest run, email
        </p>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {APP_HEALTH.map((app) => (
            <AppHealthCard
              key={app.slug}
              app={app}
              peekHref={peekHref(ROUTES.uptime, "app", app.slug)}
            />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Sites
        </h2>
        {sites.rows.length === 0 ? (
          <Card surface="well" elevation="none" className="mt-2 max-w-2xl border-dashed p-6 text-sm text-tk-slate">
            <p className="font-semibold text-tk-onyx">No site monitors wired</p>
            <p className="mt-1.5 text-ink-3">
              {sites.configured
                ? "UptimeRobot is reachable. Attach a monitor id to a site:"
                : "Add a read-only UPTIMEROBOT_API_KEY, then attach a monitor id to a site:"}
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-tk-onyx px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-[#CFD8D4]">
              <code>{`npm run site:discover
npm run site:set -- <slug> uptimeMonitorId <id>`}</code>
            </pre>
          </Card>
        ) : (
          <>
            <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">
              {sites.rows.length} {sites.rows.length === 1 ? "monitor" : "monitors"}
              {sites.error ? ` · ${sites.error}` : down ? ` · ${down} down` : " · all up"}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {sortSites(sites.rows).map((row) => (
                <SiteUptimeCard
                  key={row.site.id}
                  row={row}
                  peekHref={peekHref(ROUTES.uptime, "site", row.site.slug)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Jobs
        </h2>
        {board.length === 0 ? (
          <Card surface="well" elevation="none" className="mt-2 max-w-2xl border-dashed p-6 text-sm text-tk-slate">
            <p className="font-semibold text-tk-onyx">No jobs yet</p>
            <p className="mt-1.5 text-ink-3">
              A job monitor is a scheduled run you expect to see. Wire the app, then add the job:
            </p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-tk-onyx px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-[#CFD8D4]">
              <code>{`npm run wire:app -- artist-house "Artist House" artist-house "Next.js"
npm run wire:monitor -- artist-house-daily-ingest "Daily ingest" \\
  artist-house 1440 180 "11:30 UTC daily" 720`}</code>
            </pre>
            <p className="mt-3 text-ink-3">
              The app posts each run to{" "}
              <code className="rounded bg-well px-1 py-0.5 text-xs">/api/events/run</code>. A
              window that closes with no run raises a ticket on its own.
            </p>
          </Card>
        ) : (
          <>
            <p className="mt-1.5 font-mono text-[11.5px] text-ink-3">
              {board.length} {board.length === 1 ? "job" : "jobs"}
              {failing ? ` · ${failing} failing` : " · all healthy"}
            </p>
            <Card className="mt-3 overflow-hidden">
              {board.map(({ monitor, runs }) => {
                const ticket = monitor.openTicketId ? ticketById.get(monitor.openTicketId) : null
                return (
                  <MonitorRow
                    key={monitor.id}
                    monitor={monitor}
                    runs={runs}
                    ticket={
                      ticket
                        ? {
                            href: `/support/${ticketSlug(ticket)}`,
                            label: `${ticketNumber(ticket)} · ${ticket.priority}`,
                          }
                        : null
                    }
                  />
                )
              })}
            </Card>
            <p className="mt-3 text-xs text-ink-3">
              Each monitor sets how often a missed window is looked for, so detection
            follows the engagement rather than one global setting. The sweeper runs on
            Railway cron —{" "}
              <code className="rounded bg-well px-1 py-0.5 text-[11px]">
                GET /api/monitors/sweep
              </code>{" "}
              on Railway cron. Tickets it raises land in{" "}
              <Link href={ROUTES.support} className="font-semibold text-tk-teal hover:underline">
                Support
              </Link>
              .
            </p>
          </>
        )}
      </section>
    </>
  )
}

/** House first, then a client's sites adjacent — the accent stripes read as groups. */
function sortSites(rows: SiteUptime[]) {
  return [...rows].sort((a, b) => {
    const ac = a.site.client?.name ?? ""
    const bc = b.site.client?.name ?? ""
    if (ac !== bc) return ac.localeCompare(bc)
    return a.site.name.localeCompare(b.site.name)
  })
}
