import { asc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/db"
import { appSources, sites, supportTickets, vaultEntries } from "@/db/schema"
import type { Monitor, MonitorRun } from "@/db/schema"
import { loadClientHub } from "@/lib/client-hub"
import type { ClientShell } from "@/lib/client-rooms"
import { latestDocsFor } from "@/lib/codebase-docs"
import { isOverdue, isoDay } from "@/lib/horizon"
import { loadMonitorBoard, type RunStatus } from "@/lib/monitors"
import { ROUTES } from "@/lib/nav"
import { punchlistsFor } from "@/lib/punchlists"
import { ageLabel, ticketSlug } from "@/lib/support"
import { tasksFor } from "@/lib/tasks"
import {
  formatInterval,
  formatRatio,
  hostnameOf,
  loadSiteUptimeBoard,
  statusLabel,
  type UptimeMonitor,
} from "@/lib/uptimerobot"
import {
  CONTRACT_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  PROPOSAL_STATUS_LABEL,
  REPORT_STATUS_LABEL,
} from "@/lib/work"

/**
 * The Monitors room's data: every system a client has running, assembled
 * into one flat, serialisable `SystemRow[]` so `SystemsAccordion` (a client
 * component) never has to know where any of it came from. Real sources only —
 * `lib/app-health.ts` is placeholder and never read here.
 */

/* ------------------------------------------------------------------ types */

export type SystemKind = "site" | "app" | "job"
export type SystemStatus = "ok" | "warn" | "bad" | "unwatched"
export type BarTone = "ok" | "warn" | "bad" | "idle"

export type SystemBar = { pct: number; tone: BarTone }
export type SystemSurface = { label: string; headline: string; detail: string; tone: BarTone }
export type SystemFact = readonly [string, string]

export type SystemAction = {
  label: string
  href: string
  /** primary draws attention on a row that needs it; ghost is everything else. */
  tone: "primary" | "ghost"
}

export type LinkIcon = "spec" | "insights" | "ads" | "external" | "vault" | "repo"
export type SystemLink = { label: string; icon: LinkIcon; detail: string; href: string }

export type RelatedRow = { label: string; meta: string; tone?: RelatedTone; href: string }
export type RelatedTone = "good" | "warn" | "crit" | "teal" | "muted" | "neutral"

export type SystemRelated = {
  projects: RelatedRow[]
  tasks: RelatedRow[]
  punchlists: RelatedRow[]
  tickets: RelatedRow[]
  docs: RelatedRow[]
}

export type SystemRow = {
  id: string
  kind: SystemKind
  name: string
  host: string
  status: SystemStatus
  headline: string
  checkedLabel: string
  surfaces: SystemSurface[]
  bars: SystemBar[]
  facts: SystemFact[]
  actions: SystemAction[]
  links: SystemLink[]
  related: SystemRelated
}

export type MonitorsRoomData = {
  systems: SystemRow[]
  summary: string
}

/* ------------------------------------------------------------------ small helpers */

function repoHrefFromGitRemote(remote: string | null | undefined): string | null {
  if (!remote) return null
  if (/^https?:\/\//.test(remote)) return remote.replace(/\.git$/, "")
  const ssh = /^(?:git@|ssh:\/\/git@)([^:/]+)[:/](.+?)(?:\.git)?$/.exec(remote)
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`
  return null
}

function runBarTone(status: RunStatus): BarTone {
  if (status === "succeeded") return "ok"
  if (status === "partial") return "warn"
  if (status === "running") return "idle"
  return "bad" // failed | missed
}

function runBarPct(status: RunStatus): number {
  if (status === "missed") return 28
  if (status === "running") return 18
  return 72
}

function pingBars(monitor: UptimeMonitor): SystemBar[] {
  const pings = monitor.pings.slice(-30)
  if (!pings.length) return []
  const tone: BarTone =
    monitor.status === "down" || monitor.status === "seems_down"
      ? "bad"
      : monitor.status === "paused" || monitor.status === "pending"
        ? "idle"
        : "ok"
  const peak = Math.max(1, ...pings.map((p) => p.ms))
  return pings.map((p) => ({ pct: Math.max(12, Math.round((p.ms / peak) * 100)), tone }))
}

function runBars(runs: MonitorRun[]): SystemBar[] {
  return runs.slice(-30).map((r) => ({ pct: runBarPct(r.status as RunStatus), tone: runBarTone(r.status as RunStatus) }))
}

/** "every 12h" reads better than "every 720 min" — same wording `MonitorRow` uses. */
function everyLabel(minutes: number) {
  if (minutes % 1440 === 0) {
    const days = minutes / 1440
    return days === 1 ? "daily" : `every ${days}d`
  }
  if (minutes % 60 === 0) return `every ${minutes / 60}h`
  return `every ${minutes}m`
}

/** bad > warn > ok > unwatched — so the section reads worst-first. */
const SEVERITY: Record<SystemStatus, number> = { bad: 0, warn: 1, ok: 2, unwatched: 3 }

/** The same tone ladder `applyOutcome`/`loadPanelMonitors` already use for a monitor. */
function monitorStatus(monitor: Monitor, runs: MonitorRun[]): { status: SystemStatus; last: MonitorRun | null } {
  const last = runs.length ? runs[runs.length - 1] : null
  if (monitor.paused) return { status: "warn", last }
  if (monitor.failStreak > 0) return { status: "bad", last }
  if (last?.status === "partial") return { status: "warn", last }
  if (!monitor.lastRunAt) return { status: "warn", last }
  return { status: "ok", last }
}

function monitorHeadline(monitor: Monitor, status: SystemStatus, last: MonitorRun | null): string {
  if (status === "bad") {
    const since = monitor.lastSuccessAt ? `since ${ageLabel(monitor.lastSuccessAt)} ago` : "never succeeded"
    return `${last?.status === "missed" ? "Missed" : "Failed"} · streak ${monitor.failStreak} · ${since}`
  }
  if (status === "warn") {
    if (monitor.paused) return "Paused"
    if (!monitor.lastRunAt) return "No runs recorded yet"
    if (last?.jobsTotal) return `Partial · ${last.jobsFailed} of ${last.jobsTotal} jobs failed`
    return "Partial run"
  }
  return `Succeeded · ${ageLabel(monitor.lastRunAt)} ago`
}

/* ------------------------------------------------------------------ related (client-wide, same shape on every row) */

async function loadRelated(client: ClientShell, now: Date): Promise<SystemRelated> {
  const today = isoDay(now)
  const [hub, tasks, punchlists] = await Promise.all([
    loadClientHub(client.slug, now),
    tasksFor({ clientId: client.id }, now),
    punchlistsFor({ clientId: client.id }),
  ])

  const projects = (hub?.client.projects ?? [])
    .filter((p) => p.status !== "complete")
    .map((p) => ({
      label: p.name,
      meta: PROJECT_STATUS_LABEL[p.status],
      tone: (p.status === "in_progress" ? "teal" : p.status === "on_hold" ? "warn" : "muted") as RelatedTone,
      href: ROUTES.project(p.slug),
    }))

  const openTasks = tasks
    .filter((t) => t.status === "open")
    .sort((a, b) => (a.dueOn ?? "9999-99-99").localeCompare(b.dueOn ?? "9999-99-99"))
    .slice(0, 5)
    .map((t) => {
      const over = isOverdue(t, today)
      const meta = t.dueOn ? `${over ? "overdue · " : "due "}${t.dueOn}` : "no date"
      return { label: t.title, meta, tone: (over ? "crit" : "neutral") as RelatedTone, href: `${ROUTES.clientRoom(client.slug, "monitors")}?peek=task:${t.id}` }
    })

  const punchlistRows = punchlists.map((p) => ({
    label: p.title,
    meta: `${p.progress.total} item${p.progress.total === 1 ? "" : "s"} · ${p.progress.total - p.progress.done} open`,
    href: ROUTES.punchlist(p.slug),
  }))

  const TICKET_TONE: Record<string, RelatedTone> = { open: "warn", progress: "teal", waiting: "muted", closed: "good" }
  const tickets = (hub?.openTickets ?? []).map((t) => ({
    label: `${t.title}`,
    meta: t.waitingOnYouDays != null ? `waiting ${t.waitingOnYouDays}d` : t.state,
    tone: TICKET_TONE[t.state] ?? "neutral",
    href: `/support/${ticketSlug(t)}`,
  }))

  const docs: RelatedRow[] = []
  for (const r of hub?.client.reports ?? []) {
    if (!r.slug) continue
    docs.push({ label: r.title, meta: `Report · ${REPORT_STATUS_LABEL[r.status]}`, href: ROUTES.reportDoc(r.slug) })
  }
  for (const p of hub?.client.proposals ?? []) {
    docs.push({ label: p.title, meta: `Proposal · ${PROPOSAL_STATUS_LABEL[p.status]}`, href: ROUTES.proposalDoc(p.slug) })
  }
  for (const c of hub?.client.contracts ?? []) {
    docs.push({ label: c.title, meta: `Contract · ${CONTRACT_STATUS_LABEL[c.status]}`, href: ROUTES.contract(c.slug) })
  }

  return { projects, tasks: openTasks, punchlists: punchlistRows, tickets, docs }
}

/* ------------------------------------------------------------------ per-kind assembly */

function baseLinks(clientSlug: string, vaultCount: number): SystemLink[] {
  return [
    {
      label: "Vault",
      icon: "vault",
      detail: vaultCount > 0 ? `${vaultCount} secret${vaultCount === 1 ? "" : "s"}` : "no secrets yet",
      href: `${ROUTES.vault}?client=${clientSlug}`,
    },
  ]
}

export async function loadMonitorsRoom(client: ClientShell, now = new Date()): Promise<MonitorsRoomData> {
  const [siteRows, appRows, board, siteUptime, docs, related, vaultCountRow] = await Promise.all([
    db.query.sites.findMany({ where: eq(sites.clientId, client.id), orderBy: [asc(sites.sort), asc(sites.name)] }),
    db.query.appSources.findMany({ where: eq(appSources.clientId, client.id), orderBy: [asc(appSources.name)] }),
    loadMonitorBoard(30),
    loadSiteUptimeBoard(),
    latestDocsFor(client.id),
    loadRelated(client, now),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(vaultEntries)
      .where(eq(vaultEntries.clientId, client.id)),
  ])

  const vaultCount = vaultCountRow[0]?.n ?? 0
  const links0 = baseLinks(client.slug, vaultCount)
  const uptimeByHref = new Map(siteUptime.rows.map((r) => [r.site.id, r.monitor]))
  const clientMonitors = board.filter((row) => row.monitor.client?.slug === client.slug)
  const activeAppIds = new Set(appRows.filter((a) => !a.revokedAt).map((a) => a.id))

  const openTicketIds = Array.from(
    new Set(clientMonitors.map((row) => row.monitor.openTicketId).filter((id): id is string => Boolean(id)))
  )
  const ticketRows = openTicketIds.length
    ? await db.query.supportTickets.findMany({ where: inArray(supportTickets.id, openTicketIds), columns: { id: true, number: true } })
    : []
  const ticketHrefById = new Map(ticketRows.map((t) => [t.id, `/support/${ticketSlug(t)}`]))
  const ticketAction = (ticketId: string | null): SystemAction | null =>
    ticketId && ticketHrefById.has(ticketId) ? { label: "Open ticket", href: ticketHrefById.get(ticketId)!, tone: "primary" } : null

  const systems: SystemRow[] = []

  /* -------------------------------------------------------------- sites */
  for (const site of siteRows) {
    const specDoc = docs.find((d) => d.kind === "spec" && (d.siteId === site.id || d.codebase === site.slug))
    const spec = specDoc ? (specDoc.data as { git?: { remote?: string } }) : null
    const repoHref = spec ? repoHrefFromGitRemote(spec.git?.remote) : null

    const links: SystemLink[] = []
    if (specDoc) {
      links.push({
        label: "Spec sheet",
        icon: "spec",
        detail: specDoc.generatedAt.toISOString().slice(0, 10),
        href: `${ROUTES.client(client.slug)}/codebases/${specDoc.codebase}`,
      })
    }
    if (repoHref) links.push({ label: "Repo", icon: "repo", detail: hostnameOf(repoHref), href: repoHref })
    links.push({ label: "Insights", icon: "insights", detail: "", href: `${ROUTES.insights}/${site.slug}` })
    if (site.adsCustomerId) links.push({ label: "Paid Ads", icon: "ads", detail: "", href: `${ROUTES.paidAds}/${site.slug}` })
    if (site.uptimeMonitorId) {
      links.push({
        label: "UptimeRobot",
        icon: "external",
        detail: `monitor ${site.uptimeMonitorId}`,
        href: `https://dashboard.uptimerobot.com/monitors/${site.uptimeMonitorId}`,
      })
    }
    links.push(...links0)

    if (!site.uptimeMonitorId) {
      systems.push({
        id: `site:${site.id}`,
        kind: "site",
        name: site.name,
        host: hostnameOf(site.origin) || site.slug,
        status: "unwatched",
        headline: "Not watched · no UptimeRobot monitor",
        checkedLabel: "never checked",
        surfaces: [],
        bars: [],
        facts: [
          ["Host", hostnameOf(site.origin) || "—"],
          ["Analytics", [site.ga4PropertyId && "GA4", site.gscSiteUrl && "GSC", site.adsCustomerId && "Ads"].filter(Boolean).join(" · ") || "none wired"],
        ],
        actions: [{ label: "Watch with UptimeRobot", href: ROUTES.uptime, tone: "ghost" }],
        links,
        related,
      })
      continue
    }

    const monitor = uptimeByHref.get(site.id) ?? null
    const bad = monitor && (monitor.status === "down" || monitor.status === "seems_down")
    const idle = monitor && (monitor.status === "paused" || monitor.status === "pending")
    const status: SystemStatus = !monitor ? "warn" : bad ? "bad" : idle ? "warn" : "ok"
    const last = monitor?.pings[monitor.pings.length - 1] ?? null
    const headline = monitor
      ? `${statusLabel(monitor.status)} · ${formatRatio(monitor.ratio30)} 30d${monitor.avgResponseMs != null ? ` · ${monitor.avgResponseMs} ms` : ""}`
      : siteUptime.error
        ? `Uptime check unavailable · ${siteUptime.error}`
        : "Uptime check unavailable"

    systems.push({
      id: `site:${site.id}`,
      kind: "site",
      name: site.name,
      host: hostnameOf(monitor?.url || site.origin) || site.slug,
      status,
      headline,
      checkedLabel: last ? `checked ${ageLabel(last.at)} ago` : "never checked",
      surfaces: monitor
        ? [{ label: "Site", headline: statusLabel(monitor.status), detail: `${formatRatio(monitor.ratio30)} · 30d`, tone: bad ? "bad" : idle ? "idle" : "ok" }]
        : [],
      bars: monitor ? pingBars(monitor) : [],
      facts: [
        ["Host", hostnameOf(monitor?.url || site.origin) || "—"],
        monitor ? ["Checked", formatInterval(monitor.intervalSec)] : ["Checked", "—"],
        monitor ? ["Uptime", `${formatRatio(monitor.ratio1)} 24h · ${formatRatio(monitor.ratio7)} 7d · ${formatRatio(monitor.ratio30)} 30d`] : ["Uptime", "—"],
        monitor ? ["Response", monitor.avgResponseMs != null ? `${monitor.avgResponseMs} ms avg` : "—"] : ["Response", "—"],
        ["Analytics", [site.ga4PropertyId && "GA4", site.gscSiteUrl && "GSC", site.adsCustomerId && "Ads"].filter(Boolean).join(" · ") || "none wired"],
      ],
      actions:
        status === "bad" || status === "warn"
          ? [{ label: "Re-run check", href: ROUTES.uptime, tone: "primary" }]
          : [{ label: "View in Uptime", href: ROUTES.uptime, tone: "ghost" }],
      links,
      related,
    })
  }

  /* --------------------------------------------------------------- apps */
  for (const app of appRows) {
    if (app.revokedAt) continue
    const monitors = clientMonitors.filter((row) => row.monitor.sourceId === app.id)

    const specDoc = docs.find((d) => d.kind === "spec" && d.codebase === app.slug)
    const spec = specDoc ? (specDoc.data as { git?: { remote?: string } }) : null
    const repoHref = spec ? repoHrefFromGitRemote(spec.git?.remote) : null
    const links: SystemLink[] = []
    if (specDoc) {
      links.push({
        label: "Spec sheet",
        icon: "spec",
        detail: specDoc.generatedAt.toISOString().slice(0, 10),
        href: `${ROUTES.client(client.slug)}/codebases/${specDoc.codebase}`,
      })
    }
    if (repoHref) links.push({ label: "Repo", icon: "repo", detail: hostnameOf(repoHref), href: repoHref })
    links.push(...links0)

    if (monitors.length === 0) {
      systems.push({
        id: `app:${app.id}`,
        kind: "app",
        name: app.name || app.slug,
        host: app.slug,
        status: "unwatched",
        headline: "Not watched · no scheduled job monitor",
        checkedLabel: app.lastSeenAt ? `checked ${ageLabel(app.lastSeenAt)} ago` : "never checked",
        surfaces: [],
        bars: [],
        facts: [
          ["Platform", app.platform || "—"],
          ["Scopes", app.scopes.join(", ") || "—"],
          ["Last event", app.lastSeenAt ? `${ageLabel(app.lastSeenAt)} ago` : "never"],
        ],
        actions: [{ label: "Wire a monitor", href: ROUTES.uptime, tone: "ghost" }],
        links,
        related,
      })
      continue
    }

    const withStatus = monitors.map((row) => ({ row, ...monitorStatus(row.monitor, row.runs) }))
    withStatus.sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status])
    const worst = withStatus[0]
    const allOk = withStatus.every((m) => m.status === "ok")
    const openTicket = withStatus.find((m) => m.row.monitor.openTicketId)?.row.monitor.openTicketId ?? null

    const facts: SystemFact[] = [
      ["Platform", app.platform || "—"],
      ["Scopes", app.scopes.join(", ") || "—"],
    ]
    for (const m of withStatus) {
      facts.push([m.row.monitor.name || m.row.monitor.slug, `${m.row.monitor.scheduleNote || everyLabel(m.row.monitor.expectEveryMinutes)} · ${monitorHeadline(m.row.monitor, m.status, m.last)}`])
    }

    systems.push({
      id: `app:${app.id}`,
      kind: "app",
      name: app.name || app.slug,
      host: app.slug,
      status: worst.status,
      headline: allOk
        ? `All ${withStatus.length} scheduled job${withStatus.length === 1 ? "" : "s"} succeeded`
        : `${worst.row.monitor.name || worst.row.monitor.slug} · ${monitorHeadline(worst.row.monitor, worst.status, worst.last)}`,
      checkedLabel: worst.row.monitor.lastRunAt ? `checked ${ageLabel(worst.row.monitor.lastRunAt)} ago` : "never checked",
      surfaces: withStatus.map((m) => ({
        label: m.row.monitor.name || m.row.monitor.slug,
        headline: m.status === "bad" ? (m.last?.status === "missed" ? "Missed" : "Failed") : m.status === "warn" ? "Partial" : "Succeeded",
        detail: m.row.monitor.lastRunAt ? `${ageLabel(m.row.monitor.lastRunAt)} ago` : "no runs yet",
        tone: m.status === "bad" ? "bad" : m.status === "warn" ? "warn" : "ok",
      })),
      bars: runBars(worst.row.runs),
      facts,
      actions: (() => {
        const ticket = ticketAction(openTicket)
        if (ticket) return [ticket]
        if (worst.status === "bad" || worst.status === "warn") return [{ label: "Re-run", href: ROUTES.uptime, tone: "primary" }] as SystemAction[]
        return [{ label: "View in Uptime", href: ROUTES.uptime, tone: "ghost" }] as SystemAction[]
      })(),
      links,
      related,
    })
  }

  /* ------------------------------------------------------- standalone jobs */
  const claimedMonitorIds = new Set(
    clientMonitors.filter((row) => row.monitor.sourceId && activeAppIds.has(row.monitor.sourceId)).map((row) => row.monitor.id)
  )
  for (const row of clientMonitors) {
    if (claimedMonitorIds.has(row.monitor.id)) continue
    const { status, last } = monitorStatus(row.monitor, row.runs)
    systems.push({
      id: `job:${row.monitor.id}`,
      kind: "job",
      name: row.monitor.name || row.monitor.slug,
      host: row.monitor.slug,
      status,
      headline: monitorHeadline(row.monitor, status, last),
      checkedLabel: row.monitor.lastRunAt ? `checked ${ageLabel(row.monitor.lastRunAt)} ago` : "never checked",
      surfaces: [
        {
          label: row.monitor.name || row.monitor.slug,
          headline: status === "bad" ? (last?.status === "missed" ? "Missed" : "Failed") : status === "warn" ? "Partial" : "Succeeded",
          detail: row.monitor.lastRunAt ? `${ageLabel(row.monitor.lastRunAt)} ago` : "no runs yet",
          tone: status === "bad" ? "bad" : status === "warn" ? "warn" : "ok",
        },
      ],
      bars: runBars(row.runs),
      facts: [
        ["Schedule", row.monitor.scheduleNote || everyLabel(row.monitor.expectEveryMinutes)],
        ["Grace", `${row.monitor.graceMinutes} min`],
        ["Last success", row.monitor.lastSuccessAt ? `${ageLabel(row.monitor.lastSuccessAt)} ago` : "never"],
        ["Fail streak", String(row.monitor.failStreak)],
        ["Checked for misses", everyLabel(row.monitor.sweepEveryMinutes)],
      ],
      actions: (() => {
        const ticket = ticketAction(row.monitor.openTicketId)
        if (ticket) return [ticket]
        if (status === "bad" || status === "warn") return [{ label: "Re-run", href: ROUTES.uptime, tone: "primary" }] as SystemAction[]
        return [{ label: "View in Uptime", href: ROUTES.uptime, tone: "ghost" }] as SystemAction[]
      })(),
      links: [...links0],
      related,
    })
  }

  systems.sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status])

  const bad = systems.filter((s) => s.status === "bad").length
  const warn = systems.filter((s) => s.status === "warn").length
  const unwatched = systems.filter((s) => s.status === "unwatched").length
  const summary =
    [bad ? `${bad} down` : "", warn ? `${warn} degraded` : "", unwatched ? `${unwatched} not watched` : ""].filter(Boolean).join(" · ") ||
    "everything up"

  return { systems, summary }
}
