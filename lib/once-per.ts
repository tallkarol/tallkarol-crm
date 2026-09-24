/**
 * Run `fn` at most once per `ms` in this server process, sharing the
 * in-flight promise with concurrent callers. For the lazy sweeps that ride
 * along on page renders (renewal tasks, recurring reopen): they used to run
 * on every dashboard load and every peek opened on it, two or three round
 * trips each before the page read anything. The cron tick runs them on a
 * schedule anyway, so a render only needs them when the last run is stale.
 *
 * A failed run clears the slot so the next render retries.
 */
const slots = new Map<string, { at: number; run: Promise<unknown> }>()

export function oncePer<T>(key: string, ms: number, fn: () => Promise<T>): Promise<T | undefined> {
  const now = Date.now()
  const slot = slots.get(key)
  if (slot && now - slot.at < ms) return slot.run.then(() => undefined)
  const run = fn().catch((err) => {
    slots.delete(key)
    throw err
  })
  slots.set(key, { at: now, run })
  return run
}

/** Five minutes — the render-path sweeps' staleness budget. */
export const SWEEP_MS = 5 * 60_000
