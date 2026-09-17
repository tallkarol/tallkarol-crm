import { ACTIVITY_COOKIE, SESSION_IDLE_MS, encodeActivityCookie, sessionExpired } from "@/lib/activity/detect"

/**
 * The browser half: a queue, the session, and the beacon. No React and no
 * registry — ingest is the allowlist, so the probe's bundle stays small.
 * ActivityProbe starts it; anything else in the browser (the error
 * boundaries) can call track() once it has started.
 *
 * Events leave every 10 s, at 50 queued, or when the tab hides, as one
 * sendBeacon. Nothing is ever sent on the click itself.
 */

export type ProbeModules = {
  pages: boolean
  navigation: boolean
  controls: boolean
  peeks: boolean
  errors: boolean
  vitals: boolean
  frustration: boolean
}

type Queued = {
  kind: string
  at: number
  path: string
  target?: string
  durationMs?: number
  props?: Record<string, unknown>
}

const ENDPOINT = "/api/activity"
const FLUSH_MS = 10_000
const FLUSH_AT = 50
const SESSION_KEY = "tk-act-session"

const MODULE_OF: Record<string, keyof ProbeModules> = {
  page: "pages",
  nav: "navigation",
  control: "controls",
  peek: "peeks",
  error: "errors",
  vitals: "vitals",
  frustration: "frustration",
}

const state = {
  started: false,
  modules: null as ProbeModules | null,
  queue: [] as Queued[],
  timer: 0,
  session: "",
  lastSeen: 0,
  surface: "browser",
  synthetic: false,
}

export function detectSurface(): string {
  const ua = navigator.userAgent
  if (/TallKarol\//.test(ua)) return "mac_app"
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false
  if (/iPhone|iPod|Android.+Mobile/.test(ua) || (coarse && window.innerWidth < 768)) return "phone"
  return "browser"
}

export function detectViewport(): string {
  const w = window.innerWidth
  return w < 768 ? "phone" : w < 1024 ? "tablet" : "desktop"
}

function newId(): string {
  return (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 12)
}

function touchSession(now: number) {
  if (state.session && now - state.lastSeen < 60_000) {
    state.lastSeen = now
    return
  }
  let stored: { id?: unknown; last?: unknown } | null = null
  try {
    stored = JSON.parse(window.localStorage.getItem(SESSION_KEY) ?? "null")
  } catch {
    stored = null
  }
  const storedId = stored && typeof stored.id === "string" && !sessionExpired(Number(stored.last), now) ? stored.id : ""
  const id = storedId || (state.session && !sessionExpired(state.lastSeen, now) ? state.session : newId())
  state.session = id
  state.lastSeen = now
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify({ id, last: now }))
  } catch {
    /* private window: the in-memory id still works for this tab */
  }
  document.cookie = `${ACTIVITY_COOKIE}=${encodeActivityCookie(id, state.surface, detectViewport())}; path=/; max-age=${SESSION_IDLE_MS / 1000}; samesite=lax`
}

export function startActivity(modules: ProbeModules) {
  state.modules = modules
  if (state.started || typeof window === "undefined") return
  state.started = true
  state.surface = detectSurface()
  state.synthetic = navigator.webdriver === true
  touchSession(Date.now())
}

export function track(
  kind: string,
  fields: { path?: string; target?: string; durationMs?: number; props?: Record<string, unknown> } = {}
) {
  const modules = state.modules
  if (!state.started || !modules) return
  const owner = MODULE_OF[kind.slice(0, kind.indexOf("."))]
  if (!owner || !modules[owner]) return
  const now = Date.now()
  touchSession(now)
  state.queue.push({
    kind,
    at: now,
    path: fields.path ?? window.location.pathname,
    target: fields.target,
    durationMs: fields.durationMs,
    props: fields.props,
  })
  if (state.queue.length >= FLUSH_AT) flushActivity()
  else if (!state.timer) state.timer = window.setTimeout(() => flushActivity(), FLUSH_MS)
}

export function flushActivity() {
  if (state.timer) {
    window.clearTimeout(state.timer)
    state.timer = 0
  }
  while (state.queue.length) {
    const events = state.queue.splice(0, 100)
    const body = JSON.stringify({
      session: state.session,
      surface: state.surface,
      viewport: detectViewport(),
      synthetic: state.synthetic,
      events,
    })
    let sent = false
    try {
      sent = typeof navigator.sendBeacon === "function" && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }))
    } catch {
      sent = false
    }
    if (!sent) {
      void fetch(ENDPOINT, {
        method: "POST",
        body,
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => undefined)
    }
  }
}
