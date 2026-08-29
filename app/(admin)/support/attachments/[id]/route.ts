import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { db } from "@/db"
import { ticketAttachments } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"

/**
 * Serves a ticket attachment to a signed-in admin. Bytes live in Postgres for
 * now; when storage is provisioned this reads `storageKey` and redirects
 * instead, with no change to the pages that link here.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser()
  if (!user) return new NextResponse("Unauthorized", { status: 401 })

  const row = await db.query.ticketAttachments.findFirst({
    where: eq(ticketAttachments.id, params.id),
  })
  if (!row) return new NextResponse("Not found", { status: 404 })

  if (row.storageKey && !row.data) {
    return NextResponse.redirect(row.storageKey)
  }
  if (!row.data) return new NextResponse("Not found", { status: 404 })

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(row.bytes),
      "Content-Disposition": `inline; filename="${row.name.replace(/"/g, "")}"`,
      "Cache-Control": "private, max-age=3600",
    },
  })
}
