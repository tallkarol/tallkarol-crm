import Link from "next/link"
import { eq } from "drizzle-orm"
import { Burndown, type BurndownMonth } from "@/components/delivery/Burndown"
import {
  Attention,
  Block,
  Card,
  KeyValue,
  Line,
  ModalShell,
  ModalStrip,
} from "@/components/delivery/ModalShell"
import { AddWorkstream, DeliverableInvoiceButton } from "@/components/delivery/ModalControls"
import { StatusMenu, type StatusOption } from "@/components/delivery/StatusMenu"
import { db } from "@/db"
import { projects, retainers } from "@/db/schema"
import {
  daysUntil,
  projectAttention,
  retainerAttention,
  type InvoiceFacts,
  type TicketFacts,
} from "@/lib/attention"
import { clientColor } from "@/lib/client-colors"
import { hoursByMonth, monthsLeft, retainerRateCents, ym } from "@/lib/engagements"
import { ROUTES } from "@/lib/nav"
import { ticketPriority, ticketState } from "@/lib/support"
import {
  DELIVERABLE_STATUS_LABEL,
  FEE_STATUS_LABEL,
  PROJECT_STATUS_LABEL,
  RETAINER_STATUS_LABEL,
  formatDay,
  formatMoney,
  plural,
} from "@/lib/work"
import { WORKSTREAM_STAGES, ordinal } from "@/lib/pipeline"

/* ------------------------------------------------------------------ menus */

const PROJECT_STATUS_OPTIONS: StatusOption[] = [
  { value: "in_progress", label: PROJECT_STATUS_LABEL.in_progress, tone: "progress" },
  { value: "waiting_on_content", label: PROJECT_STATUS_LABEL.waiting_on_content, tone: "waiting" },
  { value: "complete", label: PROJECT_STATUS_LABEL.complete, tone: "done" },
]

const FEE_STATUS_OPTIONS: StatusOption[] = [
  { value: "agreed", label: FEE_STATUS_LABEL.agreed, tone: "flat" },
  { value: "deposit_paid", label: FEE_STATUS_LABEL.deposit_paid, tone: "flat" },
  { value: "paid", label: FEE_STATUS_LABEL.paid, tone: "done" },
]

const RETAINER_STATUS_OPTIONS: StatusOption[] = [
  { value: "active", label: RETAINER_STATUS_LABEL.active, tone: "progress" },
  { value: "paused", label: RETAINER_STATUS_LABEL.paused, tone: "waiting" },
  { value: "ended", label: RETAINER_STATUS_LABEL.ended, tone: "flat" },
]

const DELIVERABLE_STATUS_OPTIONS: StatusOption[] = [
  { value: "pending", label: DELIVERABLE_STATUS_LABEL.pending, tone: "flat" },
  { value: "done", label: DELIVERABLE_STATUS_LABEL.done, tone: "open" },
  { value: "invoiced", label: DELIVERABLE_STATUS_LABEL.invoiced, tone: "progress" },
  { value: "paid", label: DELIVERABLE_STATUS_LABEL.paid, tone: "done" },
]

const WORKSTREAM_STAGE_OPTIONS: StatusOption[] = WORKSTREAM_STAGES.map((s) => ({
  value: s.id,
  label: s.label,
  tone: s.id === "live" || s.id === "approved" ? "done" : s.id === "feedback" ? "open" : "progress",
}))

/* ----------------------------------------------------------------- header */

function Header({
  color,
  crumb,
  name,
  sub,
  chips,
}: {
  color: string
  crumb: string
  name: string
  sub: string
  chips: React.ReactNode
}) {
  return (
    <div className="px-4 pb-3 pt-3.5">
      <div className="flex items-start gap-2.5 pr-9">
        <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.07em] text-tk-slate/60">
            {crumb}
          </p>
          <h2 className="text-[17px] font-semibold tracking-tight text-tk-onyx">{name}</h2>
          <p className="mt-0.5 text-[11.5px] text-tk-slate/65">{sub}</p>
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">{chips}</div>
    </div>
  )
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="ml-auto text-[11.5px] font-semibold text-tk-teal hover:underline"
    >
      {children} →
    </Link>
  )
}

/* ---------------------------------------------------------------- project */

