import { cache } from "react"
import { max } from "drizzle-orm"
import { db } from "@/db"
import { inboxState } from "@/db/schema"
import { loadInbox } from "@/lib/inbox-data"
import { summarizeUnread, type UnreadSummary } from "@/lib/unread"

/**
 * The db half of the Unread card. Split from `lib/unread.ts` for the same
 * reason `inbox-data` is split from `inbox`: the shell reads tones on the
 * client, and a `db` import there drags postgres into the browser bundle.
 *
 * `cache()` is the point of this file. The admin layout already loaded the
 * whole inbox on every page for the sidebar badge; wrapping it per request
 * means the layout, the badges and the dashboard card now share that one
 * read instead of each paying for their own.
 */
export const loadUnread = cache(async function loadUnread(
  now = new Date()
): Promise<UnreadSummary> {
  const [inbox, cleared] = await Promise.all([
    loadInbox(now),
    // The last time anything was triaged — which, in the only state that
    // shows it (nothing unread), is exactly when the inbox was emptied.
    db
      .select({ at: max(inboxState.updatedAt) })
      .from(inboxState)
      .then(([row]) => row?.at ?? null)
      .catch(() => null),
  ])

  return summarizeUnread(inbox.items, cleared, inbox.ready, now)
})
