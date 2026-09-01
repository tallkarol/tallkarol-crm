import { and, asc, eq, isNull, lte, or } from "drizzle-orm"
import { db } from "@/db"
import { clients, supportTickets, tasks, timeEntries } from "@/db/schema"
import type { Cadence } from "@/db/schema"
import { loadDelivery } from "@/lib/delivery"
import { ROUTES } from "@/lib/nav"
import {
  PRIORITY_RANK,
  ageLabel,
  ticketNumber,
  ticketOpenedAt,
  ticketPriority,
  ticketSlug,
  ticketState,
  type TicketPriority,
  type TicketState,
} from "@/lib/support"
import { isoDay } from "@/lib/task-view"

/**
 * Everything the macOS widgets read, in one place.
 *
 * Deliberately not built on `allTasks()` / `listTasks()` in `lib/tasks.ts`:
 * those load every task ever written with six joins and filter in JavaScript,
 * which is fine for a hub page rendered on demand and wrong for an endpoint
 * three widgets poll every fifteen minutes.
 *
 * Nor on `needsMe` from `lib/task-view.ts`: that composite is `dueNow OR doing
 * OR priority 1 OR repeating`, which a 155pt tile cannot survive — every
 * repeating task satisfies it every day of its period, so the same rows sit
 * there forever.
 */

/* ------------------------------------------------------------------ types */

export type BadgeTone = "hot" | "due" | "muted"

export type WidgetTask = {
  id: string
  title: string
  /** `client · project|product` — what tells two same-titled tasks apart. */
  context: string
  priority: number
  /** What it actually ranked as; differs when a repeat is closing. */
  effectivePriority: number
  dueOn: string | null
  cadence: Cadence
  badge: string | null
  badgeTone: BadgeTone | null
  /** How many further repeating tasks this row stands in for. */
  moreRepeating: number
  href: string
}

export type WidgetFlag = {
  key: string
  kind: string
  severity: "hot" | "warn"
  short: string
  detail: string
  count: number
  clients: string[]
  href: string | null
}

export type WidgetTicket = {
  id: string
  number: string
  title: string
  client: string | null
  state: TicketState
  priority: TicketPriority
  ageLabel: string
  dueOn: string | null
  overdueDays: number | null
  badge: string | null
  badgeTone: BadgeTone | null
  href: string
}

/* -------------------------------------------------------------- recurrence */

/** How close to the end of its period a repeat has to be to earn a slot. */
const CLOSING_WINDOW: Record<Exclude<Cadence, "none">, number> = {
  weekly: 2,
  monthly: 7,
  quarterly: 14,
}

/**
 * Whole days from today to the last day of the cadence's current period.
 * Local-time arithmetic, matching `daysUntil` in `lib/attention.ts`.
 */
export function periodEndsInDays(cadence: Cadence, now: Date): number | null {
  if (cadence === "none") return null
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()

  let end: Date
  if (cadence === "weekly") {
    const mondayIndex = (now.getDay() + 6) % 7 // ISO week, Monday = 0
    end = new Date(y, m, d + (6 - mondayIndex))
  } else if (cadence === "monthly") {
    end = new Date(y, m + 1, 0)
  } else {
    end = new Date(y, Math.floor(m / 3) * 3 + 3, 0)
  }

  const today = new Date(y, m, d)
  return Math.round((end.getTime() - today.getTime()) / 86_400_000)
}

function isClosing(cadence: Cadence, now: Date): boolean {
  if (cadence === "none") return false
  const left = periodEndsInDays(cadence, now)
  return left != null && left <= CLOSING_WINDOW[cadence]
}

/* ------------------------------------------------------------------ badges */

const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")

