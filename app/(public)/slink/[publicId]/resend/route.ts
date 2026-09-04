import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { slinkRecipients } from "@/db/schema"
import { grantAllows, isEmail, isPublicId, normalizeEmail } from "@/lib/slink"
import { slinkByPublicId } from "@/lib/slink-data"
import { SLINK_HEADERS, sendMagicLink, slinkUrl } from "@/lib/slink-auth"

export const dynamic = "force-dynamic"

/**
 *"Send me a fresh link."
 *
 * Always answers the same way, whether or not that address has a grant. A
 * different answer for a known address would turn this into an oracle for
 * who Karol works with.
 *
 * A lapsed grant is deliberately NOT renewed here — that would make expiry
 * meaningless. It goes back to Karol through the access-request queue.
 */
export async function POST(request: Request, { params }: { params: { publicId: string } }) {
  const done = NextResponse.redirect(`${slinkUrl(params.publicId)}?sent=1`, {
    status: 303,
    headers: SLINK_HEADERS,
  })
  if (!isPublicId(params.publicId)) return done

  const form = await request.formData().catch(() => null)
  const email = normalizeEmail(String(form?.get("email") ?? ""))
  if (!isEmail(email)) return done

  const slink = await slinkByPublicId(params.publicId)
  if (!slink || slink.status !== "active") return done

  const recipient = await db.query.slinkRecipients.findFirst({
    where: and(eq(slinkRecipients.slinkId, slink.id), eq(slinkRecipients.email, email)),
  })
  if (!recipient || !grantAllows(recipient, new Date())) return done

  await sendMagicLink({
    slinkId: slink.id,
    publicId: slink.publicId,
    recipientId: recipient.id,
    email: recipient.email,
    title: slink.title,
    expiresAt: recipient.expiresAt,
  }).catch(() => null)

  return done
}
