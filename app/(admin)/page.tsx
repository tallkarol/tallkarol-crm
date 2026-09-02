import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { Forecast } from "@/components/dashboard/Forecast"
import { MonthBilled } from "@/components/dashboard/MonthBilled"
import { NeedsAttention } from "@/components/dashboard/NeedsAttention"
import { Unread } from "@/components/dashboard/Unread"
import { UpcomingMeetings } from "@/components/dashboard/UpcomingMeetings"
import { PeekRouter, peekHref } from "@/components/peek/PeekRouter"
import { db } from "@/db"
import { getUpcomingMeetings } from "@/lib/calendar"
import { CHART_ORDER, clientColor } from "@/lib/client-colors"
import { retainerRateCents } from "@/lib/engagements"
import { buildForecast, retainerCoversMonth } from "@/lib/forecast"
import { getGoals } from "@/lib/goals"
import { ROUTES } from "@/lib/nav"
import { getSessionUser } from "@/lib/auth"
import { greetingFor } from "@/lib/greeting"
import { ensureRenewalTasks } from "@/lib/renewals"
import { loadUnread } from "@/lib/unread-data"
import { reopenDueRecurring, waitingTooLong } from "@/lib/tasks"
import { formatDay, formatMoney } from "@/lib/work"

export const metadata = { title: "Dashboard" }
export const dynamic = "force-dynamic"

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function daysFromToday(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000)
}

