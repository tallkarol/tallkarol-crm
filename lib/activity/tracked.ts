import { cookies, headers } from "next/headers"
import { routeMatcher } from "@/lib/activity/catalog"
import { ACTIVITY_COOKIE, parseActivityCookie } from "@/lib/activity/detect"
import { cleanEnvelope, sanitizeEvent, type BatchEnvelope } from "@/lib/activity/sanitize"
import { activityFlags } from "@/lib/activity/settings"
import { attributeSessions, insertEvents, type StoredRow } from "@/lib/activity/store"
import { hashToken, SESSION_COOKIE } from "@/lib/crypto"

/**
 * Time a server action without making the click wait for the log.
 *
 *   export const setTaskStatus = tracked("task.setStatus", async (id: string, status: TaskStatus) => { … })
 *
 * The wrapper returns what the action returns and rethrows what it throws.
 * A run counts as failed when it throws, or returns `{ ok: false }` (or an
 * `error` string without `ok: true`) — the CRM's action convention. A
 * redirect() or notFound() is control flow, not failure.
 *
 * Nothing touches the database on the request path: the run is pushed to an
 * in-process buffer that flushes every 5 s, or at 50 runs, as one insert. A
 * redeploy can lose the last few seconds of runs; that is the trade for never
 * adding a round-trip to Railway's three-connection pool per click.
 */

type Pending = {
  name: string
  at: number
  durationMs: number
  ok: boolean
  message: string | null
  path: string
  tokenHash: string
  envelope: BatchEnvelope
}

const FLUSH_MS = 5000
const FLUSH_AT = 50

const holder = globalThis as unknown as {
  __tk_activity_actions?: { items: Pending[]; timer: ReturnType<typeof setTimeout> | null }
}
const buffer = () => (holder.__tk_activity_actions ??= { items: [], timer: null })

export function tracked<A extends unknown[], R>(
  name: string,
  action: (...args: A) => Promise<R>
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    const startedAt = Date.now()
    const context = requestContext()
    try {
      const result = await action(...args)
      note(context, name, startedAt, failureOf(result))
      return result
    } catch (err) {
      note(context, name, startedAt, isControlFlow(err) ? null : firstLine(err))
      throw err
    }
  }
}

function requestContext(): { tokenHash: string; path: string; envelope: BatchEnvelope } | null {
  try {
    const jar = cookies()
    const token = jar.get(SESSION_COOKIE)?.value
    if (!token) return null
    const h = headers()
    const act = parseActivityCookie(jar.get(ACTIVITY_COOKIE)?.value)
    let path = "/"
    const referer = h.get("referer")
    if (referer) {
      try {
        path = new URL(referer).pathname
      } catch {
        path = "/"
      }
    }
    const envelope = cleanEnvelope(
      { session: act?.session, surface: act?.surface, viewport: act?.viewport },
      h.get("user-agent") ?? ""
    )
    return { tokenHash: hashToken(token), path, envelope }
  } catch {
    // Called outside a request (a script, tick()): nothing to attribute it to.
    return null
  }
}

/** The action's own failure text, or null when it succeeded. */
export function failureOf(result: unknown): string | null | undefined {
  if (!result || typeof result !== "object") return undefined
  const r = result as Record<string, unknown>
  const text = typeof r.error === "string" ? r.error : typeof r.message === "string" ? r.message : null
  if (r.ok === false) return text ?? ""
  if (r.ok !== true && typeof r.error === "string" && r.error) return r.error
  return undefined
}

/** redirect() and notFound() throw on purpose. */
export function isControlFlow(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest
  return typeof digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND)/.test(digest)
}

function firstLine(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return (text.split("\n")[0] ?? "").slice(0, 200)
}

/** failure: undefined = succeeded; a string (possibly empty) = failed with that message. */
function note(
  context: ReturnType<typeof requestContext>,
  name: string,
  startedAt: number,
  failure: string | null | undefined
) {
  if (!context) return
  const failed = typeof failure === "string"
  const b = buffer()
  b.items.push({
    name,
    at: startedAt,
    durationMs: Date.now() - startedAt,
    ok: !failed,
    message: failed && failure ? failure : null,
    ...context,
  })
  if (b.items.length >= FLUSH_AT) {
    void flushTracked()
    return
  }
  if (!b.timer) {
    b.timer = setTimeout(() => void flushTracked(), FLUSH_MS)
    ;(b.timer as { unref?: () => void }).unref?.()
  }
}

export async function flushTracked(): Promise<number> {
  const b = buffer()
  if (b.timer) {
    clearTimeout(b.timer)
    b.timer = null
  }
  const items = b.items.splice(0, b.items.length)
  if (!items.length) return 0
  try {
    const flags = await activityFlags()
    if (!flags.actions) return 0
    const now = new Date()
    const who = await attributeSessions(items.map((i) => i.tokenHash), now)
    const match = routeMatcher()
    const rows: StoredRow[] = []
    items.forEach((item) => {
      const person = who.get(item.tokenHash)
      if (!person || (person.role === "customer" && !flags.portal)) return
      const { event } = sanitizeEvent(
        {
          kind: "action.run",
          at: item.at,
          path: item.path,
          target: item.name,
          durationMs: item.durationMs,
          ok: item.ok,
          props: item.message ? { message: item.message } : {},
        },
        { now, from: "server", match }
      )
      if (event) rows.push({ event, envelope: item.envelope, who: person })
    })
    return await insertEvents(rows)
  } catch (err) {
    console.error("activity: action flush failed:", err instanceof Error ? err.message : err)
    return 0
  }
}