async function ProjectModal({ slug, closeHref }: { slug: string; closeHref: string }) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.slug, slug),
    with: {
      client: true,
      deliverables: { orderBy: (d, { asc }) => [asc(d.sort), asc(d.label)] },
      workstreams: { orderBy: (w, { asc }) => [asc(w.sort), asc(w.createdAt)] },
    },
  })
  if (!project) return null

  const [invoices, tasks, entries] = await Promise.all([
    db.query.invoices.findMany({ where: (i, { eq: e }) => e(i.projectId, project.id) }),
    db.query.tasks
      .findMany({ where: (t, { eq: e }) => e(t.projectId, project.id) })
      .catch(() => []),
    db.query.timeEntries
      .findMany({ where: (t, { eq: e }) => e(t.projectId, project.id) })
      .catch(() => []),
  ])

  const flags = projectAttention(
    {
      status: project.status,
      updatedAt: project.updatedAt,
      workstreams: project.workstreams.map((w) => ({
        title: w.title,
        stage: w.stage,
        updatedAt: w.updatedAt,
      })),
      deliverables: project.deliverables.map((d) => ({
        label: d.label,
        title: d.title,
        status: d.status,
        feeCents: d.feeCents,
        dueOn: d.dueOn,
      })),
      invoices: invoices.map(
        (i): InvoiceFacts => ({
          number: i.number,
          status: i.status,
          issuedOn: i.issuedOn,
          amountCents: i.amountCents,
        })
      ),
      tickets: [],
    },
    new Date()
  )

  const contractCents = project.deliverables.reduce((sum, d) => sum + (d.feeCents ?? 0), 0)
  const invoicedCents = invoices.reduce((sum, i) => sum + i.amountCents, 0)
  const paidCents = invoices
    .filter((i) => i.status === "paid")
    .reduce((sum, i) => sum + i.amountCents, 0)
  const readyCents = project.deliverables
    .filter((d) => d.status === "done" && (d.feeCents ?? 0) > 0)
    .reduce((sum, d) => sum + (d.feeCents ?? 0), 0)
  const remainingCents = project.deliverables
    .filter((d) => d.status === "pending")
    .reduce((sum, d) => sum + (d.feeCents ?? 0), 0)
  const hours = entries.reduce((sum, e) => sum + Number(e.hours), 0)
  const openTasks = tasks.filter((t) => t.status === "open")

  return (
    <ModalShell
      closeHref={closeHref}
      label={`${project.client.name} — ${project.name}`}
      header={
        <Header
          color={clientColor(project.client.slug)}
          crumb={`${project.client.name} · Project`}
          name={project.name}
          sub={[
            plural(project.workstreams.length, "workstream"),
            plural(project.deliverables.length, "deliverable"),
            `started ${formatDay(project.createdAt.toISOString().slice(0, 10))}`,
          ].join(" · ")}
          chips={
            <>
              <StatusMenu
                options={PROJECT_STATUS_OPTIONS}
                current={project.status}
                title="Project status"
                target={{ kind: "project-status", id: project.id }}
              />
              <StatusMenu
                options={FEE_STATUS_OPTIONS}
                current={project.feeStatus}
                title="Fee status"
                target={{ kind: "project-fee", id: project.id }}
              />
            </>
          }
        />
      }
      footer={<FooterLink href={ROUTES.project(project.slug)}>Open project page</FooterLink>}
    >
      <ModalStrip
        cells={[
          {
            label: "Contract",
            value: contractCents > 0 ? formatMoney(contractCents) : "—",
            caption: plural(project.deliverables.length, "deliverable"),
          },
          {
            label: "Invoiced",
            value: formatMoney(invoicedCents),
            caption: invoices.length ? invoices.map((i) => i.number).join(", ") : "nothing yet",
          },
          { label: "Paid", value: formatMoney(paidCents), caption: "", tone: "green" },
          {
            label: "Unbilled",
            value: readyCents > 0 ? formatMoney(readyCents) : "—",
            caption: readyCents > 0 ? "done, not invoiced" : "nothing waiting",
            tone: readyCents > 0 ? "amber" : undefined,
          },
        ]}
      />

      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="border-tk-slate/10 px-4 py-3.5 lg:border-r">
          <Block
            title="Workstreams"
            count={project.workstreams.length || undefined}
            action={<AddWorkstream projectId={project.id} />}
          >
            {project.workstreams.length === 0 ? (
              <p className="rounded-xl border border-dashed border-tk-slate/20 px-3 py-2.5 text-[11.5px] text-tk-slate/60">
                No workstreams yet.
              </p>
            ) : (
              <Card>
                {project.workstreams.map((w) => (
                  <Line key={w.id}>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-tk-onyx">
                      {w.title}
                    </span>
                    <StatusMenu
                      options={WORKSTREAM_STAGE_OPTIONS}
                      current={w.stage}
                      align="right"
                      title="Workstream stage"
                      target={{ kind: "workstream-stage", id: w.id }}
                    />
                    <span className="shrink-0 text-[11px] text-tk-slate/60">
                      {ordinal(w.pass)} pass
                    </span>
                  </Line>
                ))}
              </Card>
            )}
          </Block>

          <Block title="Deliverables" count={project.deliverables.length || undefined}>
            {project.deliverables.length === 0 ? (
              <p className="rounded-xl border border-dashed border-tk-slate/20 px-3 py-2.5 text-[11.5px] text-tk-slate/60">
                No deliverables yet.
              </p>
            ) : (
              <Card>
                {project.deliverables.map((d) => {
                  const ready = d.status === "done" && (d.feeCents ?? 0) > 0
                  return (
                    <Line key={d.id} hot={ready}>
                      <span className="w-10 shrink-0 font-mono text-[10px] font-semibold text-tk-slate/45">
                        {d.label}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-tk-onyx">
                        {d.title || d.label}
                      </span>
                      <StatusMenu
                        options={DELIVERABLE_STATUS_OPTIONS}
                        current={d.status}
                        align="right"
                        title="Deliverable status"
                        target={{ kind: "deliverable-status", id: d.id }}
                      />
                      {ready ? <DeliverableInvoiceButton deliverableId={d.id} /> : null}
                      {d.dueOn ? (
                        <span className="shrink-0 text-[11px] text-tk-slate/60">
                          due {formatDay(d.dueOn)}
                        </span>
                      ) : null}
                      <span
                        className={
                          ready
                            ? "shrink-0 font-mono text-[11.5px] font-semibold tabular-nums text-[#8A5A05]"
                            : "shrink-0 font-mono text-[11.5px] font-semibold tabular-nums text-tk-onyx"
                        }
                      >
                        {d.feeCents ? formatMoney(d.feeCents) : "TBD"}
                      </span>
                    </Line>
                  )
                })}
              </Card>
            )}
          </Block>

          <Block
            title="Tasks"
            count={openTasks.length ? `${openTasks.length} open` : undefined}
            action={
              <Link
                href={ROUTES.tasks}
                className="text-[11px] font-semibold text-tk-teal hover:underline"
              >
                Open tasks
              </Link>
            }
          >
            {openTasks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-tk-slate/20 px-3 py-2.5 text-[11.5px] text-tk-slate/60">
                Nothing open against this project.
              </p>
            ) : (
              <Card>
                {openTasks.map((t) => (
                  <Line key={t.id}>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-tk-onyx">
                      {t.title}
                    </span>
                    <span className="shrink-0 text-[11px] text-tk-slate/60">
                      {t.dueOn ? `due ${formatDay(t.dueOn)}` : "no due date"}
                    </span>
                  </Line>
                ))}
              </Card>
            )}
          </Block>
        </div>

        <div className="bg-[#FCFAF5] px-4 py-3.5">
          <Block title="Needs you" count={flags.length || undefined}>
            <Attention flags={flags} />
          </Block>

          <Block title="Money">
            <Card padded>
              {invoices.map((i) => (
                <KeyValue
                  key={i.id}
                  label={`${i.number} · ${i.status}`}
                  value={formatMoney(i.amountCents)}
                  tone={i.status === "draft" ? "amber" : undefined}
                />
              ))}
              {readyCents > 0 ? (
                <KeyValue label="Ready to invoice" value={formatMoney(readyCents)} tone="amber" />
              ) : null}
              {remainingCents > 0 ? (
                <KeyValue label="Remaining on contract" value={formatMoney(remainingCents)} />
              ) : null}
              {invoices.length === 0 && readyCents === 0 && remainingCents === 0 ? (
                <KeyValue label="Nothing billed yet" value="—" />
              ) : null}
            </Card>
          </Block>

          <Block title="Hours">
            <Card padded>
              <KeyValue
                label="Time logged to project"
                value={hours > 0 ? `${hours.toFixed(2)} hr` : "none"}
              />
            </Card>
          </Block>

          {project.notes ? (
            <Block title="Notes">
              <p className="rounded-xl border border-tk-slate/15 bg-tk-linen px-3 py-2 text-[11.5px] leading-relaxed text-tk-slate">
                {project.notes}
              </p>
            </Block>
          ) : null}
        </div>
      </div>
    </ModalShell>
  )
}

