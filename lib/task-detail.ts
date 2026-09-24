import { eq } from "drizzle-orm"
import { db } from "@/db"
import { tasks } from "@/db/schema"
import { requestCache } from "@/lib/request-cache"

/**
 * One task with everything its card shows.
 *
 * Request-cached. The card used to check the row existed, then read it again
 * with its relations, and the full page read it a third time for its title:
 * three round trips for one row, each one waited on before the next. Every
 * caller in a request now shares the first read.
 */
export const loadTaskDetail = requestCache(async function loadTaskDetail(id: string) {
  return db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: { client: true, retainer: true, project: true, product: true, deliverable: true },
  })
})

export type TaskDetailRow = NonNullable<Awaited<ReturnType<typeof loadTaskDetail>>>
