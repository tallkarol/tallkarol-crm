import Link from "next/link"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { WorkstreamLane } from "@/components/delivery/WorkstreamLane"
import { TaskComposer } from "@/components/tasks/TaskComposer"
import { TaskRows } from "@/components/tasks/TaskRows"
import { PunchlistList } from "@/components/punchlist/PunchlistList"
import { db } from "@/db"
import { clientColor } from "@/lib/client-colors"
import { daysSince, fmtHours, readLinks } from "@/lib/engagements"
import { ROUTES } from "@/lib/nav"
import { punchlistsFor } from "@/lib/punchlists"
import { tasksFor, taskTargets } from "@/lib/tasks"
import { formatDay, formatMoney, plural } from "@/lib/work"
import { addProjectLink, draftDeliverableInvoice, removeProjectLink } from "../actions"

export const dynamic = "force-dynamic"

const RATE_TARGET_CENTS = 6000

export async function generateMetadata({ params }: { params: { slug: string } }) {
  return { title: `Project · ${params.slug}` }
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { peek?: string }
}) {
  const [projects, invoices, entries] = await Promise.all([
    db.query.projects.findMany({
      with: {
        client: true,
        deliverables: true,
        contracts: true,
        workstreams: { orderBy: (w, { asc }) => [asc(w.sort), asc(w.createdAt)] },
      },
    }),
    db.query.invoices.findMany(),
    db.query.timeEntries.findMany(),
  ])
  const project = projects.find((p) => p.slug === params.slug)
  if (!project) notFound()

  const now = new Date()
  const color = clientColor(project.client.slug)
  const deliverables = [...project.deliverables].sort((a, b) => a.sort - b.sort)

  const totalKnown = deliverables.reduce((s, d) => s + (d.feeCents ?? 0), 0)
  const collected = deliverables.filter((d) => d.status === "paid").reduce((s, d) => s + (d.feeCents ?? 0), 0)
  const invoiceable = deliverables.filter((d) => d.status === "done" && d.feeCents)
  const invoiceableCents = invoiceable.reduce((s, d) => s + (d.feeCents ?? 0), 0)
  const nextDue = deliverables.find((d) => d.status === "pending" && d.dueOn)

  const [projectTasks, targets, projectPunchlists] = await Promise.all([
    tasksFor({ projectId: project.id }),
    taskTargets(),
    punchlistsFor({ projectId: project.id }),
  ])
  const tasks = projectTasks.filter((t) => t.status === "open")

  const hours = entries
    .filter((e) => e.projectId === project.id)
    .reduce((s, e) => s + Number(e.hours), 0)
  const billed = invoices
    .filter((i) => i.projectId === project.id && i.status === "paid")
    .reduce((s, i) => s + i.amountCents, 0)
  const effRate = hours > 0 && billed > 0 ? Math.round(billed / hours) : null
  const projectInvoices = invoices
    .filter((i) => i.projectId === project.id)
    .sort((a, b) => (a.issuedOn > b.issuedOn ? -1 : 1))

  const links = readLinks(project.links)
  const contract = project.contracts[0]

  return (
    <>
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref={ROUTES.project(project.slug)} />
      ) : null}
      <Link href={ROUTES.projects} className="text-sm font-semibold text-tk-teal hover:underline">
        ← Projects
      </Link>
      <div className="mt-3">
        <PageHeader title={project.name} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {projects
          .filter((p) => p.status !== "complete" || p.id === project.id)
          .map((p) => {
            const on = p.id === project.id
            return (
              <Link
                key={p.id}
                href={ROUTES.project(p.slug)}
                aria-current={on ? "page" : undefined}
                className={
                  on
                    ? "flex items-center gap-2 rounded-xl border border-tk-teal bg-tk-teal px-3.5 py-2 text-sm font-semibold text-tk-linen"
                    : "flex items-center gap-2 rounded-xl border border-tk-slate/20 bg-white px-3.5 py-2 text-sm font-semibold text-tk-onyx hover:border-tk-teal"
                }
              >
                <span className="h-2 w-2 rounded-[3px]" style={{ background: on ? "#F1EADC" : clientColor(p.client.slug) }} />
                {p.name}
              </Link>
            )
          })}
      </div>

      {project.status !== "complete" ? (
        <div className="mt-4">
          <WorkstreamLane
            lane={{
              projectId: project.id,
              projectName: project.name,
              projectSlug: project.slug,
              clientSlug: project.client.slug,
              meta: [plural(project.workstreams.length, "workstream"), project.notes].filter(Boolean).join(" · "),
              streams: project.workstreams.map((w) => ({ id: w.id, title: w.title, stage: w.stage, pass: w.pass })),
            }}
          />
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Fee"
          value={totalKnown ? formatMoney(totalKnown) : "TBD"}
          sub={deliverables.some((d) => !d.feeCents) ? "known fees · some TBD" : project.client.name}
        />
        <Stat
          label="Collected"
          value={formatMoney(collected)}
          sub={totalKnown ? `${Math.round((collected / totalKnown) * 100)}% of known fee` : "nothing billed yet"}
        />
        <div className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-tk-slate/60">Invoiceable now</p>
          <p className="mt-1.5 text-[23px] font-semibold leading-tight tracking-tight text-tk-onyx tabular-nums">
            {formatMoney(invoiceableCents)}
          </p>
          <p className={`mt-0.5 truncate text-xs ${invoiceableCents ? "font-semibold text-emerald-800" : "text-tk-slate/60"}`}>
            {invoiceableCents ? `▲ ${invoiceable.map((d) => d.label).join(", ")} done` : "nothing ready to bill"}
          </p>
        </div>
        <Stat
          label={nextDue ? "Next due" : "Status"}
          value={
            nextDue?.dueOn
              ? new Date(nextDue.dueOn + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
              : project.status.replace(/_/g, " ")
          }
          sub={
            nextDue?.dueOn
              ? `${nextDue.label} · ${Math.max(0, Math.ceil((new Date(nextDue.dueOn + "T00:00:00").getTime() - now.getTime()) / 86_400_000))} days out`
              : project.status === "waiting_on_content"
                ? `blocked ${daysSince(project.updatedAt, now)}+ days`
                : project.client.name
          }
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h2 className="text-[13px] font-bold text-tk-onyx">Deliverables</h2>
              <span className="text-[11px] tabular-nums text-tk-slate/60">
                {totalKnown ? `${formatMoney(totalKnown)} across ${deliverables.length}` : plural(deliverables.length, "deliverable")}
              </span>
            </div>
            <ul className="px-2 pb-2">
              {deliverables.map((d) => {
                const done = d.status === "paid" || d.status === "invoiced"
                const ready = d.status === "done"
                return (
                  <li key={d.id} className="flex items-center gap-3 border-b border-tk-slate/[0.06] px-3 py-3 text-sm last:border-0">
                    <span
                      className={
                        done
                          ? "grid size-6 shrink-0 place-items-center rounded-full bg-tk-teal text-xs font-bold text-tk-linen"
                          : ready
                            ? "grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-tk-teal bg-tk-teal/15 text-xs font-bold text-tk-teal"
                            : "grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-tk-slate/30 bg-tk-linen text-xs font-bold text-tk-slate/60"
                      }
                    >
                      {done ? "✓" : ready ? "!" : d.sort || "·"}
                    </span>
                    <Link
                      href={`${ROUTES.project(project.slug)}?peek=deliverable:${d.id}`}
                      scroll={false}
                      className="min-w-0 flex-1 hover:opacity-80"
                    >
                      <span className="block truncate font-semibold text-tk-onyx tabular-nums">
                        {d.label}
                        {d.title ? ` — ${d.title}` : ""}
                        {d.feeCents ? ` · ${formatMoney(d.feeCents)}` : ""}
                      </span>
                      <span className="block text-xs text-tk-slate/60">
                        {ready
                          ? "done · ready to bill"
                          : d.dueOn
                            ? `scheduled ${formatDay(d.dueOn)}`
                            : d.status}
                      </span>
                    </Link>
                    {ready && d.feeCents ? (
                      <form action={draftDeliverableInvoice.bind(null, d.id)}>
                        <button className="rounded-full bg-tk-teal px-3 py-1 text-xs font-semibold text-tk-linen hover:bg-tk-teal/90">
                          Invoice now
                        </button>
                      </form>
                    ) : (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          done ? "bg-tk-teal/10 text-tk-teal" : "bg-tk-slate/10 text-tk-slate/70"
                        }`}
                      >
                        {d.status}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h2 className="text-[13px] font-bold text-tk-onyx">Economics</h2>
              <span className="text-[11px] text-tk-slate/60">
                {hours > 0 ? "from timesheet hours tagged to this project" : "log hours to this project to unlock"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-0 border-t border-tk-slate/[0.06] sm:grid-cols-4">
              <Eco label="Fee (known)" value={totalKnown ? formatMoney(totalKnown) : "TBD"} sub="fixed" />
              <Eco label="Hours logged" value={hours > 0 ? fmtHours(hours) : "0"} sub="via timesheet" />
              <Eco
                label="Effective rate"
                value={effRate ? `${formatMoney(effRate)}/hr` : "—"}
                sub={
                  effRate
                    ? effRate >= RATE_TARGET_CENTS
                      ? `healthy vs ${formatMoney(RATE_TARGET_CENTS)} target`
                      : `below ${formatMoney(RATE_TARGET_CENTS)} target`
                    : "billed ÷ hours"
                }
                tone={effRate ? (effRate >= RATE_TARGET_CENTS ? "good" : "bad") : undefined}
              />
              <Eco
                label="Break-even"
                value={totalKnown ? `${fmtHours(totalKnown / RATE_TARGET_CENTS)} hr` : "—"}
                sub={`rate hits ${formatMoney(RATE_TARGET_CENTS)} target here`}
              />
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h2 className="text-[13px] font-bold text-tk-onyx">Paper trail</h2>
            </div>
            <ul className="px-1 pb-2">
              <li className="flex items-center gap-3 border-b border-tk-slate/[0.06] px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-tk-onyx">
                    Contract {contract ? `— ${contract.status}` : ""}
                  </span>
                  <span className="block text-xs text-tk-slate/60">
                    {contract ? "on file" : "no contract linked"}
                  </span>
                </span>
                {contract ? (
                  <Link href={ROUTES.contract(contract.slug ?? project.slug)} className="rounded-full border border-tk-slate/20 px-3 py-1 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal">
                    Open
                  </Link>
                ) : null}
              </li>
              {projectInvoices.length === 0 ? (
                <li className="px-4 py-2.5 text-sm text-tk-slate/60">No invoices raised yet.</li>
              ) : (
                projectInvoices.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 border-b border-tk-slate/[0.06] px-4 py-2.5 text-sm last:border-0">
                    <Link
                      href={`${ROUTES.project(project.slug)}?peek=invoice:${encodeURIComponent(i.number)}`}
                      scroll={false}
                      className="min-w-0 flex-1 hover:opacity-80"
                    >
                      <span className="block font-semibold tabular-nums text-tk-onyx">
                        {i.number} · {formatMoney(i.amountCents)}
                      </span>
                      <span className="block text-xs text-tk-slate/60">{formatDay(i.issuedOn)}</span>
                    </Link>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        i.status === "paid"
                          ? "bg-tk-slate/10 text-tk-slate/70"
                          : i.status === "sent"
                            ? "bg-red-700/10 text-red-700"
                            : "bg-amber-700/10 text-amber-800"
                      }`}
                    >
                      {i.status}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h2 className="text-[13px] font-bold text-tk-onyx">Links</h2>
              <span className="text-[11px] text-tk-slate/60">staging · live · repo</span>
            </div>
            <ul className="px-1 pb-1">
              {links.length === 0 ? (
                <li className="px-4 py-2 text-sm text-tk-slate/60">Nothing yet — add the staging links below.</li>
              ) : (
                links.map((l, i) => (
                  <li key={i} className="flex items-center gap-2 border-b border-tk-slate/[0.06] px-4 py-2 text-sm last:border-0">
                    <a href={l.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate font-semibold text-tk-onyx hover:text-tk-teal">
                      {l.label}
                    </a>
                    <a href={l.url} target="_blank" rel="noreferrer" className="rounded-full border border-tk-slate/20 px-3 py-1 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal">
                      Open
                    </a>
                    <form action={removeProjectLink}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="index" value={i} />
                      <button aria-label={`Remove ${l.label}`} className="px-1 text-xs font-semibold text-tk-slate/40 hover:text-red-700">✕</button>
                    </form>
                  </li>
                ))
              )}
            </ul>
            <form action={addProjectLink} className="flex gap-2 border-t border-tk-slate/[0.06] px-4 py-3">
              <input type="hidden" name="projectId" value={project.id} />
              <input name="label" placeholder="Label" className="w-24 rounded-lg border border-tk-slate/20 bg-tk-linen px-2.5 py-1.5 text-xs outline-none focus:border-tk-teal" />
              <input name="url" placeholder="https://…" className="min-w-0 flex-1 rounded-lg border border-tk-slate/20 bg-tk-linen px-2.5 py-1.5 text-xs outline-none focus:border-tk-teal" />
              <button className="rounded-full border border-tk-slate/20 px-3 py-1 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal">Add</button>
            </form>
          </section>

          {projectPunchlists.length > 0 ? (
            <section>
              <div className="flex items-center justify-between px-1 pb-2">
                <h2 className="text-[13px] font-bold text-tk-onyx">Punch lists</h2>
                <span className="text-[11px] tabular-nums text-tk-slate/60">{projectPunchlists.length}</span>
              </div>
              <PunchlistList rows={projectPunchlists} peekBase={ROUTES.project(project.slug)} />
            </section>
          ) : null}

          <section className="rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 pb-1 pt-4">
              <h2 className="text-[13px] font-bold text-tk-onyx">Open tasks</h2>
              <span className="text-[11px] tabular-nums text-tk-slate/60">{tasks.length}</span>
            </div>

            <div className="px-4 pb-3 pt-2">
              <TaskComposer
                targets={targets}
                scope={{
                  clientId: project.clientId,
                  clientName: project.client.name,
                  clientSlug: project.client.slug,
                  projectId: project.id,
                  projectName: project.name,
                }}
                placeholder={`Add a task for ${project.name}…`}
                compact
              />
            </div>

            {tasks.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-tk-slate/60">
                Nothing open. Anything typed above lands on this project.
              </p>
            ) : (
              <div className="px-3 pb-3">
                <TaskRows
                  tasks={tasks}
                  sortBy="due"
                  grouping="none"
                  peekBase={ROUTES.project(project.slug)}
                />
              </div>
            )}
          </section>

          {project.notes ? (
            <section className="rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm">
              <h2 className="text-[13px] font-bold text-tk-onyx">Notes</h2>
              <p className="mt-2 text-sm leading-relaxed text-tk-slate">{project.notes}</p>
            </section>
          ) : null}
        </div>
      </div>
    </>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-tk-slate/60">{label}</p>
      <p className="mt-1.5 text-[23px] font-semibold leading-tight tracking-tight text-tk-onyx tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-xs text-tk-slate/60">{sub}</p>
    </div>
  )
}

function Eco({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub: string
  tone?: "good" | "bad"
}) {
  return (
    <div className="border-b border-r border-tk-slate/[0.06] px-5 py-3.5 last:border-r-0 sm:border-b-0">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-tk-slate/60">{label}</p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "good" ? "text-emerald-800" : tone === "bad" ? "text-red-700" : "text-tk-onyx"
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] text-tk-slate/60">{sub}</p>
    </div>
  )
}