/* --------------------------------------------------------------- retainer */

async function RetainerModal({ slug, closeHref }: { slug: string; closeHref: string }) {
  const retainer = await db.query.retainers.findFirst({
    where: eq(retainers.slug, slug),
    with: { client: true },
  })
  if (!retainer) return null

  const now = new Date()
  const [allInvoices, entries, tasks, tickets] = await Promise.all([
    db.query.invoices.findMany(),
    db.query.timeEntries.findMany(),
    db.query.tasks.findMany().catch(() => []),
    db.query.supportTickets.findMany().catch(() => []),
  ])

  const retainerInvoices = allInvoices
    .filter((i) => i.retainerId === retainer.id)
    .sort((a, b) => (a.issuedOn > b.issuedOn ? -1 : 1))
  const byMonth = hoursByMonth(entries, retainer.id)
  const thisMonth = ym(now)
  const hours = byMonth.get(thisMonth) ?? 0
  const rate = retainerRateCents(retainer, allInvoices)

  const clientTickets: TicketFacts[] = tickets
    .filter((t) => t.clientId === retainer.clientId && ticketState(t) !== "closed")
    .map((t) => {
      const opened = t.submittedOn ? new Date(`${t.submittedOn}T00:00:00`) : t.createdAt
      return {
        priority: ticketPriority(t.priority),
        ageDays: Math.max(0, Math.floor((now.getTime() - opened.getTime()) / 86_400_000)),
        answered: t.firstResponseAt != null,
      }
    })

  const openTasks = tasks.filter(
    (t) => t.status === "open" && (t.retainerId === retainer.id || t.clientId === retainer.clientId)
  )
  const hasRenewalTask = openTasks.some((t) => /renew/i.test(t.title))

  const flags = retainerAttention(
    {
      status: retainer.status,
      hoursPerMonth: retainer.hoursPerMonth,
      endsOn: retainer.endsOn,
      hoursThisMonth: Math.round(hours * 100) / 100,
      invoicedThisMonth: retainerInvoices.some((i) => i.issuedOn.slice(0, 7) === thisMonth),
      invoices: retainerInvoices.map(
        (i): InvoiceFacts => ({
          number: i.number,
          status: i.status,
          issuedOn: i.issuedOn,
          amountCents: i.amountCents,
        })
      ),
      tickets: clientTickets,
      hasRenewalTask,
    },
    now
  )

  /*
   * Six months of hours.
   *
   * For a closed month the invoice is the settled truth — it is what the
   * client was actually billed — so it wins over logged time, which for
   * months predating the timesheet is patchy or absent. The current month has
   * no invoice yet, so it reads from the clock.
   */
  const months: BurndownMonth[] = []
  for (let back = 5; back >= 0; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1)
    const key = ym(d)
    const current = key === thisMonth
    const logged = byMonth.get(key) ?? 0
    const invoice = retainerInvoices.find(
      (i) => i.issuedOn.slice(0, 7) === key && i.status !== "draft"
    )
    const invoiceHours = invoice?.hours ? Number(invoice.hours) : null
    const useInvoice = !current && invoiceHours != null && invoiceHours > 0
    months.push({
      key,
      label: d.toLocaleDateString("en-US", { month: "short" }),
      hours: Math.round((useInvoice ? invoiceHours : logged) * 10) / 10,
      billed: useInvoice,
      current,
    })
  }

  const accruedCents = rate ? Math.round(hours * rate) : null
  const draft = retainerInvoices.find((i) => i.status === "draft")
  const left = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
  const remainingMonths = monthsLeft(retainer.endsOn, now)

  return (
    <ModalShell
      closeHref={closeHref}
      label={`${retainer.client.name} — retainer`}
      header={
        <Header
          color={clientColor(retainer.client.slug)}
          crumb={`${retainer.client.name} · Retainer`}
          name={retainer.name}
          sub={[
            `${retainer.hoursPerMonth}h/month ceiling`,
            rate ? `at ${formatMoney(rate)}/hr` : null,
            retainer.endsOn
              ? `renews ${formatDay(retainer.endsOn)}${remainingMonths != null ? ` · ${plural(remainingMonths, "month")} left` : ""}`
              : "evergreen",
          ]
            .filter(Boolean)
            .join(" · ")}
          chips={
            <StatusMenu
              options={RETAINER_STATUS_OPTIONS}
              current={retainer.status}
              title="Retainer status"
              target={{ kind: "retainer-status", id: retainer.id }}
            />
          }
        />
      }
      footer={<FooterLink href={ROUTES.retainer(retainer.slug)}>Open retainer page</FooterLink>}
    >
      <ModalStrip
        cells={[
          {
            label: now.toLocaleDateString("en-US", { month: "long" }),
            value: (
              <>
                {hours.toFixed(1)}
                <span className="text-[12px] text-tk-slate/60">/{retainer.hoursPerMonth}h</span>
              </>
            ),
            caption: `${plural(entries.filter((e) => e.retainerId === retainer.id && e.occurredOn.slice(0, 7) === thisMonth).length, "entry").replace("entrys", "entries")}`,
          },
          {
            label: "Accrued",
            value: accruedCents != null ? formatMoney(accruedCents) : "—",
            caption: rate ? `at ${formatMoney(rate)}/hr` : "no rate set",
          },
          {
            label: "Invoice",
            value: draft ? "Draft" : retainerInvoices[0] ? retainerInvoices[0].status : "—",
            caption: draft
              ? `${draft.number} · issues ${formatDay(draft.issuedOn)}`
              : (retainerInvoices[0]?.number ?? "nothing yet"),
            tone: draft ? "amber" : undefined,
          },
          {
            label: "Headroom",
            value: `${Math.max(0, retainer.hoursPerMonth - hours).toFixed(1)}h`,
            caption: `${plural(left, "day")} left in the month`,
          },
        ]}
      />

      <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="border-tk-slate/10 px-4 py-3.5 lg:border-r">
          <Block title="Hours by month" count="against the ceiling">
            <Burndown months={months} cap={retainer.hoursPerMonth} />
          </Block>

          <Block
            title="Tasks"
            count={openTasks.length ? `${openTasks.length} open` : undefined}
            action={
              <Link
                href={ROUTES.tasks}
                className="text-[11px] font-semibold text-tk-teal hover:underline"
              >
                Open tasks
              </Link>
            }
          >
            {openTasks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-tk-slate/20 px-3 py-2.5 text-[11.5px] text-tk-slate/60">
                Nothing open for this client.
              </p>
            ) : (
              <Card>
                {openTasks.slice(0, 8).map((t) => (
                  <Line key={t.id}>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-tk-onyx">
                      {t.title}
                    </span>
                    <span
                      className={
                        t.dueOn && (daysUntil(t.dueOn, now) ?? 99) <= 7
                          ? "shrink-0 text-[11px] font-semibold text-[#8A5A05]"
                          : "shrink-0 text-[11px] text-tk-slate/60"
                      }
                    >
                      {t.dueOn ? `due ${formatDay(t.dueOn)}` : t.cadence !== "none" ? `repeats ${t.cadence}` : "no due date"}
                    </span>
                  </Line>
                ))}
              </Card>
            )}
          </Block>
        </div>

        <div className="bg-[#FCFAF5] px-4 py-3.5">
          <Block title="Needs you" count={flags.length || undefined}>
            <Attention flags={flags} />
          </Block>

          <Block title="Recent invoices">
            <Card padded>
              {retainerInvoices.length === 0 ? (
                <KeyValue label="Nothing billed yet" value="—" />
              ) : (
                retainerInvoices
                  .slice(0, 5)
                  .map((i) => (
                    <KeyValue
                      key={i.id}
                      label={`${i.number} · ${i.status}`}
                      value={formatMoney(i.amountCents)}
                      tone={i.status === "draft" ? "amber" : undefined}
                    />
                  ))
              )}
            </Card>
          </Block>

          <Block title="Tickets">
            <Card padded>
              <KeyValue
                label={`Open, ${retainer.client.name}`}
                value={clientTickets.length}
                tone={clientTickets.length > 0 ? "amber" : undefined}
              />
              {clientTickets.length > 0 ? (
                <KeyValue
                  label="Oldest"
                  value={`${Math.max(...clientTickets.map((t) => t.ageDays))}d`}
                />
              ) : null}
            </Card>
          </Block>

          <Block title="Renewal">
            <Card padded>
              <KeyValue
                label="Ends"
                value={retainer.endsOn ? formatDay(retainer.endsOn) : "evergreen"}
              />
              <KeyValue
                label="Renewal task"
                value={hasRenewalTask ? "filed" : "not filed"}
                tone={!hasRenewalTask && retainer.endsOn ? "amber" : undefined}
              />
            </Card>
          </Block>
        </div>
      </div>
    </ModalShell>
  )
}

/* ------------------------------------------------------------------ router */

export async function EngagementModal({
  open,
  closeHref,
}: {
  open: string
  closeHref: string
}) {
  const idx = open.indexOf(":")
  const kind = idx === -1 ? open : open.slice(0, idx)
  const slug = idx === -1 ? "" : decodeURIComponent(open.slice(idx + 1))
  if (!slug) return null

  if (kind === "project") return <ProjectModal slug={slug} closeHref={closeHref} />
  if (kind === "retainer") return <RetainerModal slug={slug} closeHref={closeHref} />
  return null
}
