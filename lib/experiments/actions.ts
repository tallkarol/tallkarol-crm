"use server"

import { and, eq } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { db } from "@/db"
import { experimentReadings, experiments, sites } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { captureReading } from "@/lib/experiments/capture"
import { formLocationsOf, pagesOf } from "@/lib/experiments/queries"
import { checkpointWindow, isCheckpoint } from "@/lib/experiments/types"
import { todayKey } from "@/lib/insights/derive"

/**
 * Freeze one checkpoint. Recapturing replaces the row rather than adding a
 * second — a checkpoint is a statement about a window, and a window has one
 * answer.
 */
export async function captureReadingAction(
  siteSlug: string,
  experimentSlug: string,
  checkpoint: string
) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  if (!isCheckpoint(checkpoint)) {
    return { ok: false as const, error: "Unknown checkpoint." }
  }

  const site = await db.query.sites.findFirst({ where: eq(sites.slug, siteSlug) })
  if (!site) return { ok: false as const, error: "Site not found." }

  const experiment = await db.query.experiments.findFirst({
    where: and(eq(experiments.siteId, site.id), eq(experiments.slug, experimentSlug)),
  })
  if (!experiment) return { ok: false as const, error: "Experiment not found." }

  const window = checkpointWindow(experiment, checkpoint)
  const today = todayKey()
  if (window.to >= today) {
    return {
      ok: false as const,
      error: `That window runs to ${window.to} and has not finished yet.`,
    }
  }

  try {
    const payload = await captureReading({
      site,
      from: window.from,
      to: window.to,
      pages: pagesOf(experiment),
      formLocations: formLocationsOf(experiment),
    })

    await db
      .insert(experimentReadings)
      .values({
        experimentId: experiment.id,
        checkpoint,
        windowFrom: window.from,
        windowTo: window.to,
        payload,
      })
      .onConflictDoUpdate({
        target: [experimentReadings.experimentId, experimentReadings.checkpoint],
        set: {
          windowFrom: window.from,
          windowTo: window.to,
          payload,
          capturedAt: new Date(),
        },
      })

    revalidatePath("/insights", "layout")
    return { ok: true as const }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reach GA4."
    return { ok: false as const, error: message }
  }
}

/** Close an experiment out with a verdict, or reopen it. */
export async function setExperimentOutcomeAction(
  siteSlug: string,
  experimentSlug: string,
  status: string,
  verdict: string
) {
  const user = await getSessionUser()
  if (!user) return { ok: false as const, error: "Sign in first." }
  if (!["running", "concluded", "abandoned"].includes(status)) {
    return { ok: false as const, error: "Unknown status." }
  }
  if (verdict && !["supported", "refuted", "inconclusive"].includes(verdict)) {
    return { ok: false as const, error: "Unknown verdict." }
  }

  const site = await db.query.sites.findFirst({ where: eq(sites.slug, siteSlug) })
  if (!site) return { ok: false as const, error: "Site not found." }

  await db
    .update(experiments)
    .set({ status, verdict, updatedAt: new Date() })
    .where(and(eq(experiments.siteId, site.id), eq(experiments.slug, experimentSlug)))

  revalidatePath("/insights", "layout")
  return { ok: true as const }
}
