/**
 * Shared Google-analytics plumbing that predates the Insights hub. The hub's
 * loader (lib/insights/) reads GA4 and Search Console itself; what stays here
 * are the probes and the Measurement Protocol tools it reuses.
 */

export const ANALYTICS_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
]

async function jsonOrNull(res: Response) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

/** Does the marketing site serve the first-party collector? */
export async function probeCollector(origin: string) {
  const out = { script: false, endpoint: false, configured: null as boolean | null }
  try {
    const script = await fetch(`${origin}/tk-collect.js`, {
      cache: "no-store",
      headers: { "user-agent": "TallKarolCRM/1.0" },
    })
    out.script = script.ok
  } catch {
    /* ignore */
  }
  try {
    const health = await fetch(`${origin}/api/collect`, {
      cache: "no-store",
      headers: { "user-agent": "TallKarolCRM/1.0" },
    })
    if (health.ok) {
      const body = (await jsonOrNull(health)) as { configured?: boolean } | null
      out.endpoint = true
      out.configured = typeof body?.configured === "boolean" ? body.configured : null
    }
  } catch {
    /* ignore */
  }
  return out
}

export async function validateMeasurementProtocol(
  measurementId: string,
  origin: string
) {
  const apiSecret = process.env.GA4_API_SECRET
  if (!measurementId || !apiSecret) {
    return {
      configured: false,
      valid: null as boolean | null,
      message: measurementId
        ? "GA4_API_SECRET is missing on the CRM."
        : "No measurement ID on this site — the first-party collector is not set up here.",
    }
  }

  try {
    const res = await fetch(
      `https://www.google-analytics.com/debug/mp/collect?measurement_id=${encodeURIComponent(
        measurementId
      )}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: `${Math.floor(1e9 + Math.random() * 9e9)}.${Math.floor(Date.now() / 1000)}`,
          events: [
            {
              name: "page_view",
              params: {
                page_location: `${origin}/`,
                page_title: "mp-validate",
                engagement_time_msec: 100,
                session_id: Math.floor(Date.now() / 1000),
              },
            },
          ],
        }),
        cache: "no-store",
      }
    )
    const body = (await jsonOrNull(res)) as {
      validationMessages?: { description?: string; validationCode?: string }[]
    } | null
    const messages = body?.validationMessages || []
    if (!res.ok) {
      return {
        configured: true,
        valid: false,
        message: `Debug endpoint returned ${res.status}. Check the Measurement Protocol secret.`,
      }
    }
    if (messages.length > 0) {
      return {
        configured: true,
        valid: false,
        message: messages.map((row) => row.description).filter(Boolean).join("; "),
      }
    }
    return {
      configured: true,
      valid: true,
      message: "Measurement Protocol secret is accepted.",
    }
  } catch (err) {
    return {
      configured: true,
      valid: false,
      message: err instanceof Error ? err.message : "Could not reach Google.",
    }
  }
}

export async function sendAnalyticsTestEvent(
  measurementId: string,
  origin: string
) {
  const apiSecret = process.env.GA4_API_SECRET
  if (!measurementId || !apiSecret) {
    return { ok: false, error: "GA4 Measurement Protocol secret is missing on the CRM." }
  }

  const sessionId = Math.floor(Date.now() / 1000)
  const clientId = `${Math.floor(1e9 + Math.random() * 9e9)}.${sessionId}`
  try {
    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
        measurementId
      )}&api_secret=${encodeURIComponent(apiSecret)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          timestamp_micros: String(Date.now() * 1000),
          non_personalized_ads: true,
          events: [
            {
              name: "page_view",
              params: {
                page_location: `${origin}/`,
                page_title: "CRM test hit",
                engagement_time_msec: 100,
                session_id: sessionId,
              },
            },
          ],
        }),
        cache: "no-store",
      }
    )
    if (!res.ok) return { ok: false, error: `Google returned ${res.status}` }
    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" }
  }
}
