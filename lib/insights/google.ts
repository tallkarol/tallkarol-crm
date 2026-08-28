/** Thin GA4 Data API + Search Console fetchers for the insights loader. */

type Json = Record<string, unknown>

async function jsonOrNull(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export type Ga4Report = {
  rows?: {
    dimensionValues?: { value?: string }[]
    metricValues?: { value?: string }[]
  }[]
  totals?: { metricValues?: { value?: string }[] }[]
  error?: { message?: string }
  message?: string
}

export function num(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export async function ga4Post(
  token: string,
  propertyId: string,
  path: "runReport" | "runRealtimeReport",
  body: Json
): Promise<Ga4Report> {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  )
  const json = (await jsonOrNull(res)) as Ga4Report | null
  if (!res.ok) {
    throw new Error(
      json?.error?.message || json?.message || `GA4 ${path} failed (${res.status})`
    )
  }
  return json || {}
}

export type GscRow = {
  keys?: string[]
  clicks?: number
  impressions?: number
  ctr?: number
  position?: number
}

export type GscResponse = {
  rows?: GscRow[]
  error?: { message?: string }
}

export async function gscQuery(
  token: string,
  siteUrl: string,
  body: {
    startDate: string
    endDate: string
    dimensions: ("date" | "query" | "page")[]
    rowLimit?: number
  }
): Promise<GscResponse> {
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
      siteUrl
    )}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    }
  )
  const json = (await jsonOrNull(res)) as GscResponse | null
  if (!res.ok) {
    throw new Error(json?.error?.message || `Search Console failed (${res.status})`)
  }
  return json || {}
}

/** GA4 date dimension comes back as YYYYMMDD — normalize to YYYY-MM-DD. */
export function ga4Date(raw: string | undefined) {
  const v = raw || ""
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
  return v
}
