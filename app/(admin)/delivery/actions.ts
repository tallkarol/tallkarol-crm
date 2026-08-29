"use server"

import { revalidatePath } from "next/cache"
import { eq, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  retainers,
  workstreams,
  type RetainerStatus,
  type WorkstreamStage,
} from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"

/**
 * The mutations the delivery ledger and its modal own. Project, fee and
 * deliverable status already live in `lib/peek-actions.ts` and are reused as
 * they are — only the two things nothing else could set get new actions here.
 *
 * Every action returns `{ ok, error }` so the optimistic controls can put a
 * row back if the write is refused.
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

export async function setWorkstreamStageAction(
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

  touch([ROUTES.delivery, ROUTES.projects, ROUTES.home])
  return { ok: true }
}

export async function addWorkstreamAction(projectId: string, title: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const trimmed = title.trim().slice(0, 200)
  if (!projectId || !trimmed) return { ok: false, error: "A workstream needs a title." }

  await db.insert(workstreams).values({ projectId, title: trimmed })
  touch([ROUTES.delivery, ROUTES.projects, ROUTES.home])
  return { ok: true }
}

const RETAINER_STATUSES: RetainerStatus[] = ["active", "paused", "ended"]

export async function setRetainerStatusAction(
  id: string,
  status: RetainerStatus
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!RETAINER_STATUSES.includes(status)) return { ok: false, error: "Bad status." }

  const [row] = await db
    .update(retainers)
    .set({ status, updatedAt: new Date() })
    .where(eq(retainers.id, id))
    .returning()
  if (!row) return { ok: false, error: "Retainer not found." }

  touch([ROUTES.delivery, ROUTES.retainers, ROUTES.retainer(row.slug), ROUTES.home])
  return { ok: true }
}

export async function setRetainerNotesAction(id: string, notes: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const [row] = await db
    .update(retainers)
    .set({ notes: notes.slice(0, 4000), updatedAt: new Date() })
    .where(eq(retainers.id, id))
    .returning()
  if (!row) return { ok: false, error: "Retainer not found." }

  touch([ROUTES.delivery, ROUTES.retainers, ROUTES.retainer(row.slug)])
  return { ok: true }
}
