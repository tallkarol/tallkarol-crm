"use server"

import { revalidatePath } from "next/cache"
import { eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { workstreams, type WorkstreamStage } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { CLIENT_PAGES, ROUTES } from "@/lib/nav"
import { tracked } from "@/lib/activity/tracked"

/**
 * A project's workstreams: move one along the stages, or add one. These were
 * the Delivery page's actions until that page was deleted (24 Sep 2026); the
 * project page's lane is what uses them now.
 *
 * Every action returns `{ ok, error }` so the optimistic lane can put a card
 * back if the write is refused.
 */

type Result = { ok: true } | { ok: false; error: string }

function touch(paths: string[]) {
  for (const path of paths) revalidatePath(path)
}

const WORKSTREAM_STAGES: WorkstreamStage[] = [
  "building",
  "review",
  "feedback",
  "approved",
  "live",
]

export const setWorkstreamStageAction = tracked("workstream.setWorkstreamStageAction", async function setWorkstreamStageAction(
  id: string,
  stage: WorkstreamStage
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!WORKSTREAM_STAGES.includes(stage)) return { ok: false, error: "Bad stage." }

  const [row] = await db.select().from(workstreams).where(eq(workstreams.id, id)).limit(1)
  if (!row) return { ok: false, error: "Workstream not found." }
  if (row.stage === stage) return { ok: true }

  // Feedback → review is a new review round: count it.
  const bumpPass = row.stage === "feedback" && stage === "review"
  await db
    .update(workstreams)
    .set({
      stage,
      ...(bumpPass ? { pass: sql`${workstreams.pass} + 1` } : {}),
      updatedAt: new Date(),
    })
    .where(eq(workstreams.id, id))

  touch([ROUTES.home])
  revalidatePath(CLIENT_PAGES, "layout")
  return { ok: true }
})

export const addWorkstreamAction = tracked("workstream.addWorkstreamAction", async function addWorkstreamAction(projectId: string, title: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const trimmed = title.trim().slice(0, 200)
  if (!projectId || !trimmed) return { ok: false, error: "A workstream needs a title." }

  await db.insert(workstreams).values({ projectId, title: trimmed })
  touch([ROUTES.home])
  revalidatePath(CLIENT_PAGES, "layout")
  return { ok: true }
})
