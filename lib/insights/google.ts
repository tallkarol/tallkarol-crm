/** Thin GA4, Search Console, and Google Ads fetchers for the insights loader. */

export const ADS_SCOPE = "https://www.googleapis.com/auth/adwords"
export const ADS_API_VERSION = "v25"

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

function digits(raw: string | undefined) {
  return (raw || "").replace(/\D/g, "")
}

export function adsCustomerId() {
  return digits(process.env.GOOGLE_ADS_CUSTOMER_ID)
}

export function adsLoginCustomerId() {
  return digits(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
}

export function adsDeveloperToken() {
  return (process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "").trim()
}

export function adsConfigured() {
  return Boolean(adsCustomerId() && adsDeveloperToken())
}

export function microsToAmount(raw: unknown) {
  return num(raw) / 1_000_000
}

type AdsErrorBody = {
  error?: {
    message?: string
    details?: {
      errors?: { message?: string; errorCode?: Record<string, string> }[]
    }[]
  }
  message?: string
}

function adsErrorMessage(json: AdsErrorBody | null, status: number) {
  const first = json?.error?.details?.[0]?.errors?.[0]
  const code = first?.errorCode
    ? Object.values(first.errorCode).filter(Boolean).join("/")
    : ""
  const text = first?.message || json?.error?.message || json?.message
  if (text && code) return `${text} (${code})`
  return text || `Google Ads failed (${status})`
}

function adsHeaders(token: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": adsDeveloperToken(),
    "Content-Type": "application/json",
  }
  const login = adsLoginCustomerId()
  if (login) headers["login-customer-id"] = login
  return headers
}

export type AdsRow = {
  campaign?: { id?: string; name?: string; status?: string }
  customer?: { id?: string; descriptiveName?: string; currencyCode?: string }
  metrics?: {
    impressions?: string | number
    clicks?: string | number
    costMicros?: string | number
    conversions?: string | number
  }
  segments?: { date?: string }
}

/**
 * GAQL search. Pages through the result set so a 90-day daily series is one
 * call from the source adapter's point of view.
 */
export async function adsSearch(
  token: string,
  query: string,
  customerId = adsCustomerId()
): Promise<AdsRow[]> {
  if (!customerId) throw new Error("GOOGLE_ADS_CUSTOMER_ID is not set.")
  if (!adsDeveloperToken()) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not set.")

  const results: AdsRow[] = []
  let pageToken: string | undefined
  do {
    const res = await fetch(
      `https://googleads.googleapis.com/${ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
      {
        method: "POST",
        headers: adsHeaders(token),
        body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
        cache: "no-store",
      }
    )
    const json = (await jsonOrNull(res)) as
      | { results?: AdsRow[]; nextPageToken?: string }
      | AdsErrorBody
      | null
    if (!res.ok) throw new Error(adsErrorMessage(json as AdsErrorBody, res.status))
    const page = json as { results?: AdsRow[]; nextPageToken?: string }
    if (page.results?.length) results.push(...page.results)
    pageToken = page.nextPageToken || undefined
  } while (pageToken)
  return results
}

export async function adsListAccessibleCustomers(token: string): Promise<string[]> {
  if (!adsDeveloperToken()) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN is not set.")
  const res = await fetch(
    `https://googleads.googleapis.com/${ADS_API_VERSION}/customers:listAccessibleCustomers`,
    { headers: adsHeaders(token), cache: "no-store" }
  )
  const json = (await jsonOrNull(res)) as
    | { resourceNames?: string[] }
    | AdsErrorBody
    | null
  if (!res.ok) throw new Error(adsErrorMessage(json as AdsErrorBody, res.status))
  return ((json as { resourceNames?: string[] })?.resourceNames || []).map((name) =>
    name.replace("customers/", "")
  )
}
