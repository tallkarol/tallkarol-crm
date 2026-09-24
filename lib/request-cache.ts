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
