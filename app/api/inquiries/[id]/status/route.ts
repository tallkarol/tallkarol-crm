import { NextRequest, NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { inquiries, type InquiryStatus } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"

const ALLOWED: InquiryStatus[] = ["new", "contacted", "closed"]

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
    const status = body?.status as InquiryStatus
    if (!ALLOWED.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 })
    }

    const [row] = await db
      .update(inquiries)
      .set({ status, updatedAt: new Date() })
      .where(eq(inquiries.id, params.id))
      .returning({ id: inquiries.id, status: inquiries.status })

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ ok: true, inquiry: row })
  } catch (err) {
    console.error("status update error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
