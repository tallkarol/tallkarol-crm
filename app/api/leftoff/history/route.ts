import { NextResponse } from "next/server"
import { authenticateLeftOff, unauthorized } from "@/lib/leftoff-auth"
import { groupByDay, listSessionHistory, HISTORY_DEFAULT_DAYS } from "@/lib/leftoff-history"
import { workspaceTimezone } from "@/lib/timezone"

export const dynamic = "force-dynamic"

/**
 * What the day looked like — every conversation, grouped by workspace-local
 * day, newest first.
 *
 *   GET /api/leftoff/history?since=7d|2026-09-01&day=2026-09-01&client=&surface=
 *   Authorization: Bearer <device or widget token>
 */

const SINCE = /^(\d+)\s*([dh])$/i

function windowFor(url: URL, now: Date): { from: Date; to: Date | null } {
  const day = url.searchParams.get("day")?.trim()
  if (day && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
    // A named day is read in the workspace zone by the grouping, so the query
    // takes a generous window and the grouping decides what lands on the day.
    const start = new Date(`${day}T00:00:00.000Z`)
    return { from: new Date(start.getTime() - 86_400_000), to: new Date(start.getTime() + 2 * 86_400_000) }
  }
  const since = url.searchParams.get("since")?.trim() ?? ""
  const match = SINCE.exec(since)
  if (match) {
    const n = Number(match[1])
    const ms = match[2].toLowerCase() === "h" ? n * 3_600_000 : n * 86_400_000
    return { from: new Date(now.getTime() - ms), to: null }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(since)) return { from: new Date(`${since}T00:00:00.000Z`), to: null }
  return { from: new Date(now.getTime() - HISTORY_DEFAULT_DAYS * 86_400_000), to: null }
}

export async function GET(request: Request) {
  if (!(await authenticateLeftOff(request))) return unauthorized()

  const now = new Date()
  const url = new URL(request.url)
  const { from, to } = windowFor(url, now)
  const rows = await listSessionHistory(
    {
      from,
      to,
      clientSlug: url.searchParams.get("client")?.trim() || null,
      surface: url.searchParams.get("surface")?.trim() || null,
    },
    now
  )
  const tz = await workspaceTimezone()
  const named = url.searchParams.get("day")?.trim()
  const days = groupByDay(rows, tz, now).filter((d) => !named || d.day === named)

  return NextResponse.json(
    {
      generatedAt: now.toISOString(),
      timeZone: tz,
      days: days.map((d) => ({
        day: d.day,
        label: d.label,
        sessions: d.sessions.map((s) => ({
          sessionRef: s.sessionRef,
          surface: s.surface,
          title: s.title,
          project: s.project,
          branch: s.branch,
          state: s.state,
          client: s.client,
          summary: s.summary,
          lastPrompt: s.lastPrompt,
          lastReply: s.lastReply,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          at: s.at,
          messageCount: s.messageCount,
          resumeCommand: s.resumeCommand,
          openPath: s.openPath,
        })),
      })),
    },
    { headers: { "cache-control": "no-store" } }
  )
}
