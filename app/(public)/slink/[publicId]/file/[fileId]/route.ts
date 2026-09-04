import { NextResponse } from "next/server"
import { isPublicId } from "@/lib/slink"
import { authorize, logEvent, readFile } from "@/lib/slink-data"
import { SLINK_HEADERS, readSlinkCookie, requestFingerprint } from "@/lib/slink-auth"

export const dynamic = "force-dynamic"

/**
 * A file, to the person it was shared with. Scoped by the slink the session
 * belongs to, so a file id from one slink cannot be pulled through another.
 * Bytes come from Postgres today; `storage_key` is the seam for moving them.
 */
export async function GET(_request: Request, { params }: { params: { publicId: string; fileId: string } }) {
  const notFound = new NextResponse("Not found", { status: 404, headers: SLINK_HEADERS })
  if (!isPublicId(params.publicId)) return notFound

  const auth = await authorize(params.publicId, readSlinkCookie())
  if (!auth) return new NextResponse("Unauthorized", { status: 401, headers: SLINK_HEADERS })

  const file = await readFile(params.fileId, auth.slink.id)
  if (!file) return notFound

  const { ip, userAgent } = requestFingerprint()
  await logEvent({
    slinkId: auth.slink.id,
    recipientId: auth.recipient.id,
    kind: "downloaded",
    detail: file.name,
    ip,
    userAgent,
  })

  if (file.storageKey && !file.data) {
    return NextResponse.redirect(file.storageKey, { headers: SLINK_HEADERS })
  }
  if (!file.data) return notFound

  return new NextResponse(new Uint8Array(file.data), {
    headers: {
      ...SLINK_HEADERS,
      "Content-Type": file.mime,
      "Content-Length": String(file.bytes),
      "Content-Disposition": `attachment; filename="${file.name.replace(/"/g, "")}"`,
    },
  })
}
