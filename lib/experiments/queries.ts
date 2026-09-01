import { and, asc, desc, eq } from "drizzle-orm"
import { db } from "@/db"
import { experimentReadings, experiments, sites } from "@/db/schema"
import type { Experiment, ExperimentReading } from "@/db/schema"
import type { FormLocationSpec, PageSpec } from "@/lib/experiments/types"

export type ExperimentWithReadings = Experiment & {
  readings: ExperimentReading[]
}

export async function getExperimentsForSite(
  siteId: string
): Promise<ExperimentWithReadings[]> {
  return db.query.experiments.findMany({
    where: eq(experiments.siteId, siteId),
    with: { readings: { orderBy: [asc(experimentReadings.windowTo)] } },
    orderBy: [desc(experiments.startedOn)],
  })
}

export async function getExperiment(
  siteSlug: string,
  slug: string
): Promise<ExperimentWithReadings | null> {
  const site = await db.query.sites.findFirst({ where: eq(sites.slug, siteSlug) })
  if (!site) return null
  const row = await db.query.experiments.findFirst({
    where: and(eq(experiments.siteId, site.id), eq(experiments.slug, slug)),
    with: { readings: { orderBy: [asc(experimentReadings.windowTo)] } },
  })
  return row ?? null
}

/** `pages` and `formLocations` are jsonb — narrow them once, here. */
export function pagesOf(experiment: Experiment): PageSpec[] {
  return Array.isArray(experiment.pages) ? (experiment.pages as PageSpec[]) : []
}

export function formLocationsOf(experiment: Experiment): FormLocationSpec[] {
  return Array.isArray(experiment.formLocations)
    ? (experiment.formLocations as FormLocationSpec[])
    : []
}
