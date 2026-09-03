import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { ROUTES } from "@/lib/nav"
import { occurredOnIn } from "@/lib/punch"
import { logAgentTime } from "@/lib/punches"
import { workspaceTimezone } from "@/lib/timezone"
import { authenticateWidget, unauthorized, widgetUserId } from "@/lib/widget-auth"
import {
  agentConvertRequestId,
  agentConvertTarget,
  agentWindowDays,
  invalidateAgentLedger,
  widgetAgent,
} from "@/lib/widget-agent"

export const dynamic = "force-dynamic"

/**
 * Convert one agent session into billable time.
 *
 *   { sessionRef, hours?, days? }
 *
 * A real financial write from a widget tap, so it is guarded three deep:
 * `agentConvertTarget` refuses a session that is already linked to a
 * timesheet, the proposal id is derived from the session ref so two taps
 * collapse into one row on `logAgentTime`'s own idempotency index, and every
 * remaining rule — the invoiced-month lock, the summary requirement, the
 * hours bounds — is `logAgentTime`'s, reported in the CRM's own words the way
 * the clock write route reports `approvePunch`'s.
 *
 * `hours` overrides the metered figure; omitted, the meter is what bills.
 * Nothing here is forced: a month that already has an invoice comes back as a
 * 409 to be settled in the browser, not overridden from a tile.
 *
 * 200 with the fresh ledger payload plus `logged`. 4xx with `{ error }`.
 */
export async function POST(request: Request) {
  if (!authenticateWidget(request)) return unauthorized()

  const userId = await widgetUserId()
  if (!userId) return NextResponse.json({ error: "No admin user." }, { status: 500 })

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 })
  }

  const sessionRef = typeof body.sessionRef === "string" ? body.sessionRef.trim() : ""
  if (!sessionRef) {
    return NextResponse.json({ error: "sessionRef is required." }, { status: 400 })
  }
  if (body.hours != null && typeof body.hours !== "number") {
    return NextResponse.json({ error: "hours must be a number." }, { status: 400 })
  }

  const target = await agentConvertTarget(sessionRef)
  if (!target.ok) {
    return NextResponse.json({ error: target.error }, { status: target.status })
  }
  const session = target.data

  const hours =
    typeof body.hours === "number" && Number.isFinite(body.hours)
      ? Math.round(body.hours * 100) / 100
      : Math.round(session.meterHours * 100) / 100
  if (!(hours > 0)) {
    return NextResponse.json(
      { error: "That session metered nothing. Send hours to bill it anyway." },
      { status: 422 }
    )
  }

  const tz = await workspaceTimezone()
  // The summary is the invoice line. The model-written one first; the
  // conversation's own title as a fallback, so a session the summarizer never
  // reached can still be billed. Neither present is `logAgentTime`'s 422.
  const summary = (session.summary.trim() || session.name.trim()).slice(0, 4000)

  const result = await logAgentTime({
    userId,
    clientId: session.clientId,
    projectId: session.projectId,
    occurredOn: occurredOnIn(session.startedAt, tz),
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt.toISOString(),
    hours,
    summary,
    note: `Converted from the Agent Ledger widget · ${session.surface} · ${sessionRef}`,
    clientRequestId: agentConvertRequestId(sessionRef),
    // What makes the session count as converted: the `time_entry_sessions`
    // link the next GET reads to keep it out of the queue.
    sessions: [
      {
        ref: sessionRef,
        hours,
        name: session.name,
        surface: session.surface,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt.toISOString(),
        rawHours: session.meterHours,
      },
    ],
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  invalidateAgentLedger()
  revalidatePath(ROUTES.timesheet)
  revalidatePath(ROUTES.timesheetReview)
  revalidatePath(ROUTES.timesheetEntries)
  revalidatePath(ROUTES.home)

  const days = agentWindowDays(
    typeof body.days === "number" ? String(body.days) : (body.days as string | null)
  )

  return NextResponse.json(
    {
      ok: true,
      logged: {
        sessionRef,
        timeEntryId: result.data.timeEntryId,
        punchId: result.data.punch.id,
        hours: result.data.punch.hours,
        occurredOn: result.data.punch.occurredOn,
        client: result.data.punch.clientName,
        slug: result.data.punch.clientSlug,
        /** True when the same tap had already landed — not a second row. */
        replayed: result.data.replayed,
      },
      ...(await widgetAgent(days)),
    },
    { headers: { "cache-control": "no-store" } }
  )
}
