"use server"

import { redirect } from "next/navigation"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { slinkRecipients } from "@/db/schema"
import { SLINK_RULES, isEmail, isPublicId, normalizeEmail } from "@/lib/slink"
import { fileAccessRequest, recentRequestCount, slinkByPublicId } from "@/lib/slink-data"
import { requestFingerprint } from "@/lib/slink-auth"
import { readSlinkCookie } from "@/lib/slink-auth"
import { authorize } from "@/lib/slink-data"
import { notify } from "@/lib/notify"
import { ROUTES } from "@/lib/nav"

/**
 * File an access request. Never grants anything — same-domain or not, a person
 * only gets in because Karol said so.
 *
 * The redirect is identical in every case, including a rate-limited or unknown
 * slink, so this cannot be used to find out which handles are real.
 */
export async function requestAccessAction(formData: FormData) {
  const publicId = String(formData.get("publicId") ?? "")
  const done = `/slink/${publicId}/request?done=1`
  if (!isPublicId(publicId)) redirect(done)

  const email = normalizeEmail(String(formData.get("email") ?? ""))
  const name = String(formData.get("name") ?? "").slice(0, 160)
  const reason = String(formData.get("reason") ?? "").slice(0, SLINK_RULES.maxReason)
  if (!isEmail(email)) redirect(done)

  const slink = await slinkByPublicId(publicId)
  if (!slink || slink.status !== "active") redirect(done)

  const { ip } = requestFingerprint()
  if (ip) {
    const recent = await recentRequestCount(slink.id, ip)
    if (recent >= SLINK_RULES.maxRequestsPerHour) redirect(done)
  }

  // Already has a live grant? Nothing to ask for.
  const existing = await db.query.slinkRecipients.findFirst({
    where: and(eq(slinkRecipients.slinkId, slink.id), eq(slinkRecipients.email, email)),
  })
  if (existing && !existing.revokedAt && (!existing.expiresAt || existing.expiresAt > new Date())) {
    redirect(done)
  }

  const auth = await authorize(publicId, readSlinkCookie())

  await fileAccessRequest({
    slinkId: slink.id,
    email,
    name,
    reason,
    requestedBy: auth?.recipient.id ?? null,
    ip,
  })

  await notify({
    kind: "slink.request",
    title: "Access requested",
    body: `${email} asked for"${slink.title}"`,
    url: `${ROUTES.slinks}/${slink.id}`,
    dedupeKey: `slink-request-${slink.id}-${email}`,
  }).catch(() => null)

  redirect(done)
}
