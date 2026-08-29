import { asc } from "drizzle-orm"
import { db } from "@/db"
import { sites, type Site } from "@/db/schema"

/**
 * Read-only UptimeRobot client. The report and the /uptime board only ever
 * read — use the account's read-only API key, never the main one.
 */

const API = "https://api.uptimerobot.com/v2/getMonitors"

export type UptimeStatus = "paused" | "pending" | "up" | "seems_down" | "down" | "unknown"

export type UptimePing = {
  at: Date
  ms: number
}

export type UptimeMonitor = {
  id: string
  name: string
  url: string
  status: UptimeStatus
  intervalSec: number
  ratio1: number | null
  ratio7: number | null
  ratio30: number | null
  avgResponseMs: number | null
  pings: UptimePing[]
}

export type SiteUptime = {
  site: Site & { client?: { slug: string; name: string } | null }
  monitor: UptimeMonitor | null
}

export function uptimeRobotConfigured() {
  return Boolean(process.env.UPTIMEROBOT_API_KEY)
}

const STATUS: Record<number, UptimeStatus> = {
  0: "paused",
  1: "pending",
  2: "up",
  8: "seems_down",
  9: "down",
}

function num(value: unknown): number | null {
  if (value == null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function parseRatios(raw: unknown): [number | null, number | null, number | null] {
  const parts = String(raw ?? "")
    .split("-")
    .map((part) => num(part))
  return [parts[0] ?? null, parts[1] ?? null, parts[2] ?? null]
}

type ApiMonitor = {
  id?: number | string
  friendly_name?: string
  url?: string
  status?: number
  interval?: number
  custom_uptime_ratio?: string
  average_response_time?: string | number
  response_times?: { datetime?: number; value?: number }[]
}

export async function fetchUptimeMonitors(ids?: string[]): Promise<UptimeMonitor[]> {
  const key = process.env.UPTIMEROBOT_API_KEY
  if (!key) throw new Error("UPTIMEROBOT_API_KEY is not set.")

  const body = new URLSearchParams({
    api_key: key,
    format: "json",
    custom_uptime_ratios: "1-7-30",
    response_times: "1",
    response_times_average: "7",
  })
  const wanted = (ids ?? []).map((id) => id.trim()).filter(Boolean)
  if (wanted.length) body.set("monitors", wanted.join("-"))

  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "cache-control": "no-cache",
    },
    body,
    cache: "no-store",
  })
  const json = (await res.json()) as {
    stat?: string
    error?: { message?: string }
    monitors?: ApiMonitor[]
  }
  if (!res.ok || json.stat !== "ok") {
    throw new Error(json.error?.message || `UptimeRobot returned ${res.status}`)
  }

  return (json.monitors ?? []).map((row) => {
    const [ratio1, ratio7, ratio30] = parseRatios(row.custom_uptime_ratio)
    const pings = (row.response_times ?? [])
      .map((ping) => ({
        at: new Date((ping.datetime ?? 0) * 1000),
        ms: num(ping.value) ?? 0,
      }))
      .filter((ping) => ping.at.getTime() > 0)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
    return {
      id: String(row.id ?? ""),
      name: row.friendly_name || "",
      url: row.url || "",
      status: STATUS[row.status ?? -1] ?? "unknown",
      intervalSec: row.interval ?? 300,
      ratio1,
      ratio7,
      ratio30,
      avgResponseMs: num(row.average_response_time),
      pings,
    }
  })
}

export async function fetchUptimeMonitor(id: string): Promise<UptimeMonitor | null> {
  const [monitor] = await fetchUptimeMonitors([id])
  return monitor ?? null
}

export function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || ""
  }
}

/** Sites that have a monitor id, joined to the live UptimeRobot payload. */
export async function loadSiteUptimeBoard(): Promise<{
  configured: boolean
  error: string | null
  rows: SiteUptime[]
}> {
  const wired = await db.query.sites.findMany({
    with: { client: { columns: { slug: true, name: true } } },
    orderBy: [asc(sites.sort), asc(sites.name)],
  })
  const rows = wired.filter((site) => site.uptimeMonitorId)
  if (!rows.length) {
    return { configured: uptimeRobotConfigured(), error: null, rows: [] }
  }
  if (!uptimeRobotConfigured()) {
    return {
      configured: false,
      error: "Add a read-only UPTIMEROBOT_API_KEY to read these monitors.",
      rows: rows.map((site) => ({ site, monitor: null })),
    }
  }
  try {
    const monitors = await fetchUptimeMonitors(rows.map((site) => site.uptimeMonitorId))
    const byId = new Map(monitors.map((monitor) => [monitor.id, monitor]))
    return {
      configured: true,
      error: null,
      rows: rows.map((site) => ({
        site,
        monitor: byId.get(site.uptimeMonitorId) ?? null,
      })),
    }
  } catch (err) {
    return {
      configured: true,
      error: err instanceof Error ? err.message : "UptimeRobot request failed.",
      rows: rows.map((site) => ({ site, monitor: null })),
    }
  }
}

export function statusLabel(status: UptimeStatus) {
  if (status === "up") return "Up"
  if (status === "down") return "Down"
  if (status === "seems_down") return "Seems down"
  if (status === "paused") return "Paused"
  if (status === "pending") return "Pending"
  return "Unknown"
}

export function formatRatio(value: number | null) {
  if (value == null) return "—"
  return `${value.toFixed(value === 100 ? 0 : 2)}%`
}

export function formatInterval(seconds: number) {
  if (seconds < 60) return `every ${seconds}s`
  const mins = Math.round(seconds / 60)
  return mins === 1 ? "every 1 min" : `every ${mins} min`
}
