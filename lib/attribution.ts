export type AttributionTouch = {
  landing_page?: string
  referrer?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string
  gclid?: string
  at?: number
}

export type Attribution = {
  client_id?: string
  session_id?: string
  first?: AttributionTouch
  last?: AttributionTouch
  path?: string[]
}

export function readAttribution(payload: unknown): Attribution | null {
  if (!payload || typeof payload !== "object") return null
  const attr = (payload as { attribution?: unknown }).attribution
  if (!attr || typeof attr !== "object") return null
  return attr as Attribution
}

export function sourceLabel(attr: Attribution | null): string | null {
  if (!attr) return null
  const first = attr.first || {}
  const last = attr.last || {}
  const source = first.utm_source || last.utm_source
  const medium = first.utm_medium || last.utm_medium
  if (source && medium) return `${source} / ${medium}`
  if (source) return source
  if (first.referrer || last.referrer) return "referral"
  if (first.landing_page || last.landing_page) return "direct"
  return null
}
