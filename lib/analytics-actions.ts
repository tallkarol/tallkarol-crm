"use server"

import { asc, eq } from "drizzle-orm"
import { db } from "@/db"
import { sites } from "@/db/schema"
import { sendAnalyticsTestEvent } from "@/lib/analytics"
import { getSessionUser } from "@/lib/auth"

async function siteBySlug(slug: string) {
  if (slug) {
    return db.query.sites.findFirst({ where: eq(sites.slug, slug) })
  }
  return db.query.sites.findFirst({ orderBy: [asc(sites.sort), asc(sites.name)] })
}

/** Fires one Measurement Protocol event so Realtime proves the pipe. */
export async function sendTestHitAction(slug: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const site = await siteBySlug(slug)
  if (!site) return { ok: false, error: "Site not found." }
  return sendAnalyticsTestEvent(site.measurementId, site.origin)
}
