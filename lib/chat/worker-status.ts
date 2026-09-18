import { eq } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema"

/**
 * Is a worker attached?
 *
 * Turns run on Karol's Mac, so the CRM can queue work perfectly and still
 * have nothing answer it. A queued turn with no worker looks exactly like a
 * turn that is thinking hard — the page spins either way — which is how a
 * message once sat unanswered for twenty minutes while the model itself was
 * only ever sixteen seconds of the wait.
 *
 * The signal is a heartbeat on the worker's own timer, NOT its poll loop: a
 * turn that takes two minutes makes zero polls, and a poll-based check would
 * declare a busy worker dead in the middle of the job it was doing.
 */

/** The chat worker's row. The meeting worker beats under `meeting_worker`; same shape, same staleness. */
const KEY = "chat_worker"

/** Four missed beats at the worker's five-second timer. */
const STALE_MS = 20_000

export type WorkerStatus = {
  /** The last worker to check in — "mac-61717". Empty if none ever has. */
  name: string
  lastSeenAt: string | null
  online: boolean
  /** Seconds since the last beat, for "last seen 4m ago". */
  secondsAgo: number | null
  /** The turn the worker says it is running right now, if any. */
  running: string | null
  /** The commit the worker's checkout was on when it started — "adfc632", or "" for an older worker. */
  commit: string
  startedAt: string | null
  /** The commit the CRM itself runs (Railway sets it); "" locally. Differs from `commit` → the worker needs a kickstart. */
  crmCommit: string
}

/** What a beat may say beyond its name. All optional: an older worker sends the name alone. */
export type WorkerBeat = {
  running?: string | null
  commit?: string
  startedAt?: string
}

export async function recordWorkerSeen(name: string, key: string = KEY, beat: WorkerBeat = {}) {
  const value = {
    name,
    lastSeenAt: new Date().toISOString(),
    running: beat.running ?? null,
    commit: beat.commit ?? "",
    startedAt: beat.startedAt ?? null,
  }
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    })
}

export async function workerStatus(key: string = KEY): Promise<WorkerStatus> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, key),
  })
  const value = (row?.value ?? {}) as {
    name?: unknown
    lastSeenAt?: unknown
    running?: unknown
    commit?: unknown
    startedAt?: unknown
  }

  const name = typeof value.name === "string" ? value.name : ""
  const lastSeenAt =
    typeof value.lastSeenAt === "string" ? value.lastSeenAt : null
  const running = typeof value.running === "string" && value.running ? value.running : null
  const commit = typeof value.commit === "string" ? value.commit : ""
  const startedAt = typeof value.startedAt === "string" ? value.startedAt : null
  const crmCommit = (process.env.RAILWAY_GIT_COMMIT_SHA ?? "").slice(0, 7)

  if (!lastSeenAt) {
    return { name, lastSeenAt: null, online: false, secondsAgo: null, running, commit, startedAt, crmCommit }
  }

  const elapsed = Date.now() - new Date(lastSeenAt).getTime()
  return {
    name,
    lastSeenAt,
    online: elapsed < STALE_MS,
    secondsAgo: Math.max(0, Math.round(elapsed / 1000)),
    running,
    commit,
    startedAt,
    crmCommit,
  }
}

/** The worker runs a different commit than the CRM, as far as either can tell. */
export function workerOutdated(status: WorkerStatus): boolean {
  return Boolean(status.commit && status.crmCommit && status.commit.slice(0, 7) !== status.crmCommit)
}
