import { NextResponse } from"next/server"
import { isPublicId } from"@/lib/slink"
import { authorize, logEvent } from"@/lib/slink-data"
import { revealCredential } from"@/lib/slink-live"
import { SLINK_HEADERS, readSlinkCookie, requestFingerprint } from"@/lib/slink-auth"

export const dynamic ="force-dynamic"

/**
 * Hand over one secret, and write down who asked.
 *
 * The event is logged BEFORE the secret is returned, so a reveal cannot be
 * read without leaving a trace even if the response never arrives.
 */
export async function POST(
 request: Request,
 { params }: { params: { publicId: string } }
) {
 if (!isPublicId(params.publicId)) {
 return new NextResponse("Not found", { status: 404, headers: SLINK_HEADERS })
 }
 const auth = await authorize(params.publicId, readSlinkCookie())
 if (!auth) {
 return new NextResponse("Unauthorized", { status: 401, headers: SLINK_HEADERS })
 }

 const body = (await request.json().catch(() => null)) as { blockId?: string } | null
 const blockId = typeof body?.blockId ==="string" ? body.blockId :""
 if (!blockId) return new NextResponse("Bad request", { status: 400, headers: SLINK_HEADERS })

 const { ip, userAgent } = requestFingerprint()
 await logEvent({
 slinkId: auth.slink.id,
 recipientId: auth.recipient.id,
 kind:"revealed",
 detail: blockId,
 ip,
 userAgent,
 })

 const secret = await revealCredential(blockId, auth.slink.id)
 if (secret === null) {
 return new NextResponse("Not found", { status: 404, headers: SLINK_HEADERS })
 }
 return NextResponse.json({ secret }, { headers: SLINK_HEADERS })
}
