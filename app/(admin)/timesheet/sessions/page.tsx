import Link from "next/link"
import { asc } from "drizzle-orm"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { SessionFilters } from "@/components/timesheet/SessionFilters"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { cn } from "@/lib/cn"
import { STATE_LABEL, agoLabel, type NoteState } from "@/lib/leftoff"
import {
  HISTORY_DEFAULT_DAYS,
  groupByDay,
  listSessionHistory,
  searchSessions,
  type SessionHistoryRow,
  type SessionSearchResult,
  type SnippetPart,
} from "@/lib/leftoff-history"
import { ROUTES } from "@/lib/nav"
import { workspaceTimezone } from "@/lib/timezone"
import { Card } from "@/components/ui/Card"

export const metadata = { title: "Sessions" }
export const dynamic = "force-dynamic"

/**
 * Every conversation, kept. The board upstairs is the present tense — this is
 * the same rows read backwards, plus the prompts and replies themselves, so
 * "what was I doing on Tuesday" and "where did I say that" are answerable
 * without opening a chat history in another app.
 */

const CHIP: Record<NoteState, string> = {
  blocked: "text-bad bg-bad-soft ring-transparent",
  parked: "text-warn bg-warn-soft ring-transparent",
  waiting: "text-tk-teal bg-tk-teal/[0.06] ring-tk-teal/25",
  working: "text-tk-slate bg-well ring-line",
  gone: "text-ink-3 bg-transparent ring-line",
}

const SURFACE_LABEL: Record<string, string> = {
  claude: "Claude",
  cursor: "Cursor",
  agent: "Agent",
}

const SINCE_MS: Record<string, number | null> = {
  "7d": 7 * 86_400_000,
  "14d": 14 * 86_400_000,
  "30d": 30 * 86_400_000,
  "90d": 90 * 86_400_000,
  all: null,
}

function span(row: SessionHistoryRow) {
  const start = row.startedAt ? new Date(row.startedAt) : null
  const end = row.endedAt ? new Date(row.endedAt) : null
  if (!start) return ""
  const time = start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  if (!end || end.getTime() - start.getTime() < 60_000) return time
  const mins = Math.round((end.getTime() - start.getTime()) / 60_000)
  const length = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
  return `${time} · ${length}`
}

