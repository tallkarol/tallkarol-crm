import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { inboxMail } from "@/db/schema"
import { authenticateTimeRequest, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * One inbound mail, body included, for tools that cut it into something
 * else — `punchlist.py ingest --mail <id>` reads it here. Device token, like
 * every other agent door.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const caller = await authenticateTimeRequest(_request)
  if (!caller) return unauthorized()

  const mail = await db.query.inboxMail.findFirst({
    where: eq(inboxMail.id, params.id),
    with: { client: { columns: { slug: true, name: true } } },
  })
  if (!mail) return NextResponse.json({ error: "That mail does not exist." }, { status: 404 })

  return NextResponse.json(
    {
      mail: {
        id: mail.id,
        messageId: mail.messageId,
        from: { name: mail.fromName, email: mail.fromEmail },
        to: mail.toEmail,
        subject: mail.subject,
        body: mail.body,
        /** `inbox_mail.body` is the text part — never HTML. */
        bodyKind: "text",
        receivedAt: mail.receivedAt,
        client: mail.client ? { slug: mail.client.slug, name: mail.client.name } : null,
        ticketId: mail.ticketId,
      },
    },
    { headers: { "cache-control": "no-store" } }
  )
}
