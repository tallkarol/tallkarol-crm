import Link from "next/link"
import { redirect } from "next/navigation"
import { desc, eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { clients as clientsTable, slinkAccessRequests, slinkRecipients, slinks } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import { agoLabel, grantState } from "@/lib/slink"
import { createSlinkAction } from "./actions"

export const dynamic = "force-dynamic"
export const metadata = { title: "Slinks" }

/**
 * Every slink, newest first, with the two numbers that decide whether one
 * needs Karol: how many people can still open it, and how many are waiting to
 * be let in.
 */
export default async function SlinksPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const [rows, clients] = await Promise.all([
    db.query.slinks.findMany({
      orderBy: [desc(slinks.updatedAt)],
      with: { client: { columns: { name: true } } },
    }),
    db.query.clients.findMany({
      columns: { id: true, name: true },
      orderBy: [clientsTable.name],
    }),
  ])

  const now = new Date()
  const people = await db
    .select({
      slinkId: slinkRecipients.slinkId,
      expiresAt: slinkRecipients.expiresAt,
      revokedAt: slinkRecipients.revokedAt,
    })
    .from(slinkRecipients)
  const pending = await db
    .select({ slinkId: slinkAccessRequests.slinkId, n: sql<number>`count(*)::int` })
    .from(slinkAccessRequests)
    .where(eq(slinkAccessRequests.status, "pending"))
    .groupBy(slinkAccessRequests.slinkId)

  const pendingBy = new Map(pending.map((p) => [p.slinkId, p.n]))
  const liveBy = new Map<string, number>()
  for (const p of people) {
    const state = grantState(p, now)
    if (state === "active" || state === "indefinite") {
      liveBy.set(p.slinkId, (liveBy.get(p.slinkId) ?? 0) + 1)
    }
  }

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="font-['Inter_Tight',sans-serif] text-[22px] font-bold tracking-tight text-tk-onyx">Slinks</h1>
        <p className="text-[13px] text-ink-3">
          A page you share with named people. Access is a link per email address, so there is no password to pass along
          and every open has a name on it.
        </p>
      </header>

      <section className="rounded-xl border border-line bg-tk-white p-4">
        <h2 className="font-['Inter_Tight',sans-serif] text-[13px] font-semibold text-tk-onyx">New slink</h2>
        <form action={createSlinkAction} className="mt-3 grid gap-3 sm:grid-cols-[2fr_1fr_auto]">
          <input
            name="title"
            required
            placeholder="DNS cutover — dqsgroup.com"
            className="rounded-lg border border-line bg-well px-3 py-2 text-[13px] text-tk-onyx placeholder:text-ink-3"
          />
          <select
            name="clientId"
            defaultValue=""
            className="rounded-lg border border-line bg-well px-3 py-2 text-[13px] text-tk-onyx"
          >
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-accent px-4 py-2 font-['Inter_Tight',sans-serif] text-[13px] font-semibold text-white"
          >
            Create
          </button>
        </form>
      </section>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-[13px] text-ink-3">
          Nothing shared yet.
        </p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((s) => {
            const waiting = pendingBy.get(s.id) ?? 0
            return (
              <li key={s.id}>
                <Link
                  href={`${ROUTES.slinks}/${s.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-tk-white px-4 py-3 hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-['Inter_Tight',sans-serif] text-[14px] font-semibold text-tk-onyx">
                      {s.title}
                    </span>
                    <span className="mt-0.5 block text-[11.5px] text-ink-3">
                      {s.client?.name ?? "No client"} · updated {agoLabel(s.updatedAt, now)}
                    </span>
                  </span>
                  {waiting > 0 ? (
                    <span className="rounded-full bg-tk-tomato/10 px-2.5 py-0.5 font-['Inter_Tight',sans-serif] text-[11px] font-semibold text-tk-tomato">
                      {waiting} waiting on you
                    </span>
                  ) : null}
                  <span className="rounded-full bg-tk-slate/8 px-2.5 py-0.5 font-['Inter_Tight',sans-serif] text-[11px] font-semibold text-ink-3">
                    {liveBy.get(s.id) ?? 0} with access
                  </span>
                  {s.status === "archived" ? (
                    <span className="rounded-full bg-tk-slate/8 px-2.5 py-0.5 font-['Inter_Tight',sans-serif] text-[11px] font-semibold text-ink-3">
                      Archived
                    </span>
                  ) : null}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