function dayBadge(iso: string, today: string): { badge: string; tone: BadgeTone } {
  const [, m, d] = iso.split("-").map(Number)
  if (iso < today) {
    const late = Math.round(
      (Date.parse(`${today}T00:00:00`) - Date.parse(`${iso}T00:00:00`)) / 86_400_000
    )
    return { badge: `${late}d late`, tone: "hot" }
  }
  if (iso === today) return { badge: "Today", tone: "due" }
  return { badge: `${d} ${MONTHS[m - 1]}`, tone: "due" }
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/* ----------------------------------------------------------- round robin */

/**
 * One row per client before any client repeats.
 *
 * Without this, `priority → client → created` clusters: seven of ten priority-1
 * tasks belong to one client, so four of the large widget's five rows read as
 * one account being on fire when it only means that client sorts early. Input
 * must already be in rank order — the queues inherit it.
 */
function roundRobinByClient<T extends { groupKey: string }>(rows: T[]): T[] {
  const queues = new Map<string, T[]>()
  for (const row of rows) {
    const queue = queues.get(row.groupKey)
    if (queue) queue.push(row)
    else queues.set(row.groupKey, [row])
  }

  const lanes = Array.from(queues.values())
  const out: T[] = []
  while (out.length < rows.length) {
    for (const lane of lanes) {
      const next = lane.shift()
      if (next) out.push(next)
    }
  }
  return out
}

/* ------------------------------------------------------------------ tasks */

type TaskRow = {
  id: string
  title: string
  priority: number
  cadence: Cadence
  dueOn: string | null
  createdAt: Date
  client: { name: string; slug: string } | null
  project: { name: string } | null
  product: { name: string } | null
}

async function openTaskRows(today: string, clientId?: string) {
  const scope = clientId ? eq(tasks.clientId, clientId) : undefined
  return db.query.tasks.findMany({
    where: and(
      eq(tasks.status, "open"),
      or(isNull(tasks.snoozedUntil), lte(tasks.snoozedUntil, today)),
      scope
    ),
    columns: {
      id: true,
      title: true,
      priority: true,
      cadence: true,
      dueOn: true,
      createdAt: true,
    },
    with: {
      client: { columns: { name: true, slug: true } },
      project: { columns: { name: true } },
      product: { columns: { name: true } },
    },
    orderBy: [asc(tasks.createdAt)],
  }) as unknown as Promise<TaskRow[]>
}

function shapeTasks(rows: TaskRow[], now: Date): WidgetTask[] {
  const today = isoDay(now)

  // 1. Eligibility — a repeat only earns a slot as its period closes.
  const eligible = rows.filter(
    (row) => row.cadence === "none" || isClosing(row.cadence, now)
  )

  // 2. Effective priority — a closing repeat ranks as 1, for ordering only.
  //    Nothing is written back; the stored priority is reported untouched.
  const ranked = eligible.map((row) => ({
    row,
    effectivePriority: isClosing(row.cadence, now) ? 1 : row.priority,
    groupKey: row.client?.name ?? row.product?.name ?? "￿",
  }))

  ranked.sort(
    (a, b) =>
      a.effectivePriority - b.effectivePriority ||
      a.groupKey.localeCompare(b.groupKey) ||
      a.row.createdAt.getTime() - b.row.createdAt.getTime()
  )

  // 3. Round-robin inside each priority band, so the top reads as breadth.
  const bands = new Map<number, typeof ranked>()
  for (const item of ranked) {
    const band = bands.get(item.effectivePriority)
    if (band) band.push(item)
    else bands.set(item.effectivePriority, [item])
  }
  const ordered = Array.from(bands.keys())
    .sort((a, b) => a - b)
    .flatMap((band) => roundRobinByClient(bands.get(band)!))

  // 4. Dedupe — repeats collapse into the highest-ranked one. One-off tasks
  //    never collapse; two real tasks can share a title and the context line
  //    is what tells them apart.
  const repeating = ordered.filter((item) => item.row.cadence !== "none")
  const keptRepeat = repeating[0]?.row.id ?? null
  const moreRepeating = Math.max(repeating.length - 1, 0)

  const visible = ordered.filter(
    (item) => item.row.cadence === "none" || item.row.id === keptRepeat
  )

  return visible.map(({ row, effectivePriority }) => {
    const target = row.project?.name ?? row.product?.name ?? null
    const parts = [row.client?.name, target].filter(Boolean) as string[]
    let context = parts.join(" · ") || "No client"
    if (row.id === keptRepeat && moreRepeating > 0) {
      context = `${context} · +${moreRepeating} more repeating`
    }

    let badge: string | null = null
    let badgeTone: BadgeTone | null = null
    if (row.dueOn) {
      const marked = dayBadge(row.dueOn, today)
      badge = marked.badge
      badgeTone = marked.tone
    } else if (row.cadence !== "none") {
      badge = titleCase(row.cadence)
      badgeTone = "muted"
    }

    return {
      id: row.id,
      title: row.title,
      context,
      priority: row.priority,
      effectivePriority,
      dueOn: row.dueOn,
      cadence: row.cadence,
      badge,
      badgeTone,
      moreRepeating: row.id === keptRepeat ? moreRepeating : 0,
      href: `${ROUTES.tasks}/${row.id}`,
    }
  })
}

export async function widgetTasks(now = new Date(), clientId?: string) {
  const rows = await openTaskRows(isoDay(now), clientId)
  const tasks = shapeTasks(rows, now)

  // Open tasks the widget deliberately withheld: repeats whose period is not
  // closing yet. Reported so a view can say "+1 not due yet" instead of
  // claiming a count it then shows nothing for.
  const deferred = rows.filter(
    (row) => row.cadence !== "none" && !isClosing(row.cadence, now)
  ).length

  return { open: rows.length, deferred, tasks }
}

/* -------------------------------------------------------------- attention */

/**
 * Collapsed labels for a repeated flag kind. `loadDelivery` can return fourteen
 * separate "Tracker overdue" rows across two clients; drawn raw the widget's
 * attention block is one sentence wallpapered down the tile.
 *
 * Only consulted when a kind appears more than once — a lone flag always keeps
 * its own wording, and an unmapped kind falls back to `N × <its short>`, so a
 * new rule in `lib/attention.ts` degrades instead of breaking.
 */
const COLLAPSED: Record<string, (n: number, qualifier: string | null) => string> = {
  "deliverable-overdue": (n, q) => `${n} ${q ?? "deliverables"} overdue`,
  "deliverable-due": (n, q) => `${n} ${q ?? "deliverables"} due soon`,
  "deliverable-uninvoiced": (n) => `${n} deliverables done, not invoiced`,
  "workstream-stale": (n) => `${n} workstreams parked`,
  "waiting-on-content": (n) => `${n} engagements waiting on content`,
  "invoice-draft": (n) => `${n} draft invoices to send`,
  "tickets-unanswered": (n) => `${n} clients with unanswered tickets`,
  "retainer-quiet": (n) => `${n} retainers with nothing logged`,
  "retainer-over-cap": (n) => `${n} retainers over their ceiling`,
  "retainer-near-cap": (n) => `${n} retainers near their ceiling`,
  "retainer-renewal": (n) => `${n} renewals inside the window`,
}

/**
 * `loadDelivery()` issues six unbounded reads — every project, retainer,
 * invoice, time entry, ticket and task. Correct, and cheap at today's volume,
 * but three widget kinds wake on the same fifteen-minute cadence and arrive
 * together. Railway runs one web process, so a module-level memo is enough.
 */
const DELIVERY_TTL_MS = 60_000
let deliveryMemo: { at: number; data: Awaited<ReturnType<typeof loadDelivery>> } | null =
  null

async function cachedDelivery(now: Date) {
  if (deliveryMemo && now.getTime() - deliveryMemo.at < DELIVERY_TTL_MS) {
    return deliveryMemo.data
  }
  const data = await loadDelivery(now)
  deliveryMemo = { at: now.getTime(), data }
  return data
}

type DeliveryRowish = {
  kind: string
  slug: string
  clientName: string | null
  clientSlug: string | null
  flags: { key: string; severity: "hot" | "warn"; short: string; detail: string }[]
}

function collapseFlags(rows: DeliveryRowish[]): WidgetFlag[] {
  type Bucket = {
    key: string
    kind: string
    qualifier: string | null
    severity: "hot" | "warn"
    short: string
    detail: string
    clients: Set<string>
    href: string | null
    count: number
  }

  const buckets = new Map<string, Bucket>()

  for (const row of rows) {
    for (const flag of row.flags) {
      const [kind, ...rest] = flag.key.split(":")
      const qualifier = rest.length ? rest.join(":") : null
      const href = row.clientSlug ? `${ROUTES.clients}/${row.clientSlug}` : null

      const existing = buckets.get(flag.key)
      if (existing) {
        existing.count += 1
        if (row.clientName) existing.clients.add(row.clientName)
        // Hot outranks warn, and the first member's wording is kept.
        if (flag.severity === "hot") existing.severity = "hot"
        continue
      }

      buckets.set(flag.key, {
        key: flag.key,
        kind,
        qualifier,
        severity: flag.severity,
        short: flag.short,
        detail: flag.detail,
        clients: new Set(row.clientName ? [row.clientName] : []),
        href,
        count: 1,
      })
    }
  }

  return Array.from(buckets.values())
    .map((bucket) => {
      const clients = Array.from(bucket.clients).sort()
      const short =
        bucket.count === 1
          ? bucket.short
          : (COLLAPSED[bucket.kind]?.(bucket.count, bucket.qualifier) ??
            `${bucket.count} × ${bucket.short}`)

      return {
        key: bucket.key,
        kind: bucket.kind,
        severity: bucket.severity,
        short,
        detail: bucket.detail,
        count: bucket.count,
        clients,
        // A collapsed group spans clients, so it has no single destination.
        href: bucket.count === 1 ? bucket.href : null,
      }
    })
    .sort(
      (a, b) =>
        Number(b.severity === "hot") - Number(a.severity === "hot") ||
        b.count - a.count ||
        a.short.localeCompare(b.short)
    )
}

export async function widgetAttention(now = new Date(), clientSlug?: string) {
  const data = await cachedDelivery(now)
  const rows = (data.rows as unknown as DeliveryRowish[]).filter((row) =>
    clientSlug ? row.clientSlug === clientSlug : true
  )
  const flags = collapseFlags(rows)
  return {
    flags,
    // `totals.needsYou` is the Delivery ledger's own count. Recomputing it here
    // would let the widget and the page it links to disagree about the same
    // number, which is the drift `lib/attention.ts` exists to prevent.
    needsYou: clientSlug
      ? rows.filter((row) => row.flags.length > 0).length
      : (data as unknown as { totals: { needsYou: number } }).totals.needsYou,
  }
}

/* ---------------------------------------------------------------- tickets */

type TicketRowish = {
  id: string
  number: string
  title: string
  status: string
  priority: string
  state: string
  completed: boolean
  dueOn: string | null
  submittedOn: string | null
  firstResponseAt: Date | null
  createdAt: Date
  client: { name: string } | null
}

/**
 * Badged from `due_on`, never from `isLate()`.
 *
 * `isLate()` falls back to "open more than a day with no first response", and
 * `first_response_at` is null on almost every row because the Smartsheet sync
 * does not populate it — so that badge would read every-open-ticket-is-late
 * forever, which is a light nobody reads twice. Due dates are populated and
 * real, so they are what the widget shows.
 */
function shapeTickets(rows: TicketRowish[], now: Date): WidgetTicket[] {
  const today = isoDay(now)

  return rows
    .map((row) => {
      const state = ticketState(row)
      const priority = ticketPriority(row.priority)
      const overdueDays =
        row.dueOn && row.dueOn < today
          ? Math.round(
              (Date.parse(`${today}T00:00:00`) - Date.parse(`${row.dueOn}T00:00:00`)) /
                86_400_000
            )
          : null

      let badge: string | null = null
      let badgeTone: BadgeTone | null = null
      if (overdueDays != null) {
        badge = `${overdueDays}d over`
        badgeTone = "hot"
      } else if (row.dueOn) {
        const marked = dayBadge(row.dueOn, today)
        badge = marked.badge
        badgeTone = marked.tone
      } else if (state === "open") {
        badge = "New"
        badgeTone = "due"
      }

      return {
        id: row.id,
        number: ticketNumber(row),
        title: row.title || "(untitled)",
        client: row.client?.name ?? null,
        state,
        priority,
        ageLabel: ageLabel(ticketOpenedAt(row), now),
        dueOn: row.dueOn,
        overdueDays,
        badge,
        badgeTone,
        href: `${ROUTES.support}/${ticketSlug(row)}`,
      }
    })
    .sort(
      (a, b) =>
        (b.overdueDays ?? -1) - (a.overdueDays ?? -1) ||
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
    )
}

export async function widgetTickets(now = new Date(), clientId?: string) {
  const rows = (await db.query.supportTickets.findMany({
    columns: {
      id: true,
      number: true,
      title: true,
      status: true,
      priority: true,
      state: true,
      completed: true,
      dueOn: true,
      submittedOn: true,
      firstResponseAt: true,
      createdAt: true,
      clientId: true,
    },
    with: { client: { columns: { name: true } } },
    where: clientId ? eq(supportTickets.clientId, clientId) : undefined,
  })) as unknown as TicketRowish[]

  const shaped = shapeTickets(rows, now)

  const open = shaped.filter((t) => t.state !== "closed")
  const closed = shaped.filter((t) => t.state === "closed")

  return {
    tickets: open,
    recentlyClosed: closed.slice(0, 4),
    counts: {
      open: open.length,
      overdue: open.filter((t) => t.overdueDays != null).length,
      closed: closed.length,
      byPriority: {
        urgent: open.filter((t) => t.priority === "urgent").length,
        high: open.filter((t) => t.priority === "high").length,
        normal: open.filter((t) => t.priority === "normal").length,
        low: open.filter((t) => t.priority === "low").length,
      },
    },
  }
}

/* ---------------------------------------------------------------- clients */

export async function widgetClients() {
  const rows = await db.query.clients.findMany({
    columns: { id: true, name: true, slug: true },
    orderBy: [asc(clients.name)],
  })
  return rows
}

export async function widgetClient(slug: string, now = new Date()) {
  const client = await db.query.clients.findFirst({
    where: eq(clients.slug, slug),
    columns: { id: true, name: true, slug: true },
    with: {
      retainers: { columns: { hoursPerMonth: true, status: true } },
      projects: { columns: { status: true } },
    },
  })
  if (!client) return null

  const [taskData, ticketData, attention, vitals] = await Promise.all([
    widgetTasks(now, client.id),
    widgetTickets(now, client.id),
    widgetAttention(now, slug),
    clientVitals(client.id, now),
  ])

  const cap = (client as unknown as { retainers: { hoursPerMonth: number; status: string }[] })
    .retainers.filter((r) => r.status === "active")
    .reduce((sum, r) => sum + r.hoursPerMonth, 0)

  const projectsInFlight = (
    client as unknown as { projects: { status: string }[] }
  ).projects.filter((p) => p.status === "in_progress").length

  return {
    client: { id: client.id, name: client.name, slug: client.slug },
    tasks: taskData.tasks,
    openTasks: taskData.open,
    deferredTasks: taskData.deferred,
    tickets: ticketData.tickets,
    ticketCounts: ticketData.counts,
    flags: attention.flags,
    vitals: { ...vitals, cap, projectsInFlight },
  }
}

async function clientVitals(clientId: string, now: Date) {
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  // Indexed by `time_entries_client_day_idx` on (client_id, occurred_on).
  const entries = await db.query.timeEntries.findMany({
    where: eq(timeEntries.clientId, clientId),
    columns: { hours: true, occurredOn: true },
  })

  const hoursThisMonth = entries
    .filter((e) => e.occurredOn.startsWith(month))
    .reduce((sum, e) => sum + Number(e.hours), 0)

  const lastTimeLogged = entries.map((e) => e.occurredOn).sort().pop() ?? null

  return { hoursThisMonth: Math.round(hoursThisMonth * 10) / 10, lastTimeLogged }
}
