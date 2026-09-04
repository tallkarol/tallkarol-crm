import { redirect } from "next/navigation"
import { Forecast } from "@/components/dashboard/Forecast"
import { HomeHeader, type StatusPill } from "@/components/dashboard/HomeHeader"
import { LeftOffBoard } from "@/components/dashboard/LeftOffBoard"
import { MonthBilled } from "@/components/dashboard/MonthBilled"
import {
  NeedsAttention,
  type AttentionGroup,
  type AttentionItem,
  type AttentionMore,
} from "@/components/dashboard/NeedsAttention"
import { Unread } from "@/components/dashboard/Unread"
import { WaitingStrip } from "@/components/dashboard/WaitingStrip"
import { WeekBoard } from "@/components/dashboard/WeekBoard"
import type { PaletteEntry } from "@/components/dashboard/CommandPalette"
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
import { loadLeftOff } from "@/lib/leftoff-data"
import { runningPunches } from "@/lib/punches"
import { ensureRenewalTasks } from "@/lib/renewals"
import { workspaceTimezone } from "@/lib/timezone"
import { loadUnread } from "@/lib/unread-data"
import type { UnreadTone } from "@/lib/unread"
import { loadWaiting } from "@/lib/waiting-data"
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

function plural(n: number, word: string) {
  return `${n} ${n === 1 ? word : `${word}s`}`
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
  const [
    invoices,
    openTasks,
    retainers,
    projects,
    timeEntries,
    meetings,
    unread,
    leftoff,
    waitingQueue,
    clients,
    running,
    timezone,
  ] = await Promise.all([
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
    loadLeftOff().catch(() => null),
    // The strip is the first thing read on this page, so it must never be the
    // reason the page does not render — same treatment as the board above it.
    loadWaiting().catch(() => null),
    db.query.clients.findMany({ orderBy: (c, { asc }) => [asc(c.name)] }),
    sessionUser ? runningPunches(sessionUser.id) : Promise.resolve([]),
    workspaceTimezone(),
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
        color: t.clientSlug ? clientColor(t.clientSlug) : "#71807D",
        title: t.title,
        meta: t.clientName ?? undefined,
        detail: `no movement for ${t.days} days`,
        tone: t.days >= 14 ? ("bad" as const) : ("warn" as const),
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
      })),
    },
  ]

  /* ---- header: status line, left-off counts, palette ---- */
  const dayIn = (iso: string, tz: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso))
  const todayKey = dayIn(now.toISOString(), timezone)
  const meetingsToday = meetings.meetings.filter(
    (m) => dayIn(m.startsAt, m.allDay ? "UTC" : timezone) === todayKey
  ).length

  const toneOf = (tone: UnreadTone): StatusPill["tone"] =>
    tone === "bad" ? "bad" : tone === "warn" ? "warn" : "ok"
  const leftOffCounts = leftoff
    ? {
        blocked: leftoff.counts.blocked,
        working: leftoff.counts.working,
        parked: leftoff.counts.parked,
        done: leftoff.notes.filter((n) => n.state === "gone").length,
      }
    : null
  const pills: StatusPill[] = []
  if (leftOffCounts && leftOffCounts.blocked > 0) {
    pills.push({
      label: `${plural(leftOffCounts.blocked, "chat")} need${leftOffCounts.blocked === 1 ? "s" : ""} a yes`,
      tone: "bad",
      board: true,
    })
  }
  if (unread.ready && unread.tickets.count > 0) {
    pills.push({
      label: `${plural(unread.tickets.count, "ticket")} · ${unread.tickets.state}`,
      tone: toneOf(unread.tickets.tone),
      href: unread.tickets.href,
    })
  }
  if (unread.ready && unread.leads.count > 0) {
    pills.push({
      label: `${plural(unread.leads.count, "lead")} · ${unread.leads.state}`,
      tone: toneOf(unread.leads.tone),
      href: unread.leads.href,
    })
  }
  if (overdueTasks.length > 0) {
    pills.push({
      label: `${plural(overdueTasks.length, "task")} overdue`,
      tone: "warn",
      href: ROUTES.tasks,
    })
  }
  if (meetings.configured) {
    pills.push({
      label: meetingsToday === 0 ? "No meetings today" : `${plural(meetingsToday, "meeting")} today`,
      tone: "neutral",
      icon: "calendar",
      href: ROUTES.calendar,
    })
  }
  if (monthlyGoalCents) {
    const pct = Math.round((billedCents / monthlyGoalCents) * 100)
    const expectedPct = Math.round(((billedCents + currentRemainderCents) / monthlyGoalCents) * 100)
    pills.push({
      label: `${pct}% of month goal · on pace for ${expectedPct}%`,
      tone: expectedPct >= 100 ? "ok" : "warn",
      href: ROUTES.invoices,
    })
  }

  const palette: PaletteEntry[] = [
    { kind: "page", label: "Inbox", href: ROUTES.inbox, sub: unread.ready && unread.total ? `${unread.total} unread` : undefined },
    { kind: "page", label: "Tasks", href: ROUTES.tasks, sub: `${actionTasks.length} open` },
    { kind: "page", label: "Calendar", href: ROUTES.calendar },
    { kind: "page", label: "Invoices", href: ROUTES.invoices, sub: unpaid.length ? `${unpaid.length} unpaid` : undefined },
    { kind: "page", label: "Timesheet", href: ROUTES.timesheet },
    { kind: "page", label: "Clients", href: ROUTES.clients },
    { kind: "page", label: "Leads", href: ROUTES.leads },
    { kind: "page", label: "Tickets", href: ROUTES.support },
    { kind: "page", label: "Settings", href: ROUTES.settings },
    ...clients.map((c) => ({
      kind: "client" as const,
      label: c.name,
      href: ROUTES.client(c.slug),
      slug: c.slug,
    })),
    ...projects.map((p) => ({
      kind: "project" as const,
      label: p.name,
      href: ROUTES.project(p.slug),
      sub: p.client.name,
      slug: p.client.slug,
    })),
    ...retainers.map((r) => ({
      kind: "retainer" as const,
      label: r.name,
      href: ROUTES.retainer(r.slug),
      sub: r.client.name,
      slug: r.client.slug,
    })),
  ]

  const rise = (i: number) => ({ "--i": i } as React.CSSProperties)

  return (
    <>
      <HomeHeader
        greeting={greeting}
        pills={pills}
        leftOff={leftOffCounts}
        clients={clients.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
        running={running}
        palette={palette}
      />
      {searchParams.peek ? (
        <PeekRouter peek={searchParams.peek} closeHref="/" />
      ) : null}
      <WaitingStrip payload={waitingQueue} />
      <LeftOffBoard payload={leftoff} />

      <div className="mt-6 grid min-w-0 gap-3.5 xl:grid-cols-[minmax(0,8fr)_minmax(300px,4fr)]">
        <div className="grid min-w-0 content-start gap-3.5">
          <div className="tk-rise min-w-0" style={rise(1)}>
            <WeekBoard
              configured={meetings.configured}
              meetings={meetings.meetings}
              sources={meetings.sources}
            />
          </div>
          <div className="tk-rise min-w-0" style={rise(2)}>
            <NeedsAttention groups={groups} more={more} />
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-3.5">
          <div className="tk-rise min-w-0" style={rise(3)}>
            <Unread summary={unread} />
          </div>
          <div className="tk-rise min-w-0" style={rise(4)}>
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
          <div className="tk-rise min-w-0" style={rise(5)}>
            <Forecast months={forecast.months} />
          </div>
        </div>
      </div>
    </>
  )
}
