import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { Resend } from "resend"
import { db } from "@/db"
import { inquiries } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { mergeLeadPayload, readLead, toLeadListItem } from "@/lib/lead"
import { renderTemplate, templateById } from "@/lib/lead-templates"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const template = templateById(String(body?.templateId ?? ""))
    if (!template) {
      return NextResponse.json({ error: "Unknown template" }, { status: 400 })
    }

    const [row] = await db
      .select()
      .from(inquiries)
      .where(eq(inquiries.id, params.id))
      .limit(1)

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const lead = toLeadListItem(row)
    const rendered = renderTemplate(template, lead)
    const key = process.env.RESEND_API_KEY
    const from = process.env.RESEND_FROM_EMAIL || "hello@tallkarol.com"

    if (!key) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not set" },
        { status: 500 }
      )
    }

    const resend = new Resend(key)
    const { error } = await resend.emails.send({
      from: `Karol at Tall Karol <${from}>`,
      to: row.email,
      replyTo: from,
      subject: rendered.subject,
      text: rendered.body,
    })

    if (error) {
      console.error("outreach send error:", error)
      return NextResponse.json({ error: "Could not send" }, { status: 502 })
    }

    const current = readLead(row.payload)
    const send = {
      kind: template.kind,
      templateId: template.id,
      templateTitle: template.title,
      at: new Date().toISOString(),
    }

    const nextStatus = row.status === "new" ? "contacted" : row.status

    const [updated] = await db
      .update(inquiries)
      .set({
        payload: mergeLeadPayload(row.payload, {
          sends: [...current.sends, send],
        }),
        status: nextStatus,
        updatedAt: new Date(),
      })
      .where(eq(inquiries.id, params.id))
      .returning()

    return NextResponse.json({
      ok: true,
      lead: readLead(updated.payload),
      status: updated.status,
    })
  } catch (err) {
    console.error("outreach error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
