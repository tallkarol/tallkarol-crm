import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { ATTACH } from "@/lib/chat/attachments"
import { saveAttachment } from "@/lib/chat/attachment-data"

export const dynamic = "force-dynamic"

/**
 * The composer's upload: one image per request, the raw bytes as the body,
 * sent the moment Karol pastes. A route handler rather than a server action
 * because actions cap bodies at 1 MB.
 *
 * The Content-Type must be an image type. That is not how the image is
 * judged — the bytes are sniffed — it is what makes a cross-site form post
 * impossible: `image/*` is not a type a form can send without a preflight.
 */
export async function POST(request: Request) {
  const user = await getSessionUser()
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 })

  const type = request.headers.get("content-type") ?? ""
  if (!/^image\/(png|jpeg)$/.test(type)) {
    return NextResponse.json({ error: "Send the image as image/png or image/jpeg." }, { status: 415 })
  }
  const declared = Number(request.headers.get("content-length") ?? 0)
  if (declared > ATTACH.maxBytes) {
    return NextResponse.json({ error: `Images are capped at ${ATTACH.maxBytes / 1024 / 1024} MB.` }, { status: 413 })
  }

  const bytes = new Uint8Array(await request.arrayBuffer())
  let name = ""
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? "")
  } catch {
    name = ""
  }

  const saved = await saveAttachment(user.id, bytes, name)
  if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 422 })
  return NextResponse.json({ attachment: saved.attachment }, { status: 201 })
}
