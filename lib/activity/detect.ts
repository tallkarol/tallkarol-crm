/**
 * The frustration rules, PURE. The probe runs them in the browser;
 * scripts/check-activity.ts runs them against scripted sequences. Every
 * threshold the /activity page quotes lives here, so the page's footnotes
 * and the behaviour cannot drift.
 */

/** Three or more clicks on the same element, within a second, within 30 px. */
export const RAGE = { clicks: 3, windowMs: 1000, radiusPx: 30 } as const
/** Left with Back this soon after arriving. */
export const QUICK_BACK_MS = 4000
/** Set, then set back, inside this window. */
export const FLIP_FLOP_MS = 60_000
/** How long a field may sit typed-in after losing focus before it counts as abandoned. */
export const ABANDON_GRACE_MS = 2500
/** A session ends after this long without activity. */
export const SESSION_IDLE_MS = 30 * 60_000
/** Time counts as active only if something was touched this recently. */
export const ACTIVE_INPUT_MS = 60_000
/** A long visit is written in slices this size, so its hours land in the right hour. */
export const ACTIVE_SLICE_MS = 5 * 60_000

/** Returns the click count once, when a burst crosses the threshold; null otherwise. */
export function createRageDetector(rule: { clicks: number; windowMs: number; radiusPx: number } = RAGE) {
  let key = ""
  let times: number[] = []
  let x0 = 0
  let y0 = 0
  let fired = false
  return function click(target: string, at: number, x: number, y: number): number | null {
    const last = times.length ? times[times.length - 1] : Number.NEGATIVE_INFINITY
    const near = Math.abs(x - x0) <= rule.radiusPx && Math.abs(y - y0) <= rule.radiusPx
    if (target !== key || !near || at - last > rule.windowMs) {
      key = target
      times = [at]
      x0 = x
      y0 = y
      fired = false
      return null
    }
    times.push(at)
    times = times.filter((t) => at - t <= rule.windowMs)
    if (!fired && times.length >= rule.clicks) {
      fired = true
      return times.length
    }
    return null
  }
}

export function isQuickBack(via: string, stayedMs: number, limitMs: number = QUICK_BACK_MS): boolean {
  return via === "back" && stayedMs >= 0 && stayedMs < limitMs
}

/**
 * A → B → A on one control inside the window. Only values actually seen
 * count, because a click on "Board" says nothing about what was selected
 * before it — unless the markup says so with `data-track-from`, which seeds
 * the starting value.
 */
export function createFlipFlopDetector(windowMs: number = FLIP_FLOP_MS) {
  const history = new Map<string, { value: string; at: number }[]>()
  return function change(target: string, value: string, at: number, from?: string): { value: string; gapMs: number } | null {
    let seen = (history.get(target) ?? []).filter((e) => at - e.at <= windowMs)
    if (seen.length === 0 && from !== undefined && from !== value) seen = [{ value: from, at }]
    const last = seen[seen.length - 1]
    if (last && last.value === value) {
      history.set(target, seen)
      return null
    }
    seen.push({ value, at })
    const n = seen.length
    if (n >= 3 && seen[n - 1].value === seen[n - 3].value) {
      history.set(target, [seen[n - 1]])
      return { value: seen[n - 2].value, gapMs: at - seen[n - 2].at }
    }
    history.set(target, seen.slice(-3))
    return null
  }
}

/**
 * The browser's reading of itself, shared with server actions: the probe
 * writes `tk_act=<session>.<surface>.<viewport>` so a tracked() action lands
 * in the same session and on the same surface as the clicks around it.
 */
export const ACTIVITY_COOKIE = "tk_act"

export function encodeActivityCookie(session: string, surface: string, viewport: string): string {
  return `${session}.${surface}.${viewport}`
}

export function parseActivityCookie(raw: string | undefined | null): { session: string; surface: string; viewport: string } | null {
  if (!raw) return null
  const [session, surface, viewport] = raw.split(".")
  if (!session || !surface || !viewport) return null
  return { session, surface, viewport }
}

/** Should this session id be replaced? */
export function sessionExpired(lastAt: number, now: number, idleMs: number = SESSION_IDLE_MS): boolean {
  return !Number.isFinite(lastAt) || now - lastAt > idleMs
}

/** A short, stable-enough hash for grouping errors (FNV-1a, hex). */
export function fingerprint(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, "0")
}
