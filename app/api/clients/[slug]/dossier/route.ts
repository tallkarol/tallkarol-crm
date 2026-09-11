import { NextResponse } from "next/server"
import { and, desc, eq, gte } from "drizzle-orm"
import { db } from "@/db"
import { agentSessions, calendarEvents, clients, inboxMail, supportTickets } from "@/db/schema"
import { listTasks } from "@/lib/tasks"
import { authenticateTimeRequest, unauthorized } from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Everything the CRM already knows about one client, for the client
 * manager's intake (`/intake client <slug>`): sessions, mail, tasks,
 * meetings, tickets — plus the sentences in mail and session summaries that
 * read like commitments, for the session to judge. Read-only; the intake
 * proposes rows from this and Karol picks.
 *
 *   GET /api/clients/<slug>/dossier[?since=ISO]
 */
const COMMITMENT = /\b(i'll|i will|we'll|we will|i can have|by (monday|tuesday|wednesday|thursday|friday|next week|end of|eod|tomorrow)|next week i|will send|will get you|promised?)\b/i

function commitments(text: string, at: string, who: string, source: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && s.length < 300 && COMMITMENT.test(s))
    .slice(0, 5)
    .map((s) => ({ at, who, text: s, source }))
}

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const client = await db.query.clients.findFirst({ where: eq(clients.slug, params.slug.toLowerCase()) })
  if (!client) return NextResponse.json({ error: `No client with slug ${params.slug}.` }, { status: 404 })

  const url = new URL(request.url)
  const sinceRaw = url.searchParams.get("since")
  const since =
    sinceRaw && !Number.isNaN(Date.parse(sinceRaw))
      ? new Date(sinceRaw)
      : new Date(Date.now() - 180 * 86_400_000)

  const [sessions, mail, tasks, meetings, tickets] = await Promise.all([
    db.query.agentSessions.findMany({
      where: and(eq(agentSessions.clientId, client.id), gte(agentSessions.startedAt, since)),
      orderBy: [desc(agentSessions.startedAt)],
      limit: 100,
    }),
    db.query.inboxMail.findMany({
      where: and(eq(inboxMail.clientId, client.id), gte(inboxMail.receivedAt, since)),
      orderBy: [desc(inboxMail.receivedAt)],
      limit: 150,
    }),
    listTasks({ state: "all", clients: [client.slug] }, {}),
    db.query.calendarEvents.findMany({
      where: and(eq(calendarEvents.clientId, client.id), gte(calendarEvents.startsAt, since)),
      orderBy: [desc(calendarEvents.startsAt)],
      limit: 100,
    }),
    db.query.supportTickets.findMany({
      where: eq(supportTickets.clientId, client.id),
      orderBy: [desc(supportTickets.updatedAt)],
      limit: 100,
    }),
  ])

  const promisesHint = [
    ...mail.flatMap((m) =>
      commitments(
        `${m.subject ?? ""}. ${m.snippet ?? ""}`,
        (m.receivedAt ?? m.createdAt).toISOString(),
        m.fromName || m.fromEmail || "",
        `mail ${m.id}`
      )
    ),
    ...sessions.flatMap((s) =>
      commitments(
        [s.summary, ...(s.highlights ?? [])].join(". "),
        (s.startedAt ?? s.createdAt).toISOString(),
        "Karol",
        `session ${s.sessionRef}`
      )
    ),
  ].slice(0, 60)

  return NextResponse.json({
    client: { slug: client.slug, name: client.name },
    sessions: sessions.map((s) => ({
      ref: s.sessionRef,
      at: (s.startedAt ?? s.createdAt).toISOString(),
      title: s.name,
      summary: s.summary,
      highlights: s.highlights ?? [],
    })),
    mail: mail.map((m) => ({
      id: m.id,
      at: (m.receivedAt ?? m.createdAt).toISOString(),
      from: m.fromName ? `${m.fromName} <${m.fromEmail ?? ""}>` : (m.fromEmail ?? ""),
      to: m.toEmail ?? "",
      subject: m.subject ?? "",
      snippet: (m.snippet ?? "").slice(0, 300),
      ticketId: m.ticketId,
    })),
    tasks: tasks.slice(0, 200).map((t) => ({
      id: t.id,
      title: t.title,
      dueOn: t.dueOn,
      status: t.status,
      stage: t.stage,
      completedAt: t.completedAt ? new Date(t.completedAt).toISOString() : null,
    })),
    meetings: meetings.map((e) => ({
      id: e.id,
      startsAt: e.startsAt.toISOString(),
      title: e.title,
      attendees: Array.isArray(e.attendees)
        ? (e.attendees as { email?: string; name?: string }[]).map((a) => a.name || a.email || "").filter(Boolean)
        : [],
    })),
    tickets: tickets.map((t) => ({
      id: t.id,
      subject: t.title,
      status: t.status,
      createdAt: t.createdAt.toISOString(),
      lastMessageAt: t.updatedAt.toISOString(),
    })),
    promisesHint,
  })
}
