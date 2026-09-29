import { cache } from "react"

/**
 * React's per-request memo, where it exists.
 *
 * `cache` only exists in the React build Next ships. The Mac worker, the cron
 * tick and the tsx scripts load these modules on plain React 18, where it is
 * undefined; they get the function back uncached rather than a crash on
 * import. Same guard as `getSessionUser` in lib/auth.ts.
 */
export const requestCache: <F extends (...args: never[]) => unknown>(fn: F) => F =
  typeof cache === "function" ? cache : (fn) => fn

const requestStore = requestCache((): Map<string, unknown> => new Map())

/**
 * One run per request for a loader that takes `now` (or an object) and so
 * cannot be keyed by `cache` itself: a fresh `new Date()` or a re-read client
 * row never matches the last one. The key names what is loaded; the first
 * caller's `now` stands for the whole request, which is milliseconds long.
 *
 * Outside a render — a server action's body, a route handler, the worker, a
 * script — `cache` does not memoise, the store is new on every call, and
 * `run` always runs. So a write followed by a read in one action still reads
 * its own write.
 */
export function oncePerRequest<T>(key: string, run: () => T): T {
  const store = requestStore()
  if (store.has(key)) return store.get(key) as T
  const value = run()
  store.set(key, value)
  return value
}
