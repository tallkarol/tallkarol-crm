import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { db } from "@/db"
import type { Deliverable } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { daysSince, fmtHours } from "@/lib/engagements"
import { ROUTES } from "@/lib/nav"
import { formatMoney } from "@/lib/work"
import { draftDeliverableInvoice } from "./actions"

export const metadata = { title: "Projects" }
export const dynamic = "force-dynamic"

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: { peek?: string }
}) {
  const [projects, invoices, entries, openTasks, workstreams] = await Promise.all([
    db.query.projects.findMany({
      with: { client: true, deliverables: true },
      orderBy: (p, { asc }) => [asc(p.createdAt)],
    }),
    db.query.invoices.findMany(),
    db.query.timeEntries.findMany(),
    db.query.tasks.findMany().then((rows) => rows.filter((t) => t.status === "open")),
    db.query.workstreams.findMany(),
  ])

  const now = new Date()
  const activeProjects = projects.filter((p) => p.status !== "complete")
  const inDelivery = projects.filter((p) => p.status === "in_progress")
  const blocked = projects.filter((p) => p.status === "waiting_on_content")

  const unbilledDeliverables = activeProjects.flatMap((p) =>
    p.deliverables.filter((d) => (d.status === "pending" || d.status === "done") && d.feeCents)
  )
  const unbilledCents = unbilledDeliverables.reduce((s, d) => s + (d.feeCents ?? 0), 0)
  const invoiceableCents = unbilledDeliverables
    .filter((d) => d.status === "done")
    .reduce((s, d) => s + (d.feeCents ?? 0), 0)
  const tbdCount = activeProjects.flatMap((p) =>
    p.deliverables.filter((d) => d.status === "pending" && !d.feeCents)
  ).length

  const yearStart = `${now.getFullYear()}-01-01`
  const collectedYtd = invoices
    .filter((i) => i.projectId && i.status === "paid" && i.issuedOn >= yearStart)
    .reduce((s, i) => s + i.amountCents, 0)

  const hoursByProject = new Map<string, number>()
  for (const e of entries) {
    if (e.projectId) hoursByProject.set(e.projectId, (hoursByProject.get(e.projectId) ?? 0) + Number(e.hours))
  }
  const billedByProject = new Map<string, number>()
  for (const i of invoices) {
    if (i.projectId && i.status === "paid")
      billedByProject.set(i.projectId, (billedByProject.get(i.projectId) ?? 0) + i.amountCents)
  }

  return (
    <>
      <PageHeader title="Projects" />
      {searchParams.peek ? <PeekRouter peek={searchParams.peek} closeHref={ROUTES.projects} /> : null}

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="In delivery" value={String(inDelivery.length)} sub={inDelivery.map((p) => p.name).join(" · ") || "none"} />
        <Kpi
          label="Known unbilled"
          value={formatMoney(unbilledCents)}
          sub={`${formatMoney(invoiceableCents)} invoiceable today${tbdCount ? ` · +${tbdCount} TBD` : ""}`}
          tone={invoiceableCents > 0 ? "good" : undefined}
        />
        <Kpi
          label="Blocked"
          value={String(blocked.length)}
          sub={blocked.map((p) => `${p.name} — waiting on content`).join(" · ") || "nothing blocked"}
          tone={blocked.length ? "bad" : undefined}
        />
        <Kpi label={`Collected ${now.getFullYear()}`} value={formatMoney(collectedYtd)} sub="paid project invoices this year" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {activeProjects.map((project) => {
          const color = clientColor(project.client.slug)
          const deliverables = [...project.deliverables].sort((a, b) => a.sort - b.sort)
          const totalKnown = deliverables.reduce((s, d) => s + (d.feeCents ?? 0), 0)
          const paid = deliverables.filter((d) => d.status === "paid").reduce((s, d) => s + (d.feeCents ?? 0), 0)
          const doneUnbilled = deliverables
            .filter((d) => d.status === "done" || d.status === "invoiced")
            .reduce((s, d) => s + (d.feeCents ?? 0), 0)
          const hasTbd = deliverables.some((d) => !d.feeCents)

          const streams = workstreams.filter((w) => w.projectId === project.id)
          const tasks = openTasks.filter((t) => t.projectId === project.id)
          const nextTask = tasks[0]

          const hours = hoursByProject.get(project.id) ?? 0
          const billed = billedByProject.get(project.id) ?? 0
          const effRate = hours > 0 && billed > 0 ? Math.round(billed / hours) : null

          const lastMoved = Math.max(
            project.updatedAt.getTime(),
            ...streams.map((w) => w.updatedAt.getTime()),
            ...tasks.map((t) => t.updatedAt.getTime())
          )
          const stale = daysSince(new Date(lastMoved), now)

          const invoiceable = deliverables.find((d) => d.status === "done" && d.feeCents)

          return (
            <article
              key={project.id}
              className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5 pb-4 shadow-card"
              style={{ borderLeftWidth: 3, borderLeftColor: color }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: color }} />
                <Link href={ROUTES.project(project.slug)} className="font-['Inter_Tight',sans-serif] text-base font-bold text-tk-onyx hover:text-tk-teal">
                  {project.name}
                </Link>
                {project.status === "in_progress" ? (
                  <span className="rounded-full bg-tk-teal/10 px-2 py-0.5 text-[11px] font-semibold text-tk-teal">in progress</span>
                ) : (
                  <span className="rounded-full bg-amber-700/10 px-2 py-0.5 text-[11px] font-semibold text-amber-800">waiting on content</span>
                )}
                {stale > 14 ? (
                  <span className="rounded-full bg-red-700/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-red-700">
                    no movement · {stale}d
                  </span>
                ) : null}
                <span className="ml-auto text-xs text-ink-3">{project.client.name}</span>
              </div>

              <div>
                <div className="flex h-2 overflow-hidden rounded-full bg-well" role="img" aria-label="Fee progress">
                  {totalKnown > 0 ? (
                    <>
                      <span className="block h-full" style={{ width: `${(paid / totalKnown) * 100}%`, background: "#006965" }} />
                      <span className="block h-full" style={{ width: `${(doneUnbilled / totalKnown) * 100}%`, background: "rgba(0,105,101,.35)" }} />
                    </>
                  ) : null}
                </div>
                <p className="mt-1.5 text-[11px] tabular-nums text-ink-3">
                  {totalKnown > 0 ? (
                    <>
                      {formatMoney(paid)} paid
                      {doneUnbilled ? ` · ${formatMoney(doneUnbilled)} done, unbilled` : ""}
                      {` · ${formatMoney(totalKnown)} total${hasTbd ? " + TBD" : ""}`}
                    </>
                  ) : (
                    "fee agreed · nothing billed yet"
                  )}
                </p>
              </div>

              {deliverables.length ? (
                <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
                  {deliverables.map((d, i) => (
                    <span key={d.id} className="flex items-center">
                      {i > 0 ? <span className="mx-2 h-0.5 w-5 bg-well" aria-hidden /> : null}
                      <Milestone d={d} baseHref={ROUTES.projects} />
                    </span>
                  ))}
                </div>
              ) : null}

              {streams.length || effRate || hours > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {streams.map((w) => (
                    <span key={w.id} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-well px-2.5 py-0.5 text-[11px] font-semibold text-tk-slate tabular-nums">
                      <span className="size-1.5 rounded-full" style={{ background: color }} />
                      {w.title} · {w.stage}
                      <span className="text-[10px] font-bold text-tk-teal">{w.pass === 1 ? "1st" : w.pass === 2 ? "2nd" : `${w.pass}th`}</span>
                    </span>
                  ))}
                  {effRate ? (
                    <span className="inline-flex items-center rounded-full border border-line bg-well px-2.5 py-0.5 text-[11px] font-bold tabular-nums text-emerald-800">
                      eff. {formatMoney(effRate)}/hr · {fmtHours(hours)} hr vs {formatMoney(billed)} billed
                    </span>
                  ) : project.status === "in_progress" ? (
                    <span className="inline-flex items-center rounded-full border border-line bg-well px-2.5 py-0.5 text-[11px] font-semibold text-ink-3">
                      eff. rate — log hours to unlock
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3 text-[12.5px] text-tk-slate">
                <span className="text-[10.5px] font-bold uppercase tracking-widest text-ink-3">Next</span>
                {nextTask ? (
                  <Link
                    href={`${ROUTES.projects}?peek=task:${nextTask.id}`}
                    scroll={false}
                    className="truncate hover:text-tk-teal hover:underline"
                  >
                    {nextTask.title}
                    {nextTask.notes ? ` — ${nextTask.notes}` : ""}
                  </Link>
                ) : (
                  <span className="text-ink-3">no open tasks</span>
                )}
                {invoiceable ? (
                  <form action={draftDeliverableInvoice.bind(null, invoiceable.id)} className="ml-auto">
                    <button className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-tk-linen hover:bg-tk-teal/90">
                      Invoice {formatMoney(invoiceable.feeCents ?? 0)}
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      <ul className="mt-4 overflow-hidden rounded-2xl border border-line bg-well">
        {projects
          .filter((p) => p.status === "complete")
          .map((p) => {
            const total = p.deliverables.reduce((s, d) => s + (d.feeCents ?? 0), 0)
            return (
              <li key={p.id} className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-3 text-sm last:border-0">
                <span className="size-2 rounded-full" style={{ background: clientColor(p.client.slug) }} />
                <Link href={ROUTES.project(p.slug)} className="font-semibold text-tk-onyx hover:text-tk-teal">
                  {p.name}
                </Link>
                <span className="text-ink-3">
                  {p.client.name}
                  {total ? ` · ${formatMoney(total)} · all paid` : ""}
                </span>
                <span className="ml-auto rounded-full bg-well px-2 py-0.5 text-[11px] font-semibold text-ink-3">complete</span>
              </li>
            )
          })}
      </ul>
    </>
  )
}

function Milestone({ d, baseHref }: { d: Deliverable; baseHref: string }) {
  const done = d.status === "paid" || d.status === "invoiced"
  const ready = d.status === "done"
  return (
    <Link href={`${baseHref}?peek=deliverable:${d.id}`} scroll={false} className="flex items-center gap-1.5 hover:opacity-80">
      <span
        className={
          done
            ? "grid size-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-tk-linen"
            : ready
              ? "grid size-5 place-items-center rounded-full border-[1.5px] border-tk-teal bg-tk-teal/15 text-[11px] font-bold text-tk-teal"
              : "grid size-5 place-items-center rounded-full border-[1.5px] border-dashed border-line-strong bg-well text-[11px] font-bold text-ink-3"
        }
      >
        {done ? "✓" : ready ? "!" : d.sort || "·"}
      </span>
      <span className="text-xs">
        <span className="font-semibold text-tk-onyx">{d.label}</span>
        {d.dueOn ? (
          <span className="text-ink-3"> · {new Date(d.dueOn + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
        ) : null}
      </span>
    </Link>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-5 py-4 shadow-card">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-1.5 text-[23px] font-semibold leading-tight tracking-tight text-tk-onyx tabular-nums">{value}</p>
      <p className={`mt-0.5 truncate text-xs ${tone === "bad" ? "font-semibold text-red-700" : tone === "good" ? "font-semibold text-emerald-800" : "text-ink-3"}`}>
        {sub}
      </p>
    </div>
  )
}
