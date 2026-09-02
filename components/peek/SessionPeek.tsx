import Link from "next/link"
import { desc, eq } from "drizzle-orm"
import { Fact, Facts, GonePeek, PeekSection } from "@/components/peek/bits"
import { db } from "@/db"
import { agentSessions, punchlistTestRuns, punchlists } from "@/db/schema"
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
  if (!session) return <GonePeek />

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

  return (
    <>
      <div className="px-6 pt-5">
        <p className="text-base font-semibold text-tk-onyx">{session.name || "Untitled conversation"}</p>
        <p className="mt-1 text-sm text-tk-slate/70">
          {session.surface}
          {" · "}
          <span className="font-mono text-[12px]">{session.sessionRef.slice(0, 8)}</span>
          {session.client ? (
            <>
              {" · "}
              <Link href={ROUTES.client(session.client.slug)} className="font-semibold text-tk-teal hover:underline">
                {session.client.name}
              </Link>
            </>
          ) : null}
          {session.project ? (
            <>
              {" · "}
              <Link href={ROUTES.project(session.project.slug)} className="font-semibold text-tk-teal hover:underline">
                {session.project.name}
              </Link>
            </>
          ) : null}
        </p>
        {session.summary ? (
          <p className="mt-3 text-[13.5px] leading-relaxed text-tk-onyx">{session.summary}</p>
        ) : (
          <p className="mt-3 text-[13px] italic text-tk-slate/60">
            No summary yet — the Mac writes one when the session ends, or on the next
            <code className="mx-1 rounded bg-tk-linen px-1 not-italic">log-session propose</code>.
          </p>
        )}
      </div>

      <PeekSection title="Span">
        <Facts>
          <Fact label="Started">{stamp(session.startedAt)}</Fact>
          <Fact label="Ended">{stamp(session.endedAt)}</Fact>
          <Fact label="Metered">{hours(session.meterHours)} h</Fact>
          <Fact label="Tokens">
            {session.tokensIn || session.tokensOut
              ? `${session.tokensIn.toLocaleString()} in · ${session.tokensOut.toLocaleString()} out`
              : "—"}
          </Fact>
          {session.cwd ? (
            <Fact label="Folder" wide>
              <span className="break-all font-mono text-[12px]">{session.cwd}</span>
            </Fact>
          ) : null}
        </Facts>
      </PeekSection>

      {session.highlights.length > 0 ? (
        <PeekSection title="Highlights">
          <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-tk-slate">
            {session.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </PeekSection>
      ) : null}

      {session.filesTouched.length > 0 || session.repos.length > 0 ? (
        <PeekSection title="Touched">
          {session.repos.length > 0 ? (
            <p className="text-[12.5px] text-tk-slate">{session.repos.join(" · ")}</p>
          ) : null}
          {session.filesTouched.length > 0 ? (
            <ul className="mt-1 max-h-48 overflow-auto font-mono text-[11.5px] leading-relaxed text-tk-slate/80">
              {session.filesTouched.map((f, i) => (
                <li key={i} className="break-all">{f}</li>
              ))}
            </ul>
          ) : null}
        </PeekSection>
      ) : null}

      <PeekSection title="Billed as">
        {session.entries.length === 0 ? (
          <p className="text-[12.5px] text-tk-slate/60">Not on the timesheet yet.</p>
        ) : (
          <ul className="space-y-1.5 text-[12.5px] text-tk-slate">
            {session.entries.map((link) => (
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
