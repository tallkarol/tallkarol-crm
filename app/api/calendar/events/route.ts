import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { writeCalendarEvent } from "@/lib/calendar-write"
import {
  authenticateTimeRequest,
  badRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Create an event on the destination calendar from anything holding a device
 * token — the `/follow-up` skill, a shortcut, a script.
 *
 * { title, startsAt, endsAt, timeZone?, description?, location?,
 *   attendees?: string[], clientRequestId? }
 *
 * `startsAt`/`endsAt` are local wall-clock `YYYY-MM-DDTHH:mm` read in
 * `timeZone` (default UTC — send yours). `clientRequestId` is stored on the
 * Google event; replaying it returns the same event with 200 instead of a twin.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const title = readString(body, "title")
  if (!title) return badRequest("Send a title.")

  const attendees = Array.isArray(body.attendees)
    ? body.attendees
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.includes("@"))
    : []

  const result = await writeCalendarEvent({
    title,
    description: readString(body, "description") ?? "",
    location: readString(body, "location") ?? "",
    startsAt: readString(body, "startsAt") ?? "",
    endsAt: readString(body, "endsAt") ?? "",
    timeZone: readString(body, "timeZone") ?? "UTC",
    attendees,
    refKey: readString(body, "clientRequestId"),
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  revalidatePath("/calendar")
  return NextResponse.json(
    { event: { id: result.id, url: result.url }, replayed: result.replayed },
    { status: result.replayed ? 200 : 201 }
  )
}
