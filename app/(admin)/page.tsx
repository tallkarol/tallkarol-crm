import Link from "next/link"
import { redirect } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { Forecast } from "@/components/dashboard/Forecast"
import { UpcomingMeetings } from "@/components/dashboard/UpcomingMeetings"
import { YearBilled } from "@/components/dashboard/YearBilled"
import { PeekRouter, peekHref } from "@/components/peek/PeekRouter"
import { db } from "@/db"
import { getUpcomingMeetings } from "@/lib/calendar"
import { CHART_ORDER, clientColor } from "@/lib/client-colors"
import { buildForecast } from "@/lib/forecast"
import { getGoals } from "@/lib/goals"
import { ROUTES } from "@/lib/nav"
import { formatDay, formatMoney } from "@/lib/work"

export const metadata = { title: "Dashboard" }
export const dynamic = "force-dynamic"

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function daysOut(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return Math.max(0, Math.floor((Date.now() - Date.UTC(y, m - 1, d)) / 86_400_000))
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
    redirect(`${ROUTES.inbox}?status=${searchParams.status}`)
  }

  const [invoices, openTasks, retainers, projects, timeEntries, meetings] =
    await Promise.all([
      db.query.invoices.findMany({ with: { client: true } }),
      db.query.tasks.findMany({ with: { client: true } }).then((rows) =>
        rows.filter((t) => t.status === "open")
      ),
      db.query.retainers.findMany({ with: { client: true, timeEntries: true } }),
      db.query.projects.findMany({ with: { client: true, deliverables: true } }),
      db.query.timeEntries.findMany({ with: { client: true } }),
      getUpcomingMeetings(),
    ])

  const goals = await getGoals()
  const now = new Date()
  const thisMonth = monthKey(now)

  /* ---- KPIs ---- */
  const unpaid = invoices
    .filter((i) => i.status === "sent")
    .sort((a, b) => (a.issuedOn < b.issuedOn ? -1 : 1))

  const billedThisMonth = invoices.filter((i) => i.issuedOn.startsWith(thisMonth))
  const billedCents = billedThisMonth.reduce((s, i) => s + i.amountCents, 0)
  const yearKey = String(now.getFullYear())
  const billedThisYear = invoices.filter((i) => i.issuedOn.startsWith(yearKey))
  const ytdCents = billedThisYear.reduce((s, i) => s + i.amountCents, 0)
  const yearMonths = Array.from({ length: now.getMonth() + 1 }, (_, month) => {
    const key = `${yearKey}-${String(month + 1).padStart(2, "0")}`
    return {
      key,
      label: new Date(Number(yearKey), month, 1).toLocaleDateString("en-US", {
        month: "long",
      }),
      cents: billedThisYear
        .filter((i) => i.issuedOn.startsWith(key))
        .reduce((s, i) => s + i.amountCents, 0),
    }
  })
  const annualGoalCents =
    goals.annualCents ?? (goals.monthlyCents != null ? goals.monthlyCents * 12 : null)
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

  // Dated tasks first (overdue at the top), undated after.
  const actionTasks = openTasks
    .filter((t) => t.cadence === "none")
    .sort((a, b) => {
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
      <PageHeader title="Dashboard" />
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref="/" />
      ) : null}

      <div className="mt-8 grid min-w-0 gap-3 xl:grid-cols-[1fr_3fr]">
        <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
          <Link
            href={ROUTES.invoices}
            className="flex flex-col justify-center rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm transition-colors hover:border-tk-teal/40"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-tk-slate/70">
              Billed in {now.toLocaleDateString("en-US", { month: "long" })}
            </p>
            <div className="mt-3 flex items-center gap-5">
              <GoalPie
                fraction={monthlyGoalCents ? billedCents / monthlyGoalCents : 0}
              />
              <div className="min-w-0">
                <p className="text-2xl font-semibold tracking-tight text-tk-onyx tabular-nums">
                  {formatMoney(billedCents)}
                </p>
                <p className="mt-0.5 truncate text-xs text-tk-slate/60">
                  {monthlyGoalCents ? (
                    <>
                      <span className="font-semibold text-tk-teal">
                        {Math.round((billedCents / monthlyGoalCents) * 100)}%
                      </span>{" "}
                      of {formatMoney(monthlyGoalCents)} monthly goal
                    </>
                  ) : billedThisMonth.length === 0 ? (
                    "No invoices yet this month"
                  ) : (
                    billedThisMonth
                      .map((i) => `${i.client.name} ${formatMoney(i.amountCents)}`)
                      .join(" · ")
                  )}
                </p>
              </div>
            </div>
          </Link>
          <YearBilled
            year={yearKey}
            ytdCents={ytdCents}
            annualGoalCents={annualGoalCents}
            months={yearMonths}
          />
          <div className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
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
          <Forecast months={forecast.months} />
        </div>

        <div className="flex h-full min-h-0 min-w-0 flex-col gap-3">
          <MeetingsCard
            configured={meetings.configured}
            meetings={meetings.meetings}
          />
          <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-tk-slate/10 px-5 py-3.5">
              <h2 className="text-sm font-semibold text-tk-onyx">Needs attention</h2>
              <span className="text-xs text-tk-slate/60">unpaid + blocked</span>
            </div>
            <ul className="divide-y divide-tk-slate/10">
              {unpaid.map((inv) => {
                const age = daysOut(inv.issuedOn)
                return (
                  <AttentionRow
                    key={inv.id}
                    color={clientColor(inv.client.slug)}
                    href={peekHref("/", "invoice", inv.number)}
                    title={`Invoice ${inv.number} · ${inv.client.name}`}
                    sub={`sent ${formatDay(inv.issuedOn)} · ${age} ${age === 1 ? "day" : "days"} out`}
                    amount={formatMoney(inv.amountCents, inv.currency)}
                    pill={age > 30 ? { label: "overdue", tone: "bad" } : { label: "unpaid", tone: "warn" }}
                  />
                )
              })}
              {actionTasks.map((t) => {
                const diff = taskDue(t.dueOn)
                return (
                  <AttentionRow
                    key={t.id}
                    color={t.client ? clientColor(t.client.slug) : "#71807D"}
                    href={peekHref("/", "task", t.id)}
                    title={t.client ? `${t.title} — ${t.client.name}` : t.title}
                    sub={
                      diff == null
                        ? t.notes || undefined
                        : diff < 0
                          ? `was due ${formatDay(t.dueOn!)}`
                          : diff === 0
                            ? "due today"
                            : `due ${formatDay(t.dueOn!)}`
                    }
                    pill={
                      diff != null && diff < 0
                        ? { label: "overdue", tone: "bad" }
                        : diff === 0
                          ? { label: "due today", tone: "warn" }
                          : { label: "task open", tone: "warn" }
                    }
                  />
                )
              })}
              {pendingDeliverables.map((d) => (
                <AttentionRow
                  key={d.id}
                  color={clientColor(d.project.client.slug)}
                  href={peekHref("/", "deliverable", d.id)}
                  title={d.title}
                  sub={d.project.name}
                  pill={{ label: "on deck", tone: "ok" }}
                />
              ))}
              {waiting.map((p) => (
                <AttentionRow
                  key={p.id}
                  color={clientColor(p.client.slug)}
                  href={peekHref("/", "project", p.slug)}
                  title={`${p.name} — waiting on content`}
                  sub={p.notes || "kickoff blocked on client media"}
                  pill={{ label: "blocked", tone: "warn" }}
                />
              ))}
              {unpaid.length + actionTasks.length + pendingDeliverables.length + waiting.length === 0 ? (
                <li className="px-5 py-8 text-sm text-tk-slate/70">All clear.</li>
              ) : null}
            </ul>
          </section>
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

