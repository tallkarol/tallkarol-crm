import { desc, sql } from "drizzle-orm"
import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { db } from "@/db"
import { appEvents } from "@/db/schema"
import { clientColor, markColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { formatStamp } from "@/lib/support"

export const metadata = { title: "Activity" }
export const dynamic = "force-dynamic"

const LIMIT = 200

/** Grouped by day, because that's how you look for "what happened on Tuesday". */
function dayKey(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: { kind?: string; client?: string }
}) {
  const kindFilter = searchParams.kind ?? ""
  const clientFilter = searchParams.client ?? ""

  const events = await db.query.appEvents.findMany({
    with: {
      client: { columns: { slug: true, name: true } },
      source: { columns: { slug: true, name: true } },
    },
    orderBy: [desc(appEvents.occurredAt)],
    limit: LIMIT,
  })

  const kinds = await db
    .select({ kind: appEvents.kind, count: sql<number>`count(*)::int` })
    .from(appEvents)
    .groupBy(appEvents.kind)
    .orderBy(desc(sql`count(*)`))

  const visible = events.filter((e) => {
    if (kindFilter && !e.kind.startsWith(kindFilter)) return false
    if (clientFilter && e.client?.slug !== clientFilter) return false
    return true
  })

  const groups: { day: string; rows: typeof visible }[] = []
  for (const event of visible) {
    const day = dayKey(event.occurredAt)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.rows.push(event)
    else groups.push({ day, rows: [event] })
  }

  return (
    <>
      <PageHeader title="Activity" />

      {events.length === 0 ? (
        <div className="mt-8 max-w-2xl rounded-2xl border border-dashed border-line bg-well p-6 text-sm text-tk-slate">
          <p className="font-semibold text-tk-onyx">Nothing reported yet</p>
          <p className="mt-1.5 text-ink-3">
            Wired apps post the events worth keeping — sign-ins, access requests, deliveries, run
            outcomes — to{" "}
            <code className="rounded bg-well px-1 py-0.5 text-xs">/api/events/log</code>. Debug
            output stays in the host&apos;s logs; this is the record you&apos;d want six months from
            now.
          </p>
          <p className="mt-3 text-ink-3">
            Job health lives in{" "}
            <Link href={ROUTES.uptime} className="font-semibold text-tk-teal hover:underline">
              Uptime
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <FilterChip href={ROUTES.logs} active={!kindFilter}>
              All
            </FilterChip>
            {kinds.slice(0, 8).map((k) => (
              <FilterChip
                key={k.kind}
                href={`${ROUTES.logs}?kind=${encodeURIComponent(k.kind)}`}
                active={kindFilter === k.kind}
              >
                {k.kind} <span className="font-mono text-[10px] opacity-70">{k.count}</span>
              </FilterChip>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
            {groups.map((group) => (
              <div key={group.day}>
                <div className="sticky top-0 z-[1] border-b border-line bg-well px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 backdrop-blur">
                  {group.day}
                  <span className="float-right tabular-nums text-ink-3">
                    {group.rows.length}
                  </span>
                </div>
                {group.rows.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-baseline gap-3 border-b border-line px-4 py-2 last:border-0"
                  >
                    <span className="w-14 shrink-0 font-mono text-[10.5px] tabular-nums text-ink-3">
                      {event.occurredAt.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 font-mono text-[10px]",
                        event.severity === "error"
                          ? "bg-bad-soft text-bad"
                          : event.severity === "warn"
                            ? "bg-warn-soft text-warn"
                            : "bg-well text-ink-3"
                      )}
                    >
                      {event.kind}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-tk-slate">
                      {event.summary || event.actor || "—"}
                      {event.count > 1 ? (
                        <span className="ml-1.5 font-mono text-[10.5px] text-ink-3">
                          ×{event.count}
                        </span>
                      ) : null}
                    </span>
                    {event.actor && event.summary ? (
                      <span className="hidden shrink-0 font-mono text-[10.5px] text-ink-3 sm:inline">
                        {event.actor}
                      </span>
                    ) : null}
                    {event.client ? (
                      <span className="flex shrink-0 items-center gap-1.5 text-[11.5px] font-semibold text-ink-3">
                        <span
                          className="size-[7px] rounded-full"
                          style={{ background: markColor(clientColor(event.client.slug)) }}
                          aria-hidden
                        />
                        {event.client.name}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-3">
            Newest {visible.length} of the last {LIMIT} events · last one{" "}
            {formatStamp(events[0].occurredAt)}
          </p>
        </>
      )}
    </>
  )
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "border-tk-teal bg-accent text-tk-linen"
          : "border-line bg-card text-ink-3 hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
      )}
    >
      {children}
    </Link>
  )
}
