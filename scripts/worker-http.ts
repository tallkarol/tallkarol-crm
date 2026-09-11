/**
 * What every Mac-side worker needs to talk to the CRM: a device-token POST
 * with a timeout that keeps the loop moving, and a heartbeat on its own
 * timer. Shared by the meeting worker; the chat worker carries its own copy
 * of the same two things and can adopt this later.
 *
 * The timeout is load-bearing, not defensive dressing: a poll that never
 * settles would stop a worker dead while its heartbeat kept reporting it
 * alive. One chat-worker poll was observed hanging for 31 minutes.
 */

export type CrmClient = {
  base: string
  post: (path: string, body: unknown, opts?: { timeoutMs?: number }) => Promise<unknown>
  get: (path: string, opts?: { timeoutMs?: number }) => Promise<unknown>
}

export class CrmError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function crmClient(base: string, token: string): CrmClient {
  const root = base.replace(/\/$/, "")
  async function call(method: "GET" | "POST", path: string, body: unknown, timeoutMs: number) {
    const response = await fetch(`${root}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    if (!response.ok) throw new CrmError(response.status, `${method} ${path} → ${response.status} ${text.slice(0, 300)}`)
    try {
      return JSON.parse(text)
    } catch {
      return {}
    }
  }
  return {
    base: root,
    post: (path, body, opts) => call("POST", path, body, opts?.timeoutMs ?? 30_000),
    get: (path, opts) => call("GET", path, undefined, opts?.timeoutMs ?? 30_000),
  }
}

/**
 * Beat on a timer, never from the poll loop: a worker busy for two minutes
 * polls zero times, and a poll-based signal would call it dead mid-job.
 * Failures are swallowed — a missed beat is what "offline" means.
 */
export function startHeartbeat(crm: CrmClient, path: string, name: string, everyMs = 5000) {
  const beat = () => crm.post(path, { worker: name }, { timeoutMs: 8000 }).catch(() => undefined)
  void beat()
  const timer = setInterval(beat, everyMs)
  timer.unref()
  return () => clearInterval(timer)
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