/* Filled-wedge progress pie: billed share of the monthly goal. Rendered
   server-side; the numbers beside it carry the values, so it's decorative. */
function GoalPie({ fraction }: { fraction: number }) {
  const f = Math.max(0, Math.min(1, fraction))
  const r = 32
  const a = f * 2 * Math.PI
  const x = 32 + r * Math.sin(a)
  const y = 32 - r * Math.cos(a)
  return (
    <svg viewBox="0 0 64 64" className="size-24 shrink-0 xl:size-32" aria-hidden>
      <circle cx={32} cy={32} r={r} fill="#F1EADC" />
      {f >= 1 ? (
        <circle cx={32} cy={32} r={r} fill="#006965" />
      ) : f > 0 ? (
        <path
          d={`M 32 32 L 32 0 A ${r} ${r} 0 ${f > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`}
          fill="#006965"
          stroke="#fff"
          strokeWidth={2}
        />
      ) : null}
    </svg>
  )
}

function AttentionRow({
  color,
  href,
  title,
  sub,
  amount,
  pill,
}: {
  color: string
  href: string
  title: string
  sub?: string
  amount?: string
  pill: { label: string; tone: "bad" | "warn" | "ok" }
}) {
  const tones = {
    bad: "bg-red-700/10 text-red-700",
    warn: "bg-amber-700/10 text-amber-800",
    ok: "bg-tk-teal/10 text-tk-teal",
  }
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        className="flex items-center gap-3 px-5 py-3 hover:bg-tk-linen/60"
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-tk-onyx">{title}</span>
          {sub ? <span className="block truncate text-xs text-tk-slate/60">{sub}</span> : null}
        </span>
        {amount ? <span className="text-sm font-semibold tabular-nums text-tk-onyx">{amount}</span> : null}
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tones[pill.tone]}`}>
          {pill.label}
        </span>
      </Link>
    </li>
  )
}
