"use server"

import { revalidatePath } from "next/cache"
import { eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { inquiries, workstreams, type WorkstreamStage } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import { isSalesStage, mergePipelinePayload } from "@/lib/pipeline"

export async function setLeadStage(id: string, stage: string, valueCents?: number | null) {
  const user = await getSessionUser()
  if (!user || !isSalesStage(stage)) return

  const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1)
  if (!row) return

  const payload = mergePipelinePayload(row.payload, {
    stage,
    stageChangedAt: new Date().toISOString(),
    ...(valueCents !== undefined ? { valueCents } : {}),
  })
  await db
    .update(inquiries)
    .set({
      payload,
      updatedAt: new Date(),
      // The board's Closed column and the inbox's closed status stay in sync.
      ...(stage === "closed"
        ? { status: "closed" as const }
        : row.status === "closed"
          ? { status: "contacted" as const }
          : {}),
    })
    .where(eq(inquiries.id, id))
  revalidatePath(ROUTES.pipeline)
}

export async function setLeadValue(id: string, valueCents: number | null) {
  const user = await getSessionUser()
  if (!user) return
  const [row] = await db.select().from(inquiries).where(eq(inquiries.id, id)).limit(1)
  if (!row) return
  await db
    .update(inquiries)
    .set({ payload: mergePipelinePayload(row.payload, { valueCents }), updatedAt: new Date() })
    .where(eq(inquiries.id, id))
  revalidatePath(ROUTES.pipeline)
}

const WORKSTREAM_STAGE_IDS: WorkstreamStage[] = [
  "building",
  "review",
  "feedback",
  "approved",
  "live",
]

export async function setWorkstreamStage(id: string, stage: string) {
  const user = await getSessionUser()
  if (!user || !WORKSTREAM_STAGE_IDS.includes(stage as WorkstreamStage)) return

  const [row] = await db.select().from(workstreams).where(eq(workstreams.id, id)).limit(1)
  if (!row || row.stage === stage) return

  // Feedback → review is a new review round: count it.
  const bumpPass = row.stage === "feedback" && stage === "review"
  await db
    .update(workstreams)
    .set({
      stage: stage as WorkstreamStage,
      ...(bumpPass ? { pass: sql`${workstreams.pass} + 1` } : {}),
      updatedAt: new Date(),
    })
    .where(eq(workstreams.id, id))
  revalidatePath(ROUTES.pipeline)
}

export async function addWorkstream(formData: FormData) {
  const user = await getSessionUser()
  if (!user) return
  const projectId = String(formData.get("projectId") || "")
  const title = String(formData.get("title") || "").trim()
  if (!projectId || !title) return
  await db.insert(workstreams).values({ projectId, title })
  revalidatePath(ROUTES.pipeline)
}
