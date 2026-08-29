import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { approvePunch } from "@/lib/punches"
import {
  authenticateTimeRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Turn a stopped punch into a billable time entry.
 *
 * { summary?, hours?, projectId?, occurredOn? }
 *
 * 422 when the punch cannot be billed as it stands — no client, or no project
 * and no summary to explain the work.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const hours = body.hours
  if (hours !== undefined && typeof hours !== "number") {
    return NextResponse.json({ error: "`hours` must be a number." }, { status: 400 })
  }

  const result = await approvePunch({
    punchId: params.id,
    approvedBy: caller.userId,
    summary: readString(body, "summary") ?? undefined,
    hours: typeof hours === "number" ? hours : undefined,
    projectId: "projectId" in body ? readString(body, "projectId") : undefined,
    occurredOn: readString(body, "occurredOn") ?? undefined,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  revalidatePath("/timesheet")
  revalidatePath("/timesheet/review")

  return NextResponse.json({
    punch: result.data.punch,
    timeEntryId: result.data.timeEntryId,
  })
}
