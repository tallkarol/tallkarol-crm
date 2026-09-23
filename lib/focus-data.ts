import { and, asc, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { deliverables, focusItems, inboxMail, projects, supportTickets, taskItems, tasks } from "@/db/schema"
import { ATTENTION_RULES } from "@/lib/attention"
import { dueLabelFor, isFocusKind, paperFor, type FocusCard, type FocusKind } from "@/lib/focus"
import { ROUTES } from "@/lib/nav"
import { isOpenState, ticketPriority, ticketState } from "@/lib/support"

/**
 * The db half of Focus. `lib/focus.ts` is pure and the tray imports it in the
 * browser; this file is the only one that reads rows.
 *
 * A row whose record is gone, or already finished, is pruned on read, so the
 * set heals itself: a task completed from /tasks leaves the Board on the next
 * load without anyone writing to focus_items.
 */

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function daysSince(at: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86_400_000))
}

export type FocusSet = {
  cards: FocusCard[]
  /** Ids of open tasks that are in focus — the Board hides these from its columns. */
  focusedTaskIds: Set<string>
}

export async function focusFor(
  client: { id: string; slug: string; name: string },
  now = new Date()
): Promise<FocusSet> {
  const today = isoDay(now)
  const rows = await db.query.focusItems.findMany({
    where: eq(focusItems.clientId, client.id),
    orderBy: [asc(focusItems.position)],
  })
  if (rows.length === 0) return { cards: [], focusedTaskIds: new Set() }

  const idsOf = (kind: FocusKind) => rows.filter((r) => r.refKind === kind).map((r) => r.refId)
  const taskIds = idsOf("task")
  const ticketIds = idsOf("ticket")
  const deliverableIds = idsOf("deliverable")
  const mailIds = idsOf("mail")

  const [taskRows, itemRows, ticketRows, deliverableRows, mailRows] = await Promise.all([
    taskIds.length
      ? db.query.tasks.findMany({
          where: inArray(tasks.id, taskIds),
          with: { project: { columns: { name: true, slug: true } }, deliverable: { columns: { label: true } } },
        })
      : [],
    taskIds.length
      ? db.query.taskItems.findMany({ where: inArray(taskItems.taskId, taskIds), orderBy: [asc(taskItems.sort)] })
      : [],
    ticketIds.length ? db.query.supportTickets.findMany({ where: inArray(supportTickets.id, ticketIds) }) : [],
    deliverableIds.length
      ? db
          .select({
            id: deliverables.id,
            label: deliverables.label,
            title: deliverables.title,
            status: deliverables.status,
            dueOn: deliverables.dueOn,
            projectName: projects.name,
            projectSlug: projects.slug,
          })
          .from(deliverables)
          .innerJoin(projects, eq(projects.id, deliverables.projectId))
          .where(inArray(deliverables.id, deliverableIds))
      : [],
    mailIds.length ? db.query.inboxMail.findMany({ where: inArray(inboxMail.id, mailIds) }) : [],
  ])

  const taskById = new Map(taskRows.map((t) => [t.id, t]))
  const itemsByTask = new Map<string, typeof itemRows>()
  for (const item of itemRows) {
    const list = itemsByTask.get(item.taskId) ?? []
    list.push(item)
    itemsByTask.set(item.taskId, list)
  }
  const ticketById = new Map(ticketRows.map((t) => [t.id, t]))
  const deliverableById = new Map(deliverableRows.map((d) => [d.id, d]))
  const mailById = new Map(mailRows.map((m) => [m.id, m]))

  const cards: FocusCard[] = []
  const stale: string[] = []

  for (const row of rows) {
    if (!isFocusKind(row.refKind)) {
      stale.push(row.id)
      continue
    }
    const base = {
      id: row.id,
      refKind: row.refKind,
      refId: row.refId,
      position: row.position,
      global: row.global,
      clientSlug: client.slug,
      clientName: client.name,
    }

    if (row.refKind === "task") {
      const t = taskById.get(row.refId)
      if (!t || t.status === "done") {
        stale.push(row.id)
        continue
      }
      const items = itemsByTask.get(t.id) ?? []
      cards.push({
        ...base,
        paper: paperFor("task", row.color, t.source),
        title: t.title,
        project: [t.project?.name ?? null, t.deliverable?.label ?? null].filter(Boolean).join(" · ") || null,
        dueOn: t.dueOn,
        dueLabel: dueLabelFor(t.dueOn, today),
        overdue: !!t.dueOn && t.dueOn < today,
        checklist: items.length ? { done: items.filter((i) => i.done).length, total: items.length } : null,
        steps: items.map((i) => ({ id: i.id, title: i.title, done: i.done })),
        notes: t.notes,
        href: ROUTES.task(t.id),
      })
      continue
    }

    if (row.refKind === "ticket") {
      const t = ticketById.get(row.refId)
      if (!t || !isOpenState(ticketState(t))) {
        stale.push(row.id)
        continue
      }
      const opened = t.submittedOn ? new Date(`${t.submittedOn}T00:00:00`) : t.createdAt
      const age = daysSince(opened, now)
      const late = !t.firstResponseAt && age >= ATTENTION_RULES.ticketReplyDays[ticketPriority(t.priority)]
      cards.push({
        ...base,
        paper: paperFor("ticket", row.color),
        title: t.title || "Untitled ticket",
        project: `${t.source === "portal" ? "Portal" : t.source === "monitor" ? "Monitor" : t.source === "smartsheet" ? "Smartsheet" : "Email"} · ${t.number}`,
        dueOn: null,
        dueLabel: t.firstResponseAt ? `${age}d open` : `${age}d, no reply`,
        overdue: late,
        checklist: null,
        steps: [],
        notes: t.description,
        href: `${ROUTES.support}/${t.number}`,
      })
      continue
    }

    if (row.refKind === "deliverable") {
      const d = deliverableById.get(row.refId)
      if (!d || d.status !== "pending") {
        stale.push(row.id)
        continue
      }
      cards.push({
        ...base,
        paper: paperFor("deliverable", row.color),
        title: d.title ? `${d.label} — ${d.title}` : d.label,
        project: d.projectName,
        dueOn: d.dueOn,
        dueLabel: dueLabelFor(d.dueOn, today),
        overdue: !!d.dueOn && d.dueOn < today,
        checklist: null,
        steps: [],
        notes: "",
        href: ROUTES.project(d.projectSlug),
      })
      continue
    }

    if (row.refKind === "mail") {
      const m = mailById.get(row.refId)
      if (!m) {
        stale.push(row.id)
        continue
      }
      const age = daysSince(m.receivedAt, now)
      cards.push({
        ...base,
        paper: paperFor("mail", row.color),
        title: m.subject || "(no subject)",
        project: m.fromName || m.fromEmail,
        dueOn: null,
        dueLabel: age === 0 ? "today" : `${age}d ago`,
        overdue: false,
        checklist: null,
        steps: [],
        notes: m.snippet,
        href: `${ROUTES.inbox}?item=mail:${m.id}`,
      })
    }
  }

  if (stale.length) {
    await db.delete(focusItems).where(inArray(focusItems.id, stale))
  }

  return {
    cards,
    focusedTaskIds: new Set(cards.filter((c) => c.refKind === "task").map((c) => c.refId)),
  }
}

