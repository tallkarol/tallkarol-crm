import { NextResponse } from "next/server"
import { authenticateLeftOff, unauthorized } from "@/lib/leftoff-auth"
import { searchSessions, type SessionSearchResult } from "@/lib/leftoff-history"

export const dynamic = "force-dynamic"

/**
 * Search every prompt and reply the board has ever stored.
 *
 *   GET /api/leftoff/search?q=&client=&surface=&from=&to=&limit=
 *   Authorization: Bearer <device or widget token>
 *
 * Answers the CLI (`leftoff search`) and the Mac menu bar. Snippets arrive as
 * runs of text flagged hit / not hit, so no caller has to parse markup.
 */

function instant(value: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function payload(row: SessionSearchResult) {
  return {
    sessionRef: row.sessionRef,
    surface: row.surface,
    title: row.title,
    project: row.project,
    cwd: row.cwd,
    branch: row.branch,
    state: row.state,
    client: row.client,
    summary: row.summary,
    lastReply: row.lastReply,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    at: row.at,
    messageCount: row.messageCount,
    matchedTitle: row.matchedTitle,
    resumeCommand: row.resumeCommand,
    openPath: row.openPath,
    hits: row.hits.map((hit) => ({
      role: hit.role,
      at: hit.at,
      // Plain text for callers that cannot mark anything up (the menu bar).
      text: hit.snippet.map((part) => part.text).join(""),
      parts: hit.snippet,
    })),
  }
}

export async function GET(request: Request) {
  if (!(await authenticateLeftOff(request))) return unauthorized()

  const url = new URL(request.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  if (!q) {
    return NextResponse.json(
      { generatedAt: new Date().toISOString(), q: "", sessions: [] },
      { headers: { "cache-control": "no-store" } }
    )
  }

  const limitParam = Number(url.searchParams.get("limit") ?? "")
  const sessions = await searchSessions(q, {
    clientSlug: url.searchParams.get("client")?.trim() || null,
    surface: url.searchParams.get("surface")?.trim() || null,
    from: instant(url.searchParams.get("from")),
    to: instant(url.searchParams.get("to")),
    limit: Number.isFinite(limitParam) && limitParam > 0 ? limitParam : undefined,
  })

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), q, sessions: sessions.map(payload) },
    { headers: { "cache-control": "no-store" } }
  )
}
