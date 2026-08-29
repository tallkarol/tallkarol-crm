import { redirect } from "next/navigation"

/** Meetings folded into the review queue — same decision, one screen. */
export default function MeetingsRedirect() {
  redirect("/timesheet/review?tab=meetings")
}