/** The client a focus row belongs to — actions revalidate its Board. */
export async function focusRowClient(id: string) {
  const row = await db.query.focusItems.findFirst({
    where: eq(focusItems.id, id),
    with: { client: { columns: { id: true, slug: true } } },
  })
  return row ? { row, client: row.client } : null
}

export async function focusOrder(clientId: string): Promise<string[]> {
  const rows = await db
    .select({ id: focusItems.id })
    .from(focusItems)
    .where(eq(focusItems.clientId, clientId))
    .orderBy(asc(focusItems.position))
  return rows.map((r) => r.id)
}

export async function writeOrder(clientId: string, order: string[]) {
  await Promise.all(
    order.map((id, position) =>
      db.update(focusItems).set({ position }).where(and(eq(focusItems.id, id), eq(focusItems.clientId, clientId)))
    )
  )
}

/**
 * The global set: every row elevated with the pin, across clients, each
 * client's rows in their own order. Read by the dashboard. Built the same
 * way as a client's set, so a card looks identical in both places.
 */
export async function globalFocus(now = new Date()): Promise<FocusCard[]> {
  const rows = await db.query.focusItems.findMany({
    where: eq(focusItems.global, true),
    with: { client: { columns: { id: true, slug: true, name: true } } },
    orderBy: [asc(focusItems.clientId), asc(focusItems.position)],
  })
  const byClient = new Map<string, { id: string; slug: string; name: string }>()
  for (const r of rows) if (r.client) byClient.set(r.client.id, r.client)
  const sets = await Promise.all(Array.from(byClient.values()).map((c) => focusFor(c, now)))
  const out: FocusCard[] = []
  for (const set of sets) for (const card of set.cards) if (card.global) out.push(card)
  return out
}
