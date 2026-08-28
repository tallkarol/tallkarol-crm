import { createSign } from "crypto"
import { existsSync, readFileSync } from "fs"

type ServiceAccount = {
  client_email: string
  private_key: string
  project_id?: string
}

const tokenCache = new Map<string, { token: string; exp: number }>()

export function readServiceAccount(): ServiceAccount | null {
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  if (credPath && existsSync(credPath)) {
    try {
      const parsed = JSON.parse(readFileSync(credPath, "utf8")) as ServiceAccount
      if (parsed.client_email && parsed.private_key) return parsed
    } catch {
      return null
    }
  }
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!email || !key) return null
  return {
    client_email: email,
    private_key: key.replace(/\\n/g, "\n"),
    project_id: process.env.GOOGLE_PROJECT_ID,
  }
}

export function googleAuthConfigured() {
  return Boolean(readServiceAccount())
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url")
}

export async function googleAccessToken(scopes: string[]): Promise<string> {
  const sa = readServiceAccount()
  if (!sa) throw new Error("Google service account is not configured")

  const cacheKey = scopes.slice().sort().join(" ")
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.exp > Date.now() + 30_000) return cached.token

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claim = base64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: cacheKey,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  )
  const unsigned = `${header}.${claim}`
  const signer = createSign("RSA-SHA256")
  signer.update(unsigned)
  const jwt = `${unsigned}.${signer.sign(sa.private_key, "base64url")}`

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    cache: "no-store",
  })
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string }
  if (!res.ok || !json.access_token) {
    throw new Error(json.error || `Google token failed (${res.status})`)
  }
  tokenCache.set(cacheKey, {
    token: json.access_token,
    exp: Date.now() + (json.expires_in ?? 3600) * 1000,
  })
  return json.access_token
}
