import Link from "next/link"
import { desc, eq } from "drizzle-orm"
import { Fact, Facts, GonePeek, PeekSection } from "@/components/peek/bits"
import { db } from "@/db"
import { agentSessions, punchlistTestRuns, punchlists, sessionNotes } from "@/db/schema"
import { STATE_LABEL, deriveState, resumeCommand, type NoteFacts } from "@/lib/leftoff"
import { messagesForSession, type SessionMessageView } from "@/lib/leftoff-history"
import { ROUTES } from "@/lib/nav"
import { RUN_STATUS_LABEL, type RunStatus } from "@/lib/punchlist"
import { formatDay } from "@/lib/work"

function stamp(d: Date | null) {
  return d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"
}

function hours(n: string | number) {
  const v = Number(n)
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "")
}

/** One stored message: who said it, when, and what — clipped for a card. */
function Message({ message }: { message: SessionMessageView }) {
  const text = message.text.length > 600 ? `${message.text.slice(0, 599)}…` : message.text
  return (
    <li className="text-[12.5px] leading-relaxed">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-tk-slate/45">
        {message.role === "user" ? "You" : "It"}
        {message.at
          ? ` · ${new Date(message.at).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`
          : ""}
        {message.origin === "backfill" ? " · from the transcript" : ""}
      </p>
      <p className="mt-0.5 whitespace-pre-wrap text-tk-slate">{text}</p>
    </li>
  )
}

/**
 * One agent conversation: what it did, in the summary the Mac wrote after it
 * ended, and every place it left a mark — the hours it was billed under,
 * the punch lists it generated, the tests it ran.
 */
