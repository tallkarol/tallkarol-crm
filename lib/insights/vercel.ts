import { addDays } from "@/lib/insights/derive"
import type { DimRow } from "@/lib/insights/types"

/** Hobby (and most plans) only serve this many days from the API. */
export const VERCEL_FETCH_DAYS = 30

export function vercelToken() {
  return process.env.VERCEL_TOKEN?.trim() || ""
}

export function vercelTeamId() {
  return process.env.VERCEL_TEAM_ID?.trim() || ""
}

export function vercelConfigured() {
  return Boolean(vercelToken())
}

export type VercelDailyRow = {
  date: string
  pageviews: number
  visitors: number
}

export type VercelTables = {
  daily: VercelDailyRow[]
  pages: DimRow[]
  referrers: DimRow[]
  devices: DimRow[]
  countries: DimRow[]
}

type AggregateRow = {
  timestamp?: string
  pageviews?: number
  visitors?: number
  requestPath?: string
  referrerHostname?: string
  deviceType?: string
  country?: string
}

type AggregateResponse = {
  data?: AggregateRow[] | { pageviews?: number; visitors?: number }
}

function summarizeError(status: number, body: string) {
  if (status === 401 || status === 403) {
    return "Vercel token was rejected — check VERCEL_TOKEN and that it can read Web Analytics."
  }
  if (status === 404) {
    return "Vercel project not found, or Web Analytics is not enabled on it."
  }
  const trimmed = body.replace(/\s+/g, " ").slice(0, 180)
  return trimmed || `Vercel Analytics API ${status}`
}

async function vercelGet(path: string, params: Record<string, string>) {
  const url = new URL(`https://api.vercel.com${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value)
  }
  const team = vercelTeamId()
  if (team) url.searchParams.set("teamId", team)

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${vercelToken()}` },
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(summarizeError(res.status, await res.text()))
  }
  return (await res.json()) as AggregateResponse
}

function asRows(data: AggregateResponse["data"]): AggregateRow[] {
  if (!data) return []
  return Array.isArray(data) ? data : []
}

function dimRows(
  rows: AggregateRow[],
  nameOf: (row: AggregateRow) => string | undefined
): DimRow[] {
  const out: DimRow[] = []
  for (const row of rows) {
    const name = (nameOf(row) || "").trim()
    if (!name || name === "Others") continue
    out.push({ name, value: Number(row.pageviews ?? 0) })
  }
  return out
}

function dayOf(row: AggregateRow) {
  const stamp = row.timestamp || ""
  return stamp.length >= 10 ? stamp.slice(0, 10) : ""
}

export async function fetchVercelAnalytics(
  projectId: string,
  endDate: string
): Promise<VercelTables> {
  const startDate = addDays(endDate, -(VERCEL_FETCH_DAYS - 1))
  const base = {
    projectId,
    since: `${startDate}T00:00:00.000Z`,
    until: `${endDate}T23:59:59.999Z`,
  }

  const [daily, pages, referrers, devices, countries] = await Promise.all([
    vercelGet("/v1/query/web-analytics/visits/aggregate", {
      ...base,
      by: "day",
      limit: String(VERCEL_FETCH_DAYS),
    }),
    vercelGet("/v1/query/web-analytics/visits/aggregate", {
      ...base,
      by: "requestPath",
      limit: "20",
    }),
    vercelGet("/v1/query/web-analytics/visits/aggregate", {
      ...base,
      by: "referrerHostname",
      limit: "12",
    }),
    vercelGet("/v1/query/web-analytics/visits/aggregate", {
      ...base,
      by: "deviceType",
      limit: "6",
    }),
    vercelGet("/v1/query/web-analytics/visits/aggregate", {
      ...base,
      by: "country",
      limit: "8",
    }),
  ])

  return {
    daily: asRows(daily.data)
      .map((row) => ({
        date: dayOf(row),
        pageviews: Number(row.pageviews ?? 0),
        visitors: Number(row.visitors ?? 0),
      }))
      .filter((row) => row.date),
    pages: dimRows(asRows(pages.data), (row) => row.requestPath),
    referrers: dimRows(asRows(referrers.data), (row) => row.referrerHostname || "(direct)"),
    devices: dimRows(asRows(devices.data), (row) => row.deviceType),
    countries: dimRows(asRows(countries.data), (row) => row.country),
  }
}
