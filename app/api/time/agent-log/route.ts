import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { clients, projects } from "@/db/schema"
import { logAgentTime, type AgentLogSession } from "@/lib/punches"
import {
  authenticateTimeRequest,
  badRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"
import { workspaceTimezone } from "@/lib/timezone"
import { clientTimezoneFor } from "@/lib/client-timezone"

export const dynamic = "force-dynamic"

/**
 * Agent hours from `/log-session` (daedalus-hive-mind). The human approval
 * happened in the chat that built the proposal, so the row lands already
 * approved: an `agent` punch with the real start/end and the audit note, plus
 * the billable entry. Karol's device token is the credential, revocable at
 * /settings/integrations/devices like any other device.
 *
 * POST { clientSlug | clientId, projectSlug? | projectId?, occurredOn,
 *        startedAt, endedAt, hours, summary, note?, clientRequestId, force?,
 *        sessions?: [{ ref, hours, name?, surface?, startedAt?, endedAt?, rawHours? }] }
 *
 * `sessions` links the conversations that earned the row (`time_entry_sessions`)
 * so the ledger can open each one's summary; it never changes the number.
 *
 * 201 with { punch, timeEntryId }. 200 when the same clientRequestId is
 * replayed with the same body. 409 when it is replayed with a different one,
 * or when the month is already invoiced (send force:true to log anyway).
 * 422 when the row cannot bill as it stands.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  if (typeof body.hours !== "number") return badRequest("`hours` must be a number.")

  const result = await logAgentTime({
    userId: caller.userId,
    deviceId: caller.deviceId,
    clientId: readString(body, "clientId"),
    clientSlug: readString(body, "clientSlug"),
    projectId: readString(body, "projectId"),
    projectSlug: readString(body, "projectSlug"),
    occurredOn: readString(body, "occurredOn") ?? "",
    startedAt: body.startedAt,
    endedAt: body.endedAt,
    hours: body.hours,
    summary: readString(body, "summary") ?? "",
    note: readString(body, "note") ?? "",
    clientRequestId: readString(body, "clientRequestId") ?? "",
    force: body.force === true,
    sessions: Array.isArray(body.sessions)
      ? (body.sessions as AgentLogSession[]).filter((s) => s && typeof s === "object")
      : [],
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  revalidatePath("/timesheet")
  revalidatePath("/timesheet/review")

  return NextResponse.json(
    {
      punch: result.data.punch,
      timeEntryId: result.data.timeEntryId,
      replayed: result.data.replayed,
    },
    { status: result.data.replayed ? 200 : 201 }
  )
}

/**
 * GET ?client=<slug> — does this slug exist, what projects can a proposal
 * file under, the workspace zone (what a day means on the sheet) and the
 * client's own zone (what a meeting time means). `/api/time/projects` is not
 * enough here: it lists punch targets, which skip clients with no retainer
 * and no punch history.
 */
export async function GET(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const slug = new URL(request.url).searchParams.get("client")?.trim()
  if (!slug) return badRequest("Send ?client=<slug>.")

  const client = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
    columns: { id: true, name: true, slug: true },
  })
  const rows = client
    ? await db.query.projects.findMany({
        where: eq(projects.clientId, client.id),
        columns: { id: true, name: true, slug: true, status: true },
        orderBy: (table, { asc }) => [asc(table.name)],
      })
    : []

  return NextResponse.json(
    {
      client: client ?? null,
      projects: rows,
      timezone: await workspaceTimezone(),
      clientTimezone: client ? await clientTimezoneFor(client.slug) : null,
    },
    { headers: { "cache-control": "no-store" } }
  )
}
