import type { KindSpec, ModuleKey, PropSpec } from "@/lib/activity/define"
import { KINDS } from "@/lib/activity/modules"
import { compilePatterns, matchRoute, type RouteMatch } from "@/lib/activity/routes"

/**
 * The door every event comes through, PURE. The browser batch and the
 * server's tracked() buffer both pass here, so the allowlist is enforced in
 * one place: an unknown kind is refused, an undeclared prop is dropped and
 * named, a device clock is clamped, a path becomes a route pattern.
 */

export const SURFACES = ["browser", "mac_app", "phone"] as const
export const VIEWPORTS = ["phone", "tablet", "desktop"] as const
export type Surface = (typeof SURFACES)[number]
export type Viewport = (typeof VIEWPORTS)[number]

/** Same rule as the punch clock's `at`: a device may be up to a day behind, never ahead. */
export const CLOCK_SKEW_MS = 24 * 60 * 60_000
export const MAX_BATCH = 100
export const MAX_DURATION_MS = 24 * 60 * 60_000

export type CleanEvent = {
  kind: string
  module: ModuleKey
  occurredAt: Date
  route: string
  target: string | null
  durationMs: number | null
  ok: boolean | null
  props: Record<string, unknown>
}

export type Matcher = (pathname: string) => RouteMatch

export function makeMatcher(patterns: readonly string[]): Matcher {
  const compiled = compilePatterns(patterns)
  return (pathname) => matchRoute(pathname, compiled)
}

function cleanProp(spec: PropSpec, value: unknown, match: Matcher): { ok: true; value: unknown } | { ok: false } {
  switch (spec.type) {
    case "string":
      if (typeof value !== "string" && typeof value !== "number") return { ok: false }
      return { ok: true, value: String(value).replace(/\s+/g, " ").trim().slice(0, spec.max) }
    case "enum":
      return typeof value === "string" && spec.values.includes(value) ? { ok: true, value } : { ok: false }
    case "number": {
      const n = typeof value === "number" ? value : Number.NaN
      if (!Number.isFinite(n)) return { ok: false }
      const clamped = Math.min(spec.max ?? Number.MAX_SAFE_INTEGER, Math.max(spec.min ?? Number.MIN_SAFE_INTEGER, n))
      return { ok: true, value: Math.round(clamped * 1000) / 1000 }
    }
    case "boolean":
      return typeof value === "boolean" ? { ok: true, value } : { ok: false }
    case "route":
      return typeof value === "string" && value.startsWith("/") ? { ok: true, value: match(value).pattern } : { ok: false }
    case "params": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false }
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 4)) {
        if (typeof v === "string") out[k.slice(0, 24)] = v.slice(0, 80)
      }
      return { ok: true, value: out }
    }
  }
}

function cleanTime(at: unknown, now: Date): Date {
  const ms = typeof at === "number" ? at : typeof at === "string" ? Date.parse(at) : Number.NaN
  if (!Number.isFinite(ms)) return now
  return new Date(Math.min(now.getTime(), Math.max(now.getTime() - CLOCK_SKEW_MS, ms)))
}

export type SanitizeResult = { event: CleanEvent | null; dropped: string[]; refused?: string }

export function sanitizeEvent(
  raw: unknown,
  opts: { now: Date; from: "browser" | "server"; match: Matcher }
): SanitizeResult {
  if (!raw || typeof raw !== "object") return { event: null, dropped: [], refused: "not an object" }
  const r = raw as Record<string, unknown>
  const kind = typeof r.kind === "string" ? r.kind : ""
  const entry = KINDS[kind]
  if (!entry) return { event: null, dropped: [], refused: `unknown kind ${kind.slice(0, 40)}` }
  const spec: KindSpec = entry.spec
  if (spec.serverOnly && opts.from === "browser") return { event: null, dropped: [], refused: `${kind} is server-only` }

  const path = typeof r.path === "string" && r.path.startsWith("/") ? r.path : "/"
  const matched = opts.match(path)

  const dropped: string[] = []
  const props: Record<string, unknown> = {}
  const rawProps = r.props && typeof r.props === "object" && !Array.isArray(r.props) ? (r.props as Record<string, unknown>) : {}
  for (const [key, value] of Object.entries(rawProps)) {
    if (value === undefined || value === null) continue
    const propSpec = spec.props[key]
    if (!propSpec) {
      dropped.push(`${kind}.${key}`)
      continue
    }
    const cleaned = cleanProp(propSpec, value, opts.match)
    if (cleaned.ok) props[key] = cleaned.value
    else dropped.push(`${kind}.${key}`)
  }
  // Route params are read from the path, never trusted from the payload.
  if (spec.props.params) {
    delete props.params
    if (Object.keys(matched.params).length) props.params = matched.params
  }

  const duration = typeof r.durationMs === "number" && Number.isFinite(r.durationMs) ? r.durationMs : null
  const target = typeof r.target === "string" ? r.target.replace(/\s+/g, " ").trim().slice(0, 120) : ""

  return {
    dropped,
    event: {
      kind,
      module: entry.module,
      occurredAt: cleanTime(r.at, opts.now),
      route: matched.pattern,
      target: spec.target && target ? target : null,
      durationMs: spec.duration && duration !== null ? Math.round(Math.min(MAX_DURATION_MS, Math.max(0, duration))) : null,
      ok: spec.outcome && typeof r.ok === "boolean" ? r.ok : null,
      props,
    },
  }
}

export type BatchEnvelope = { session: string; surface: Surface; viewport: Viewport; synthetic: boolean }

export function cleanEnvelope(body: Record<string, unknown>, userAgent: string): BatchEnvelope {
  const session = typeof body.session === "string" && /^[a-z0-9]{6,32}$/i.test(body.session) ? body.session : "unknown"
  const surface = SURFACES.includes(body.surface as Surface) ? (body.surface as Surface) : surfaceFromAgent(userAgent)
  const viewport = VIEWPORTS.includes(body.viewport as Viewport) ? (body.viewport as Viewport) : "desktop"
  return { session, surface, viewport, synthetic: body.synthetic === true || isSyntheticAgent(userAgent) }
}

/** What the server can tell from a user agent alone. The browser's own reading is preferred when it sent one. */
export function surfaceFromAgent(userAgent: string): Surface {
  if (/TallKarol\//.test(userAgent)) return "mac_app"
  if (/iPhone|iPod|Android.+Mobile/.test(userAgent)) return "phone"
  return "browser"
}

/** Every CDP verify run is headless Chrome against the production database. */
export function isSyntheticAgent(userAgent: string): boolean {
  return /HeadlessChrome|Lighthouse|Chrome-Lighthouse/.test(userAgent)
}