/** `ts_headline` runs, rendered as text — the marked runs are the query's words. */
function Snippet({ parts }: { parts: SnippetPart[] }) {
  return (
    <>
      {parts.map((part, i) =>
        part.hit ? (
          <mark key={i} className="rounded bg-tk-teal/15 px-0.5 text-tk-onyx">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </>
  )
}

function Meta({ row }: { row: SessionHistoryRow }) {
  const where = [row.project, row.branch && row.branch !== "main" ? row.branch : ""]
    .filter(Boolean)
    .join(" · ")
  return (
    <span className="text-xs font-normal text-ink-3">
      {SURFACE_LABEL[row.surface] ?? row.surface}
      {where ? ` · ${where}` : ""}
      {row.messageCount ? ` · ${row.messageCount} message${row.messageCount === 1 ? "" : "s"}` : ""}
    </span>
  )
}

function Row({
  row,
  href,
  children,
}: {
  row: SessionHistoryRow
  href: string
  children?: React.ReactNode
}) {
  return (
    <li className="px-5 py-3 hover:bg-well">
      <Link href={href} scroll={false} className="block">
        <p className="flex items-start gap-2 text-sm font-semibold text-tk-onyx">
          <span
            className={cn(
              "mt-0.5 inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold ring-1 ring-inset",
              CHIP[row.state]
            )}
          >
            {STATE_LABEL[row.state]}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {row.title || "Untitled conversation"} <Meta row={row} />
          </span>
          {row.client ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-normal text-ink-3">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ background: row.client.color }}
              />
              {row.client.name}
            </span>
          ) : null}
        </p>
        {children}
      </Link>
    </li>
  )
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: {
    q?: string
    client?: string
    surface?: string
    since?: string
    peek?: string
  }
}) {
  const now = new Date()
  const q = (searchParams.q ?? "").trim()
  const since = isSince(searchParams.since) ? searchParams.since : "7d"
  const windowMs = SINCE_MS[since] ?? null
  const filters = {
    from: windowMs ? new Date(now.getTime() - windowMs) : null,
    clientSlug: searchParams.client?.trim() || null,
    surface: searchParams.surface?.trim() || null,
  }

  const [clientRows, tz] = await Promise.all([
    db.query.clients.findMany({ orderBy: [asc(clients.name)] }),
    workspaceTimezone(),
  ])

  // Search reaches all the way back whatever the window says — the point of
  // searching is finding the thing you cannot date.
  const results: SessionSearchResult[] = q
    ? await searchSessions(q, { ...filters, from: null }, now)
    : []
  const rows = q ? [] : await listSessionHistory(filters, now)
  const days = q ? [] : groupByDay(rows, tz, now)

  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (key !== "peek" && value) query.set(key, value)
  }
  const closeHref = query.toString()
    ? `${ROUTES.timesheetSessions}?${query.toString()}`
    : ROUTES.timesheetSessions
  const peekHref = (ref: string) =>
    `${closeHref}${closeHref.includes("?") ? "&" : "?"}peek=session:${encodeURIComponent(ref)}`

  const summary = q
    ? `${results.length} ${results.length === 1 ? "conversation" : "conversations"}`
    : `${rows.length} ${rows.length === 1 ? "conversation" : "conversations"} · ${days.length} ${days.length === 1 ? "day" : "days"}`

  return (
    <>
      {searchParams.peek ? <PeekRouter peek={searchParams.peek} closeHref={closeHref} /> : null}
      <SessionFilters
        clients={clientRows.map((row) => ({ slug: row.slug, name: row.name }))}
        q={q}
        clientSlug={searchParams.client ?? ""}
        surface={searchParams.surface ?? ""}
        since={since}
        summary={summary}
      />

      {q && results.length === 0 ? (
        <Empty
          title="Nothing said that"
          line="Search covers every prompt and reply the board has stored, and every title. Try one distinctive word."
        />
      ) : null}

      {!q && rows.length === 0 ? (
        <Empty
          title="No conversations in this window"
          line={`Nothing in the last ${HISTORY_DEFAULT_DAYS} days matches. Widen the range, or clear the client filter.`}
        />
      ) : null}

      {q ? (
        <Card className="mt-5 overflow-hidden">
          <ul className="divide-y divide-line">
            {results.map((row) => (
              <Row key={row.sessionRef} row={row} href={peekHref(row.sessionRef)}>
                {row.hits.length ? (
                  <ul className="mt-1.5 space-y-1">
                    {row.hits.map((hit, i) => (
                      <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-tk-slate">
                        <span className="mt-px shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                          {hit.role === "user" ? "you" : "it"}
                        </span>
                        <span className="min-w-0">
                          <Snippet parts={hit.snippet} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 line-clamp-2 text-sm text-ink-3">
                    {row.summary || row.lastReply}
                  </p>
                )}
                <p className="mt-1 text-xs text-ink-3">
                  {new Date(row.at).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  {row.matchedTitle ? " · matched the title" : ""}
                </p>
              </Row>
            ))}
          </ul>
        </Card>
      ) : days.length ? (
        <Card className="mt-5 overflow-hidden">
          {days.map((day) => (
            <div key={day.day}>
              <p className="flex items-baseline gap-2 border-y border-line bg-well px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3 first:border-t-0">
                {day.label}
                <span className="font-normal normal-case tracking-normal text-ink-3">
                  {day.sessions.length} {day.sessions.length === 1 ? "conversation" : "conversations"}
                </span>
              </p>
              <ul className="divide-y divide-line">
                {day.sessions.map((row) => (
                  <Row key={row.sessionRef} row={row} href={peekHref(row.sessionRef)}>
                    <p className="mt-0.5 line-clamp-2 text-sm text-tk-slate">
                      {row.summary || row.body || row.lastReply || row.lastPrompt}
                    </p>
                    <p className="mt-1 text-xs text-ink-3">
                      {[span(row), row.state === "gone" ? "" : agoLabel(new Date(row.at), now)]
                        .filter(Boolean)
                        .join(" · ")}
                      {row.presumed ? " · no goodbye" : ""}
                    </p>
                  </Row>
                ))}
              </ul>
            </div>
          ))}
        </Card>
      ) : null}
    </>
  )
}

function Empty({ title, line }: { title: string; line: string }) {
  return (
    <Card surface="well" className="mt-6 border-dashed px-6 py-10 text-center">
      <p className="text-sm font-semibold text-tk-onyx">{title}</p>
      <p className="mt-1 text-sm text-ink-3">{line}</p>
    </Card>
  )
}

function isSince(value: string | undefined): value is string {
  return Boolean(value && Object.prototype.hasOwnProperty.call(SINCE_MS, value))
}