function taskDue(dueOn: string | null) {
  if (!dueOn) return null
  const [y, m, d] = dueOn.split("-").map(Number)
  const due = Date.UTC(y, m - 1, d)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((due - today) / 86_400_000)
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { status?: string; peek?: string }
}) {
  if (searchParams.status) {
    redirect(`${ROUTES.inquiries}?status=${searchParams.status}`)
  }

  await ensureRenewalTasks()
  // One helper, everywhere tasks are read — so the dashboard and the hub
  // cannot disagree about whether a repeat is open.
  await reopenDueRecurring()
  const stalled = await waitingTooLong()
  const sessionUser = await getSessionUser()
  const [invoices, openTasks, retainers, projects, timeEntries, meetings, unread] =
    await Promise.all([
      db.query.invoices.findMany({ with: { client: true } }),
      db.query.tasks.findMany({ with: { client: true } }).then((rows) =>
        rows.filter((t) => t.status === "open")
      ),
      db.query.retainers.findMany({ with: { client: true, timeEntries: true } }),
      db.query.projects.findMany({ with: { client: true, deliverables: true } }),
      db.query.timeEntries.findMany({ with: { client: true } }),
      getUpcomingMeetings(),
      // Cached per request — the shell already loaded this for the badges.
      loadUnread(),
    ])

  const goals = await getGoals()
  const greeting = await greetingFor(sessionUser)
  const now = new Date()
  const thisMonth = monthKey(now)

  /* ---- KPIs ---- */
  const unpaid = invoices
    .filter((i) => i.status === "sent")
    .sort((a, b) => (a.issuedOn < b.issuedOn ? -1 : 1))

  const billedThisMonth = invoices.filter((i) => i.issuedOn.startsWith(thisMonth))
  const billedCents = billedThisMonth.reduce((s, i) => s + i.amountCents, 0)
  /* ---- what this month is still expected to produce ---- */
  const rateByRetainer = new Map(
    retainers.map((r) => [r.id, retainerRateCents(r, invoices)])
  )
  const loggedThisMonth = new Map<string, number>()
  for (const e of timeEntries) {
    if (e.retainerId && e.occurredOn.startsWith(thisMonth)) {
      loggedThisMonth.set(e.retainerId, (loggedThisMonth.get(e.retainerId) ?? 0) + Number(e.hours))
    }
  }
  /* Itemized "still expected" lines for the month card. */
  const monthExpectedLines: { label: string; sub: string | null; cents: number }[] = []
  for (const r of retainers) {
    const rate = rateByRetainer.get(r.id)
    if (!rate) continue
    if (invoices.some((i) => i.retainerId === r.id && i.issuedOn.slice(0, 7) === thisMonth)) continue
    if (retainerCoversMonth(r, thisMonth)) {
      monthExpectedLines.push({
        label: r.name,
        sub: `${r.hoursPerMonth} hr × ${formatMoney(rate)}`,
        cents: rate * r.hoursPerMonth,
      })
    } else {
      const logged = loggedThisMonth.get(r.id) ?? 0
      if (logged > 0) {
        monthExpectedLines.push({
          label: r.name,
          sub: `${logged.toLocaleString("en-US", { maximumFractionDigits: 1 })} hr logged × ${formatMoney(rate)}`,
          cents: Math.round(logged * rate),
        })
      }
    }
  }
  for (const p of projects) {
    for (const d of p.deliverables) {
      if (d.status === "done" && d.feeCents && (!d.dueOn || d.dueOn.slice(0, 7) <= thisMonth)) {
        monthExpectedLines.push({
          label: `${d.label} — ${p.name}`,
          sub: "done · unbilled",
          cents: d.feeCents,
        })
      }
    }
  }
  const currentRemainderCents = monthExpectedLines.reduce((s, l) => s + l.cents, 0)
  const monthlyGoalCents = goals.annualCents
    ? Math.round(goals.annualCents / 12)
    : goals.monthlyCents

  const loadMonth = now.toLocaleDateString("en-US", { month: "long" })
  const load = retainers
    .filter((r) => r.status === "active")
    .map((r) => {
      const logged = r.timeEntries
        .filter((e) => e.occurredOn.startsWith(thisMonth))
        .reduce((sum, e) => sum + Number(e.hours), 0)
      const invoiced = invoices
        .filter(
          (i) =>
            i.retainerId === r.id &&
            i.issuedOn.startsWith(thisMonth) &&
            i.hours != null
        )
        .reduce((sum, i) => sum + Number(i.hours), 0)
      return {
        name: r.name,
        slug: r.client.slug,
        hours: logged || invoiced,
        cap: r.hoursPerMonth,
      }
    })
    .sort((a, b) => {
      const ai = CHART_ORDER.indexOf(a.slug)
      const bi = CHART_ORDER.indexOf(b.slug)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

  // A manual dashboard order wins once one exists. New/unranked tasks sit
  // after it and retain the useful due-date ordering until the next drag.
  const actionTasks = openTasks
    .filter((t) => t.cadence === "none")
    .sort((a, b) => {
      if (a.sort !== b.sort && (a.sort > 0 || b.sort > 0)) {
        if (a.sort <= 0) return 1
        if (b.sort <= 0) return -1
        return a.sort - b.sort
      }
      if (a.dueOn && b.dueOn) return a.dueOn < b.dueOn ? -1 : 1
      if (a.dueOn) return -1
      if (b.dueOn) return 1
      return a.createdAt < b.createdAt ? -1 : 1
    })
  const forecast = buildForecast(
    {
      retainers,
      invoices,
      projects,
      entries: timeEntries,
      order: CHART_ORDER,
    },
    now
  )

  /* ---- needs attention ---- */
  const waiting = projects.filter((p) => p.status === "waiting_on_content")
  const pendingDeliverables = projects
    .filter((p) => p.status === "in_progress")
    .flatMap((p) =>
      p.deliverables
        .filter((d) => d.status === "pending")
        .map((d) => ({ id: d.id, title: d.title || d.label, project: p }))
    )

  return (
    <>
      <PageHeader title={greeting} />
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref="/" />
      ) : null}

      <div className="mt-5 grid min-w-0 gap-3 md:mt-8 xl:grid-cols-[1fr_3fr]">
        <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
          <Unread summary={unread} />
          <MonthBilled
            monthLabel={now.toLocaleDateString("en-US", { month: "long" })}
            billedCents={billedCents}
            monthlyGoalCents={monthlyGoalCents}
            invoices={billedThisMonth.map((i) => ({
              number: i.number,
              clientName: i.client.name,
              amountCents: i.amountCents,
              status: i.status,
            }))}
            expected={monthExpectedLines}
            expectedTotalCents={billedCents + currentRemainderCents}
          />
          <div className="hidden rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm md:block">
            <p className="text-xs font-semibold uppercase tracking-wider text-tk-slate/70">
              Retainer load{loadMonth ? ` · ${loadMonth}` : ""}
            </p>
            <div className="mt-3 space-y-2">
              {load.length === 0 ? (
                <p className="text-sm text-tk-slate/70">No active retainers.</p>
              ) : (
                load.map((r) => (
                  <div key={r.slug} className="grid grid-cols-[76px_1fr_58px] items-center gap-2 text-xs">
                    <span className="font-semibold" style={{ color: clientColor(r.slug) }}>
                      {r.name}
                    </span>
                    <span className="block h-1.5 overflow-hidden rounded-full bg-tk-linen">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.min(100, (r.hours / r.cap) * 100)}%`,
                          background: clientColor(r.slug),
                        }}
                      />
                    </span>
                    <span className="text-right tabular-nums text-tk-slate/60">
                      {r.hours.toLocaleString("en-US", { maximumFractionDigits: 1 })}/{r.cap}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="hidden md:block">
            <Forecast months={forecast.months} />
          </div>
        </div>

        <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
          <MeetingsCard
            configured={meetings.configured}
            meetings={meetings.meetings}
          />
          <NeedsAttention
            groups={[
              {
                id: "unpaid",
                label: "Unpaid",
                total: formatMoney(
                  unpaid.reduce((sum, inv) => sum + inv.amountCents, 0)
                ),
                items: unpaid.map((inv) => {
                  const delta = daysFromToday(inv.issuedOn)
                  const overdue = delta < -30
                  return {
                    id: inv.id,
                    href: peekHref("/", "invoice", inv.number),
                    color: clientColor(inv.client.slug),
                    title: inv.client.name,
                    meta: inv.number,
                    detail:
                      delta > 0
                        ? `sends ${formatDay(inv.issuedOn)}`
                        : delta === 0
                          ? "issued today"
                          : overdue
                            ? `${-delta} days overdue`
                            : `${-delta} ${delta === -1 ? "day" : "days"} out`,
                    amount: formatMoney(inv.amountCents, inv.currency),
                    tone: overdue ? "bad" : "warn",
                  }
                }),
              },
              {
                id: "waiting",
                label: "Waiting on client",
                items: stalled.map((t) => ({
                  id: t.id,
                  href: peekHref("/", "task", t.id),
                  color: t.clientSlug ? clientColor(t.clientSlug) : "#71807D",
                  title: t.title,
                  meta: t.clientName ?? undefined,
                  detail: `no movement for ${t.days} days`,
                  tone: t.days >= 14 ? ("bad" as const) : ("warn" as const),
                })),
              },
              {
                id: "tasks",
                label: "Tasks",
                reorderable: true,
                completable: true,
                items: actionTasks.map((t) => {
                  const diff = taskDue(t.dueOn)
                  return {
                    id: t.id,
                    href: peekHref("/", "task", t.id),
                    color: t.client ? clientColor(t.client.slug) : "#71807D",
                    title: t.title,
                    meta: t.client?.name,
                    detail:
                      diff == null
                        ? t.notes || undefined
                        : diff < 0
                          ? `overdue since ${formatDay(t.dueOn!)}`
                          : diff === 0
                            ? "due today"
                            : `due ${formatDay(t.dueOn!)}`,
                    tone:
                      diff != null && diff < 0
                        ? "bad"
                        : diff === 0
                          ? "warn"
                          : "neutral",
                  }
                }),
              },
              {
                id: "deliverables",
                label: "On deck",
                items: pendingDeliverables.map((d) => ({
                  id: d.id,
                  href: peekHref("/", "deliverable", d.id),
                  color: clientColor(d.project.client.slug),
                  title: d.title,
                  meta: d.project.client.name,
                  detail: d.project.name,
                  tone: "ok" as const,
                })),
              },
              {
                id: "blocked",
                label: "Blocked",
                items: waiting.map((p) => ({
                  id: p.id,
                  href: peekHref("/", "project", p.slug),
                  color: clientColor(p.client.slug),
                  title: p.name,
                  meta: p.client.name,
                  detail: p.notes || "Waiting on client content",
                  tone: "warn" as const,
                })),
              },
            ]}
          />
        </div>
      </div>
    </>
  )
}

function MeetingsCard({
  configured,
  meetings,
}: {
  configured: boolean
  meetings: React.ComponentProps<typeof UpcomingMeetings>["meetings"]
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-tk-slate/10 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">Meetings</h2>
        <Link
          href={ROUTES.calendar}
          className="text-xs font-semibold text-tk-teal hover:underline"
        >
          Calendar →
        </Link>
      </div>
      {!configured ? (
        <div className="px-5 py-6 text-sm text-tk-slate/70">
          <p>No calendars connected yet — upcoming bookings will show here.</p>
          <Link
            href={ROUTES.settingsCalendar}
            className="mt-2 inline-block text-sm font-semibold text-tk-teal hover:underline"
          >
            Connect calendars →
          </Link>
        </div>
      ) : (
        <UpcomingMeetings meetings={meetings} />
      )}
    </section>
  )
}


