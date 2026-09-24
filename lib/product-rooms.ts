import { and, asc, eq, gte, lt, sql } from "drizzle-orm"
import { db } from "@/db"
import { calendarEvents, products, punchlists, tasks } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { isoDay } from "@/lib/horizon"
import { shortOf, weekFrame, type WeekData, type WeekItem } from "@/lib/client-rooms"
import { ROUTES } from "@/lib/nav"
import { PRODUCT_STATUS_LABEL, studioCaption } from "@/lib/work"

/**
 * Loaders for the product hub (24 Sep 2026) — the client hub's shape for
 * Karol's own products: a shell every room shares, and the panel's data.
 * The rooms' own loaders live beside the client ones they mirror
 * (lib/client-rooms.ts, lib/meeting-notes.ts, lib/punchlists.ts), taking a
 * product where those take a client.
 */

export type ProductShell = {
  id: string
  slug: string
  name: string
  short: string
  color: string
  status: string
  statusLabel: string
  tagline: string
  /** "Sondry · studio" — the studio the product belongs to. */
  studio: string
  clientId: string | null
  clientName: string | null
  clientSlug: string | null
}

export async function loadProductShell(slug: string): Promise<ProductShell | null> {
  const row = await db.query.products.findFirst({
    where: eq(products.slug, slug),
    columns: { id: true, slug: true, name: true, status: true, tagline: true, clientId: true },
    with: {
      client: { columns: { name: true, slug: true } },
      studio: { columns: { name: true, kind: true } },
    },
  })
  if (!row) return null
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    short: shortOf(row.name),
    color: clientColor(row.slug),
    status: row.status,
    statusLabel: PRODUCT_STATUS_LABEL[row.status] ?? row.status,
    tagline: row.tagline,
    studio: row.studio ? studioCaption(row.studio) : "",
    clientId: row.clientId,
    clientName: row.client?.name ?? null,
    clientSlug: row.client?.slug ?? null,
  }
}

export type ProductPanelData = {
  roster: { slug: string; name: string; color: string; status: string }[]
  badges: { board: number; punchlists: number }
}

export async function loadProductPanel(product: ProductShell): Promise<ProductPanelData> {
  const [roster, [openTasks], [openLists]] = await Promise.all([
    db.query.products.findMany({
      columns: { slug: true, name: true, status: true, sort: true },
      orderBy: (p, { asc }) => [asc(p.sort), asc(p.name)],
    }),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(and(eq(tasks.productId, product.id), eq(tasks.status, "open"))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(punchlists)
      .where(and(eq(punchlists.productId, product.id), eq(punchlists.status, "open"))),
  ])
  return {
    roster: roster.map((p) => ({ slug: p.slug, name: p.name, color: clientColor(p.slug), status: p.status })),
    badges: { board: openTasks?.n ?? 0, punchlists: openLists?.n ?? 0 },
  }
}

/** An event in the shown week that no product claims yet — the Calendar room offers to add it. */
export type LinkableEvent = { id: string; title: string; startsAt: string; allDay: boolean; client: string | null }

/**
 * The product Calendar room's week: every event in the week (this product's
 * own in its colour, the rest dimmed, as a client's Calendar shows them),
 * the product's tasks due in the week, and the week's unclaimed events so
 * one can be added to the product from here.
 */
export async function loadProductWeek(
  product: ProductShell,
  now = new Date(),
  anchor?: string
): Promise<{ week: WeekData; linkable: LinkableEvent[] }> {
  const { today, start, end, from, to, days, dayIndex } = weekFrame(now, anchor)
  const [events, dueTasks] = await Promise.all([
    db.query.calendarEvents.findMany({
      where: and(eq(calendarEvents.cancelled, false), gte(calendarEvents.startsAt, from), lt(calendarEvents.startsAt, to)),
      with: { client: { columns: { slug: true, name: true } }, product: { columns: { name: true } } },
      orderBy: [asc(calendarEvents.startsAt)],
    }),
    db
      .select({ id: tasks.id, title: tasks.title, dueOn: tasks.dueOn, cadence: tasks.cadence })
      .from(tasks)
      .where(and(eq(tasks.productId, product.id), eq(tasks.status, "open"), gte(tasks.dueOn, start), lt(tasks.dueOn, end))),
  ])

  const items: WeekItem[] = []
  const linkable: LinkableEvent[] = []
  for (const e of events) {
    const day = dayIndex(isoDay(e.startsAt))
    if (day < 0) continue
    const mine = e.productId === product.id
    items.push({
      kind: "event",
      id: e.id,
      day,
      startsAt: e.startsAt.toISOString(),
      endsAt: e.endsAt.toISOString(),
      title: e.title || "(untitled)",
      mine,
      who: mine ? null : (e.product?.name ?? e.client?.name ?? null),
      allDay: e.allDay,
      href: e.url || null,
      color: e.client ? clientColor(e.client.slug) : undefined,
    })
    if (!e.productId) {
      linkable.push({ id: e.id, title: e.title || "(untitled)", startsAt: e.startsAt.toISOString(), allDay: e.allDay, client: e.client?.name ?? null })
    }
  }
  for (const t of dueTasks) {
    if (!t.dueOn) continue
    items.push({
      kind: "due",
      id: `task:${t.id}`,
      day: dayIndex(t.dueOn),
      title: t.cadence !== "none" ? `${t.title} ↻` : `${t.title} due`,
      flavour: t.cadence !== "none" ? "repeat" : "due",
      href: ROUTES.task(t.id),
    })
  }
  items.sort((a, b) => (a.day - b.day) || (a.kind === "due" ? -1 : b.kind === "due" ? 1 : a.startsAt < b.startsAt ? -1 : 1))
  return { week: { start, days, todayIndex: dayIndex(today), items }, linkable }
}