export async function SessionPeek({ sessionRef }: { sessionRef: string }) {
  const session = await db.query.agentSessions.findFirst({
    where: eq(agentSessions.sessionRef, sessionRef),
    with: {
      client: { columns: { name: true, slug: true } },
      project: { columns: { name: true, slug: true } },
      entries: {
        with: {
          entry: {
            columns: { id: true, occurredOn: true, hours: true, summary: true, clientId: true },
            with: { client: { columns: { slug: true } } },
          },
        },
      },
    },
  })
  const [note, conversation] = await Promise.all([
    db.query.sessionNotes.findFirst({ where: eq(sessionNotes.sessionRef, sessionRef) }),
    messagesForSession(sessionRef, { head: 2, tail: 4 }),
  ])
  // History reaches further back than either table alone: a chat can have a
  // note and no session row, or messages and neither.
  if (!session && !note && conversation.total === 0) return <GonePeek />

  const [lists, runs] = await Promise.all([
    db.query.punchlists.findMany({
      where: eq(punchlists.sessionRef, sessionRef),
      columns: { id: true, title: true, slug: true },
    }),
    db.query.punchlistTestRuns.findMany({
      where: eq(punchlistTestRuns.sessionRef, sessionRef),
      orderBy: [desc(punchlistTestRuns.requestedAt)],
      with: {
        item: {
          columns: { title: true },
          with: { punchlist: { columns: { slug: true, title: true } } },
        },
      },
    }),
  ])

  // One view over three sources: the summarised record, the note the board
  // kept, and the messages themselves. Any one of them can be missing.
  const info = {
    name: session?.name || note?.title || "Untitled conversation",
    surface: session?.surface || note?.surface || "claude",
    client: session?.client ?? null,
    project: session?.project ?? null,
    summary: session?.summary ?? "",
    startedAt: session?.startedAt ?? note?.startedAt ?? null,
    endedAt: session?.endedAt ?? note?.endedAt ?? null,
    meterHours: session?.meterHours ?? "0",
    tokensIn: session?.tokensIn ?? 0,
    tokensOut: session?.tokensOut ?? 0,
    cwd: session?.cwd || note?.cwd || "",
    highlights: session?.highlights ?? [],
    filesTouched: session?.filesTouched ?? [],
    repos: session?.repos ?? [],
    entries: session?.entries ?? [],
  }
  const resume = resumeCommand({ sessionRef, surface: info.surface, cwd: info.cwd })

  return (
    <>
      <div className="px-6 pt-5">
        <p className="text-base font-semibold text-tk-onyx">{info.name || "Untitled conversation"}</p>
        <p className="mt-1 text-sm text-tk-slate/70">
          {info.surface}
          {" · "}
          <span className="font-mono text-[12px]">{sessionRef.slice(0, 8)}</span>
          {info.client ? (
            <>
              {" · "}
              <Link href={ROUTES.client(info.client.slug)} className="font-semibold text-tk-teal hover:underline">
                {info.client.name}
              </Link>
            </>
          ) : null}
          {info.project ? (
            <>
              {" · "}
              <Link href={ROUTES.project(info.project.slug)} className="font-semibold text-tk-teal hover:underline">
                {info.project.name}
              </Link>
            </>
          ) : null}
        </p>
        {info.summary ? (
          <p className="mt-3 text-[13.5px] leading-relaxed text-tk-onyx">{info.summary}</p>
        ) : (
          <p className="mt-3 text-[13px] italic text-tk-slate/60">
            No summary yet — the Mac writes one when the session ends, or on the next
            <code className="mx-1 rounded bg-tk-linen px-1 not-italic">log-session propose</code>.
          </p>
        )}
      </div>

      <PeekSection title="Span">
        <Facts>
          <Fact label="Started">{stamp(info.startedAt)}</Fact>
          <Fact label="Ended">{stamp(info.endedAt)}</Fact>
          <Fact label="Metered">{hours(info.meterHours)} h</Fact>
          <Fact label="Tokens">
            {info.tokensIn || info.tokensOut
              ? `${info.tokensIn.toLocaleString()} in · ${info.tokensOut.toLocaleString()} out`
              : "—"}
          </Fact>
          {info.cwd ? (
            <Fact label="Folder" wide>
              <span className="break-all font-mono text-[12px]">{info.cwd}</span>
            </Fact>
          ) : null}
        </Facts>
      </PeekSection>

      {note ? (
        <PeekSection title="Where it left off">
          <p className="text-[12.5px] text-tk-slate">
            <span className="font-semibold text-tk-onyx">
              {STATE_LABEL[deriveState(note as unknown as NoteFacts, new Date())]}
            </span>
            {note.blockedOn ? ` — wanted ${note.blockedOn}` : ""}
          </p>
          {note.body ? (
            <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] text-tk-onyx">{note.body}</p>
          ) : null}
          {note.lastPrompt ? (
            <p className="mt-1.5 text-[12.5px] text-tk-slate">
              <span className="font-semibold">You:</span> {note.lastPrompt}
            </p>
          ) : null}
          {note.lastReply ? (
            <p className="mt-1 text-[12.5px] text-tk-slate">
              <span className="font-semibold">It:</span> {note.lastReply}
            </p>
          ) : null}
          {resume ? (
            <p className="mt-2 break-all rounded bg-tk-linen px-2 py-1.5 font-mono text-[11px] text-tk-slate">
              {resume}
            </p>
          ) : null}
          {note.taskId || note.ticketId ? (
            <p className="mt-1.5 text-[12.5px]">
              <Link
                href={note.taskId ? `${ROUTES.tasks}?peek=task:${note.taskId}` : ROUTES.support}
                className="font-semibold text-tk-teal hover:underline"
              >
                {note.taskId ? "Became a task" : "Became a ticket"}
              </Link>
            </p>
          ) : null}
        </PeekSection>
      ) : null}

      {conversation.total > 0 ? (
        <PeekSection title={`Conversation · ${conversation.total} message${conversation.total === 1 ? "" : "s"}`}>
          <ul className="space-y-2">
            {conversation.head.map((m) => (
              <Message key={`h-${m.role}-${m.at}`} message={m} />
            ))}
            {conversation.tail.length &&
            conversation.total > conversation.head.length + conversation.tail.length ? (
              <li className="text-[11.5px] italic text-tk-slate/50">
                {conversation.total - conversation.head.length - conversation.tail.length} more in
                between — search finds them.
              </li>
            ) : null}
            {conversation.tail.map((m) => (
              <Message key={`t-${m.role}-${m.at}`} message={m} />
            ))}
          </ul>
        </PeekSection>
      ) : null}

      {info.highlights.length > 0 ? (
        <PeekSection title="Highlights">
          <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-tk-slate">
            {info.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </PeekSection>
      ) : null}

      {info.filesTouched.length > 0 || info.repos.length > 0 ? (
        <PeekSection title="Touched">
          {info.repos.length > 0 ? (
            <p className="text-[12.5px] text-tk-slate">{info.repos.join(" · ")}</p>
          ) : null}
          {info.filesTouched.length > 0 ? (
            <ul className="mt-1 max-h-48 overflow-auto font-mono text-[11.5px] leading-relaxed text-tk-slate/80">
              {info.filesTouched.map((f, i) => (
                <li key={i} className="break-all">{f}</li>
              ))}
            </ul>
          ) : null}
        </PeekSection>
      ) : null}

      <PeekSection title="Billed as">
        {info.entries.length === 0 ? (
          <p className="text-[12.5px] text-tk-slate/60">Not on the timesheet yet.</p>
        ) : (
          <ul className="space-y-1.5 text-[12.5px] text-tk-slate">
            {info.entries.map((link) => (
              <li key={link.timeEntryId} className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <Link
                    href={ROUTES.timesheetFor(link.entry.client?.slug ?? "", link.entry.occurredOn.slice(0, 7))}
                    className="font-semibold text-tk-teal hover:underline"
                  >
                    {formatDay(link.entry.occurredOn)}
                  </Link>
                  {" · "}
                  {link.entry.summary}
                </span>
                <span className="shrink-0 font-mono text-[11.5px] tabular-nums">
                  {hours(link.shareHours)} of {hours(link.entry.hours)} h
                </span>
              </li>
            ))}
          </ul>
        )}
      </PeekSection>

      {lists.length > 0 ? (
        <PeekSection title="Punch lists generated">
          <ul className="space-y-1 text-[12.5px]">
            {lists.map((l) => (
              <li key={l.id}>
                <Link href={ROUTES.punchlist(l.slug)} className="font-semibold text-tk-teal hover:underline">
                  {l.title}
                </Link>
              </li>
            ))}
          </ul>
        </PeekSection>
      ) : null}

      {runs.length > 0 ? (
        <PeekSection title="Tests run">
          <ul className="space-y-1 text-[12.5px] text-tk-slate">
            {runs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`${ROUTES.punchlist(r.item.punchlist.slug)}?peek=run:${r.id}`}
                  className="font-semibold text-tk-teal hover:underline"
                >
                  {r.item.title}
                </Link>
                {" — "}
                {RUN_STATUS_LABEL[r.status as RunStatus] ?? r.status}
              </li>
            ))}
          </ul>
        </PeekSection>
      ) : null}
    </>
  )
}
