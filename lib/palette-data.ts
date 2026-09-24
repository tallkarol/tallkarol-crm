import { and, count, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { chatThreads, invoices, tasks } from "@/db/schema"
import { PERSONAS } from "@/lib/chat/personas"
import { CLIENT_ROOMS, ROUTES } from "@/lib/nav"
import { ticketSlug } from "@/lib/support"
import type { PaletteEntry, PalettePayload } from "@/lib/palette"

const byLabel = (a: PaletteEntry, b: PaletteEntry) => a.label.localeCompare(b.label)

type ClientRef = { name: string; slug: string } | null

/** The client's name on the right, its colour on the dot. */
function owner(client: ClientRef): Pick<PaletteEntry, "sub" | "slug"> {
  return client ? { sub: client.name, slug: client.slug } : {}
}

const CLIENT = { columns: { name: true, slug: true } } as const

/**
 * What the client-manager is asked by "Check in on …". The desk reads the
 * pack, the board, the calendar and the mail; this only says what to look for.
 */
const CHECK_IN = "Check in: where do things stand? What's due, what's waiting on me, and what changed lately."

/**
 * Everything ⌘K can reach by name, and the actions that take a client or a
 * site. Read when the palette first opens, not on every page load — a few
 * hundred rows, one round trip. Amounts are left out on purpose: a fetch
 * cannot see demo mode, and the palette must not be where money leaks.
 */
export async function loadPalette(userId: string): Promise<PalettePayload> {
  const [
    clientRows,
    projectRows,
    retainerRows,
    taskRows,
    ticketRows,
    invoiceRows,
    threadRows,
    reportRows,
    proposalRows,
    worksheetRows,
    contractRows,
    punchlistRows,
    meetingRows,
    productRows,
    boardRows,
    siteRows,
    [openTasks],
    [unpaid],
  ] = await Promise.all([
    db.query.clients.findMany({ columns: { id: true, name: true, slug: true } }),
    db.query.projects.findMany({ columns: { name: true, slug: true }, with: { client: CLIENT } }),
    db.query.retainers.findMany({ columns: { name: true, slug: true }, with: { client: CLIENT } }),
    db.query.tasks.findMany({
      columns: { id: true, title: true },
      where: (t, { eq }) => eq(t.status, "open"),
      with: { client: CLIENT },
    }),
    db.query.supportTickets.findMany({ columns: { id: true, number: true, title: true, status: true }, with: { client: CLIENT } }),
    db.query.invoices.findMany({ columns: { number: true, status: true }, with: { client: CLIENT } }),
    db.query.chatThreads.findMany({
      columns: { id: true, title: true, agent: true },
      where: and(eq(chatThreads.userId, userId), isNull(chatThreads.archivedAt)),
    }),
    db.query.reports.findMany({ columns: { title: true, slug: true, bodyPath: true }, with: { client: CLIENT } }),
    db.query.proposals.findMany({ columns: { title: true, slug: true, bodyPath: true }, with: { client: CLIENT } }),
    db.query.worksheets.findMany({ columns: { title: true, slug: true, bodyPath: true }, with: { client: CLIENT } }),
    db.query.contracts.findMany({ columns: { title: true, slug: true }, with: { client: CLIENT } }),
    db.query.punchlists.findMany({ columns: { title: true, slug: true }, with: { client: CLIENT, product: { columns: { slug: true } } } }),
    db.query.meetingNotes.findMany({ columns: { id: true, title: true }, with: { client: CLIENT } }),
    db.query.products.findMany({ columns: { name: true, slug: true }, with: { client: CLIENT } }),
    db.query.inspirationBoards.findMany({ columns: { title: true, slug: true } }),
    db.query.sites.findMany({ columns: { name: true, origin: true }, with: { client: CLIENT } }),
    // The dashboard's "open" — recurring chores are not what the count means.
    db.select({ n: count() }).from(tasks).where(and(eq(tasks.status, "open"), eq(tasks.cadence, "none"))),
    db.select({ n: count() }).from(invoices).where(eq(invoices.status, "sent")),
  ])

  const clientsSorted = [...clientRows].sort((a, b) => a.name.localeCompare(b.name))
  const doc = (
    kind: string,
    href: (slug: string) => string,
    r: { title: string; slug: string | null; bodyPath: string | null; client: ClientRef }
  ): PaletteEntry[] =>
    // The same rule the client dashboards link by: no body on disk, nothing to open.
    r.slug && r.bodyPath
      ? [{ kind: "doc", label: r.title, href: href(r.slug), external: true, keywords: kind, ...owner(r.client) }]
      : []

  const records: PaletteEntry[] = [
    // Actions first: they are what a query like "clock in min" is after.
    ...clientsSorted.map((c) => ({
      kind: "action" as const,
      label: `Clock in for ${c.name}`,
      action: { type: "clock-in" as const, clientId: c.id },
      slug: c.slug,
    })),
    ...clientsSorted.map((c) => ({
      kind: "action" as const,
      label: `Check in on ${c.name}`,
      action: { type: "send" as const, text: `@client-manager ${c.slug} ${CHECK_IN}`, busy: `Asking the client manager about ${c.name}…` },
      sub: "Client manager",
      slug: c.slug,
    })),
    // Care runs per client pack; a site is how Karol names it. A site with
    // no client has no pack to run against, so it gets no row.
    ...siteRows.flatMap((s) =>
      s.client
        ? [{
            kind: "action" as const,
            label: `Run website care for ${s.name}`,
            action: { type: "send" as const, text: `/care ${s.client.slug}`, busy: `Starting website care for ${s.name}…` },
            sub: s.origin.replace(/^https?:\/\/(www\.)?/, ""),
            keywords: `care ${s.client.name}`,
            slug: s.client.slug,
          }]
        : []
    ),

    ...clientsSorted.map((c) => ({ kind: "client" as const, label: c.name, href: ROUTES.client(c.slug), slug: c.slug })),
    ...projectRows.map((p) => ({ kind: "project" as const, label: p.name, href: ROUTES.clientProject(p.client.slug, p.slug), ...owner(p.client) })).sort(byLabel),
    ...retainerRows.map((r) => ({ kind: "retainer" as const, label: r.name, href: ROUTES.retainer(r.slug), ...owner(r.client) })).sort(byLabel),
    // The Board is the client itself; the other rooms get a row each.
    ...clientsSorted.flatMap((c) =>
      CLIENT_ROOMS.filter((room) => room.id !== "board").map((room) => ({
        kind: "room" as const,
        label: `${c.name} → ${room.label}`,
        href: ROUTES.clientRoom(c.slug, room.id),
        slug: c.slug,
      }))
    ),
    ...taskRows.map((t) => ({ kind: "task" as const, label: t.title, href: `${ROUTES.tasks}?peek=task:${t.id}`, ...owner(t.client) })),
    ...ticketRows.map((t) => ({
      kind: "ticket" as const,
      label: t.title || t.number,
      href: `${ROUTES.support}/${ticketSlug(t)}`,
      keywords: `${t.number} ${t.status}`,
      ...owner(t.client),
    })),
    ...invoiceRows
      .map((i) => ({ kind: "invoice" as const, label: `Invoice ${i.number}`, href: ROUTES.invoice(i.number), keywords: i.status, ...owner(i.client) }))
      .sort((a, b) => b.label.localeCompare(a.label)),
    ...threadRows.map((t) => ({
      kind: "chat" as const,
      label: t.title || "Untitled",
      href: ROUTES.chatThread(t.id),
      sub: PERSONAS[t.agent]?.label ?? "Chat",
    })),
    ...reportRows.flatMap((r) => doc("report", ROUTES.reportDoc, r)),
    ...proposalRows.flatMap((r) => doc("proposal", ROUTES.proposalDoc, r)),
    ...worksheetRows.flatMap((r) => doc("worksheet", ROUTES.worksheetDoc, r)),
    ...contractRows.map((c) => ({ kind: "doc" as const, label: c.title, href: ROUTES.contract(c.slug), keywords: "contract", ...owner(c.client) })),
    ...punchlistRows.map((p) => ({
      kind: "punchlist" as const,
      label: p.title,
      href: p.product
        ? ROUTES.productPunchlist(p.product.slug, p.slug)
        : p.client
          ? ROUTES.clientPunchlist(p.client.slug, p.slug)
          : ROUTES.punchlist(p.slug),
      ...owner(p.client),
    })),
    ...meetingRows.map((m) => ({ kind: "meeting" as const, label: m.title || "Untitled meeting", href: ROUTES.meetingNote(m.id), ...owner(m.client) })),
    ...productRows.map((p) => ({ kind: "product" as const, label: p.name, href: ROUTES.productPage(p.slug), ...owner(p.client) })),
    ...boardRows.map((b) => ({ kind: "board" as const, label: b.title, href: ROUTES.inspirationBoard(b.slug) })),
  ]

  const counts: Record<string, string> = { [ROUTES.tasks]: `${openTasks?.n ?? 0} open` }
  if (unpaid?.n) counts[ROUTES.invoices] = `${unpaid.n} unpaid`
  return { records, counts }
}
