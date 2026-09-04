import { NextResponse } from "next/server"
import { db } from "@/db"
import { isPublicId } from "@/lib/slink"
import { exchangeToken, logEvent, slinkByPublicId } from "@/lib/slink-data"
import { SLINK_HEADERS, requestFingerprint, setSlinkCookie, slinkUrl } from "@/lib/slink-auth"

export const dynamic = "force-dynamic"

/**
 * Trade a magic link for a session, then get out of the URL.
 *
 * The redirect matters: it strips the token from the address bar so it stops
 * appearing in history, screenshots and any referer the browser might send.
 * The token is single use anyway, but a spent credential lying around in a
 * URL is still worth clearing.
 *
 * Every failure lands on the same page with a reason the recipient can act on.
 * Nothing here confirms whether a slink exists to somebody without a token.
 */
export async function GET(request: Request, { params }: { params: { publicId: string } }) {
  const notFound = new NextResponse("Not found", { status: 404, headers: SLINK_HEADERS })
  if (!isPublicId(params.publicId)) return notFound

  const token = new URL(request.url).searchParams.get("token") ?? ""
  const base = slinkUrl(params.publicId)
  if (!token) return NextResponse.redirect(`${base}?e=missing`, { headers: SLINK_HEADERS })

  const slink = await slinkByPublicId(params.publicId)
  if (!slink || slink.status !== "active") return notFound

  const result = await exchangeToken(token, new Date(), db)
  if (!result.ok) {
    return NextResponse.redirect(`${base}?e=${result.reason}`, { headers: SLINK_HEADERS })
  }
  // A token minted for one slink must not open another.
  if (result.slinkId !== slink.id) return notFound

  const { ip, userAgent } = requestFingerprint()
  await logEvent({
    slinkId: slink.id,
    recipientId: result.recipientId,
    kind: "opened",
    ip,
    userAgent,
  })

  setSlinkCookie(result.session)
  return NextResponse.redirect(base, { headers: SLINK_HEADERS })
}
