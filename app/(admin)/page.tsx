import { redirect } from "next/navigation"
import { SWEEP_MS, oncePer } from "@/lib/once-per"
import { Forecast } from "@/components/dashboard/Forecast"
import { cookies } from "next/headers"
import { HomeHeader } from "@/components/dashboard/HomeHeader"
import { GlobalFocus } from "@/components/focus/GlobalFocus"
import { FOCUS_MODE_COOKIE, isFocusMode } from "@/lib/focus"
import { globalFocus } from "@/lib/focus-data"
import { loadPulse } from "@/lib/pulse-data"
import { MonthBilled } from "@/components/dashboard/MonthBilled"
import {
  NeedsAttention,
  type AttentionGroup,
  type AttentionItem,
  type AttentionMore,
} from "@/components/dashboard/NeedsAttention"
import { RetainerClockRow } from "@/components/dashboard/RetainerClockRow"
import { WeekBoard } from "@/components/dashboard/WeekBoard"
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
import { runningPunches } from "@/lib/punches"
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

/** "Tomorrow", "Sat 5", "3 days" — the right-hand label on a task row. */
function whenLabel(diff: number, dueOn: string) {
  if (diff < 0) return `${-diff} ${diff === -1 ? "day" : "days"}`
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  const [y, m, d] = dueOn.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${d}`
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { status?: string; peek?: string }
}) {
  if (searchParams.status) {
    redirect(`${ROUTES.inquiries}?status=${searchParams.status}`)
  }

  // The lazy sweeps go first because the reads below must see what they
  // write, but at most once per five minutes (the cron tick covers the gaps)
  // and side by side. One helper, everywhere tasks are read — so the
  // dashboard and the hub cannot disagree about whether a repeat is open.
  await Promise.all([
    oncePer("renewals", SWEEP_MS, () => ensureRenewalTasks()),
    oncePer("reopen", SWEEP_MS, () => reopenDueRecurring()),
  ])
  // Request-cached: the layout already read it.
  const sessionUser = await getSessionUser()
  const now = new Date()
  const [
    stalled,
    goals,
    greeting,
    globalCards,
    invoices,
    openTasks,
    retainers,
    projects,
    timeEntries,
    meetings,
    unread,
    clients,
    running,
  ] = await Promise.all([
    waitingTooLong(),
    getGoals(),
    greetingFor(sessionUser),
    globalFocus(now),
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
    db.query.clients.findMany({ orderBy: (c, { asc }) => [asc(c.name)] }),
    sessionUser ? runningPunches(sessionUser.id) : Promise.resolve([]),
  ])

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
  const monthExpectedLines: { label: string; sub: string | null; cents: number; slug?: string | null }[] = []
  for (const r of retainers) {
    const rate = rateByRetainer.get(r.id)
    if (!rate) continue
    if (invoices.some((i) => i.retainerId === r.id && i.issuedOn.slice(0, 7) === thisMonth)) continue
    if (retainerCoversMonth(r, thisMonth)) {
      monthExpectedLines.push({
        label: r.name,
        sub: `${r.hoursPerMonth} hr × ${formatMoney(rate)}`,
        cents: rate * r.hoursPerMonth,
        slug: r.client.slug,
      })
    } else {
      const logged = loggedThisMonth.get(r.id) ?? 0
      if (logged > 0) {
        monthExpectedLines.push({
          label: r.name,
          sub: `${logged.toLocaleString("en-US", { maximumFractionDigits: 1 })} hr logged × ${formatMoney(rate)}`,
          cents: Math.round(logged * rate),
          slug: r.client.slug,
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
          slug: p.client.slug,
        })
      }
    }
  }
  const currentRemainderCents = monthExpectedLines.reduce((s, l) => s + l.cents, 0)
  const monthlyGoalCents = goals.annualCents
    ? Math.round(goals.annualCents / 12)
    : goals.monthlyCents

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

  const taskItem = (t: (typeof actionTasks)[number]): AttentionItem => {
    const diff = taskDue(t.dueOn)
    return {
      id: t.id,
      href: peekHref("/", "task", t.id),
      color: t.client ? clientColor(t.client.slug) : "rgb(var(--ink-3-rgb))",
      title: t.title,
      meta: t.client?.name,
      paper: t.source === "punchlist" ? ("punch" as const) : ("task" as const),
      focus: { kind: "task" as const, clientId: t.client?.id ?? null, clientSlug: t.client?.slug ?? null, clientName: t.client?.name ?? null },
      detail:
        diff == null
          ? t.notes || undefined
          : diff < 0
            ? `overdue since ${formatDay(t.dueOn!)}`
            : diff === 0
              ? "due today"
              : undefined,
      tone: diff != null && diff < 0 ? "bad" : diff === 0 ? "warn" : "neutral",
      when: diff != null && t.dueOn ? whenLabel(diff, t.dueOn) : undefined,
      whenTone: diff != null && diff < 0 ? "bad" : diff != null && diff <= 1 ? "warn" : "neutral",
    }
  }
  const overdueTasks = actionTasks.filter((t) => {
    const diff = taskDue(t.dueOn)
    return diff != null && diff < 0
  })
  const weekTasks = actionTasks.filter((t) => {
    const diff = taskDue(t.dueOn)
    return diff != null && diff >= 0 && diff <= 7
  })
  const laterTasks = actionTasks.filter((t) => {
    const diff = taskDue(t.dueOn)
    return diff == null || diff > 7
  })
  const laterByClient = new Map<string, number>()
  for (const t of laterTasks) {
    const name = t.client?.name ?? "House"
    laterByClient.set(name, (laterByClient.get(name) ?? 0) + 1)
  }
  const more: AttentionMore | null = laterTasks.length
    ? {
        count: laterTasks.length,
        label: laterTasks.length === 1 ? "task scheduled later or undated" : "tasks scheduled later or undated",
        byClient: Array.from(laterByClient.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([name, count]) => ({ name, count })),
        href: ROUTES.tasks,
      }
    : null

  const groups: AttentionGroup[] = [
    {
      id: "overdue",
      label: "Overdue",
      tone: "bad",
      reorderable: true,
      completable: true,
      items: overdueTasks.map(taskItem),
    },
    {
      id: "unpaid",
      label: "Unpaid",
      tone: "warn",
      total: unpaid.length
        ? formatMoney(unpaid.reduce((sum, inv) => sum + inv.amountCents, 0))
        : undefined,
      items: unpaid.map((inv) => {
        const delta = daysFromToday(inv.issuedOn)
        const overdue = delta < -30
        return {
          id: inv.id,
          href: peekHref("/", "invoice", inv.number),
          color: clientColor(inv.client.slug),
          title: inv.number,
          meta: inv.client.name,
          detail:
            delta > 0
              ? `sends ${formatDay(inv.issuedOn)}`
              : delta === 0
                ? "issued today"
                : overdue
                  ? `${-delta} days overdue`
                  : `sent ${-delta} ${delta === -1 ? "day" : "days"} ago`,
          amount: formatMoney(inv.amountCents, inv.currency),
          tone: overdue ? "bad" : "warn",
          paper: "money" as const,
        }
      }),
    },
    {
      id: "week",
      label: "This week",
      reorderable: true,
      completable: true,
      items: weekTasks.map(taskItem),
    },
    {
      id: "waiting",
      label: "Waiting on client",
      tone: "warn",
      items: stalled.map((t) => ({
        id: t.id,
        href: peekHref("/", "task", t.id),
        color: t.clientSlug ? clientColor(t.clientSlug) : "rgb(var(--ink-3-rgb))",
        title: t.title,
        meta: t.clientName ?? undefined,
        detail: `no movement for ${t.days} days`,
        tone: t.days >= 14 ? ("bad" as const) : ("warn" as const),
        paper: "task" as const,
        focus: { kind: "task" as const, clientId: t.clientId, clientSlug: t.clientSlug, clientName: t.clientName },
      })),
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
        paper: "deliverable" as const,
        focus: { kind: "deliverable" as const, clientId: d.project.client.id, clientSlug: d.project.client.slug, clientName: d.project.client.name },
      })),
    },
    {
      id: "blocked",
      label: "Blocked",
      tone: "warn",
      items: waiting.map((p) => ({
        id: p.id,
        href: peekHref("/", "project", p.slug),
        color: clientColor(p.client.slug),
        title: p.name,
        meta: p.client.name,
        detail: p.notes || "Waiting on client content",
        tone: "warn" as const,
        paper: "note" as const,
      })),
    },
  ]

  /* ---- the pulse: the four rows on top of Needs attention ---- */
  const todayTasks = actionTasks.filter((t) => taskDue(t.dueOn) === 0)
  const weekSorted = [...weekTasks].sort((a, b) => (a.dueOn ?? "").localeCompare(b.dueOn ?? ""))
  const oldestOverdueDays = overdueTasks.reduce<number | null>((max, t) => {
    const diff = taskDue(t.dueOn)
    return diff == null ? max : Math.max(max ?? 0, -diff)
  }, null)
  const pulse = await loadPulse(now, {
    overdue: overdueTasks.length,
    oldestOverdueDays,
    dueToday: todayTasks.length,
    dueTodayFirst: todayTasks[0]?.title ?? null,
    week: weekTasks.length,
    nextDue: weekSorted[0]?.dueOn ? whenLabel(taskDue(weekSorted[0].dueOn) ?? 0, weekSorted[0].dueOn) : null,
    waiting: stalled.length,
    waitingFirst: stalled[0] ? `${stalled[0].title} · ${stalled[0].days}d` : null,
  })

  const rise = (i: number) => ({ "--i": i } as React.CSSProperties)

  const focusModeRaw = cookies().get(FOCUS_MODE_COOKIE)?.value
  const focusMode = isFocusMode(focusModeRaw) ? focusModeRaw : "three"

  return (
    <>
      <HomeHeader
        greeting={greeting}
        clients={clients.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        running={running}
      />
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref="/" />
      ) : null}
      {/* The tray and the cards under it share one drag context: a task or a
          deliverable in Needs attention drags straight up onto a slot. */}
      <GlobalFocus cards={globalCards} mode={focusMode}>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] min-w-0 gap-3.5 xl:grid-cols-[minmax(0,8fr)_minmax(300px,4fr)]">
          <div className="grid min-w-0 content-start gap-3.5">
            <div className="tk-rise min-w-0" style={rise(1)}>
              <NeedsAttention groups={groups} more={more} unread={unread.ready ? unread : null} pulse={pulse} />
            </div>
            <div className="tk-rise min-w-0" style={rise(2)}>
              <WeekBoard
                configured={meetings.configured}
                meetings={meetings.meetings}
                sources={meetings.sources}
              />
            </div>
          </div>

          <div className="grid min-w-0 content-start gap-3.5">
            {/* One tap per active retainer, stacked above the month — see RetainerClockRow. */}
            <div className="tk-rise min-w-0" style={rise(2)}>
              <RetainerClockRow
                stacked
                retainers={retainers
                  .filter((r) => r.status === "active")
                  .map((r) => ({
                    id: r.id,
                    name: r.name,
                    clientId: r.client.id,
                    clientName: r.client.name,
                    clientSlug: r.client.slug,
                    hoursPerMonth: r.hoursPerMonth,
                  }))
                  .sort((a, b) => a.clientName.localeCompare(b.clientName))}
              />
            </div>
            <div className="tk-rise min-w-0" style={rise(3)}>
              <MonthBilled
                monthLabel={now.toLocaleDateString("en-US", { month: "long" })}
                billedCents={billedCents}
                monthlyGoalCents={monthlyGoalCents}
                invoices={billedThisMonth.map((i) => ({
                  number: i.number,
                  clientName: i.client.name,
                  clientSlug: i.client.slug,
                  amountCents: i.amountCents,
                  status: i.status,
                }))}
                expected={monthExpectedLines}
                expectedTotalCents={billedCents + currentRemainderCents}
              />
            </div>
            <div className="tk-rise min-w-0" style={rise(4)}>
              <Forecast months={forecast.months} />
            </div>
          </div>
        </div>
      </GlobalFocus>
    </>
  )
}
