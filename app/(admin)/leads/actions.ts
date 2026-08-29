"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { inquiries } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { isSalesStage, mergePipelinePayload } from "@/lib/lead"
import { ROUTES } from "@/lib/nav"

/**
 * The sales board's writes. These used to live under `/pipeline`; the board
 * moved to leads, where the rest of a lead's life already was.
 */

type Result = { ok: true } | { ok: false; error: string }

function touch() {
  revalidatePath(ROUTES.leads)
  revalidatePath(ROUTES.inbox)
  revalidatePath(ROUTES.home)
}

export async function setLeadStageAction(id: string, stage: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (!isSalesStage(stage)) return { ok: false, error: "Bad stage." }

  const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1)
  if (!row) return { ok: false, error: "Lead not found." }

  await db
    .update(inquiries)
    .set({
      payload: mergePipelinePayload(row.payload, {
        stage,
        stageChangedAt: new Date().toISOString(),
      }),
      updatedAt: new Date(),
      // The board's Closed column and the inbox's closed status stay in sync.
      ...(stage === "closed"
        ? { status: "closed" as const }
        : row.status === "closed"
          ? { status: "contacted" as const }
          : {}),
    })
    .where(eq(inquiries.id, id))

  touch()
  return { ok: true }
}

export async function setLeadValueAction(
  id: string,
  valueCents: number | null
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  if (valueCents != null && (!Number.isFinite(valueCents) || valueCents < 0)) {
    return { ok: false, error: "That isn't a value." }
  }

  const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1)
  if (!row) return { ok: false, error: "Lead not found." }

  await db
    .update(inquiries)
    .set({
      payload: mergePipelinePayload(row.payload, { valueCents }),
      updatedAt: new Date(),
    })
    .where(eq(inquiries.id, id))

  touch()
  return { ok: true }
}
