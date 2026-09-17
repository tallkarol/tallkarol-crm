import { NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { attachmentFile, imageResponse } from "@/lib/chat/attachment-data"

export const dynamic = "force-dynamic"

/** A pasted screenshot, for the thumbnail and the full-size tab. Its owner only. */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const row = await attachmentFile(params.id)
  if (!row || row.userId !== user.id) return new NextResponse("Not found", { status: 404 })
  return imageResponse(row)
}
