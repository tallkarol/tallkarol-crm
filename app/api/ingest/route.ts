import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import { inquiries } from "@/db/schema"
import type { InquirySource } from "@/db/schema"

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
}

function inferSource(config: Record<string, unknown> | null): InquirySource {
  if (!config) return "contact"
  const engagement = config.engagement as { model?: string } | undefined
  if (engagement?.model) {
    const m = engagement.model.toLowerCase()
    if (m.includes("retainer") || m.includes("fractional")) return "retainer"
    if (m.includes("project")) return "projects"
  }
  return "contact"
}

export async function POST(request: NextRequest) {
  const secret = process.env.INGEST_SECRET
  if (!secret) {
    console.error("INGEST_SECRET is not set")
    return NextResponse.json({ error: "Ingest not configured" }, { status: 500 })
  }

  const auth = request.headers.get("authorization") || ""
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : ""
  if (!token || token !== secret) {
    return unauthorized()
  }

  try {
    const body = await request.json()
    const contact = body?.contact
    const config = (body?.config ?? {}) as Record<string, unknown>

    if (!contact?.email || !contact?.name) {
      return NextResponse.json(
        { error: "Name and email are required" },
        { status: 400 }
      )
    }

    const projectTypes = Array.isArray(config.projectTypes)
      ? (config.projectTypes as string[]).map(String)
      : []

    const [row] = await db
      .insert(inquiries)
      .values({
        name: String(contact.name).trim(),
        email: String(contact.email).trim().toLowerCase(),
        company: contact.company ? String(contact.company).trim() : null,
        source: inferSource(config),
        projectTypes,
        payload: { contact, config },
        status: "new",
      })
      .returning({ id: inquiries.id })

    return NextResponse.json({ ok: true, id: row.id })
  } catch (err) {
    console.error("ingest error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
