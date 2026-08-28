import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { inquiries } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import {
  mergeLeadPayload,
  QUALIFICATIONS,
  readLead,
  type Qualification,
} from "@/lib/lead"

function isQualification(value: unknown): value is Qualification {
  return QUALIFICATIONS.includes(value as Qualification)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const [row] = await db
      .select()
      .from(inquiries)
      .where(eq(inquiries.id, params.id))
      .limit(1)

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const current = readLead(row.payload)
    const patch: Partial<typeof current> = {}

    if (body.qualification !== undefined) {
      if (!isQualification(body.qualification)) {
        return NextResponse.json({ error: "Invalid qualification" }, { status: 400 })
      }
      patch.qualification = body.qualification
    }
    if (body.meetingAt !== undefined) {
      patch.meetingAt =
        typeof body.meetingAt === "string" && body.meetingAt.trim()
          ? body.meetingAt
          : null
    }
    if (typeof body.meetingNotes === "string") {
      patch.meetingNotes = body.meetingNotes
    }
    if (typeof body.notes === "string") {
      patch.notes = body.notes
    }

    const [updated] = await db
      .update(inquiries)
      .set({
        payload: mergeLeadPayload(row.payload, patch),
        updatedAt: new Date(),
      })
      .where(eq(inquiries.id, params.id))
      .returning()

    return NextResponse.json({
      ok: true,
      lead: readLead(updated.payload),
    })
  } catch (err) {
    console.error("lead update error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
