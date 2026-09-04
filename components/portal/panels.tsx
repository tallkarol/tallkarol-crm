import Link from "next/link"
import { desc, inArray } from "drizzle-orm"
import { db } from "@/db"
import { invoices as invoicesTable, snapshotArchive, supportTickets, type Client } from "@/db/schema"
import { submitPortalTicket } from "@/app/(public)/portal/actions"
import { formatDay, formatMoney, plural } from "@/lib/work"

/* Everything in this file is CLIENT-SAFE: no rates, margins, internal notes,
   drafts, or other clients' anything. Queries scope by client id up front. */

function ticketOpen(t: { completed: boolean; status: string; state: string }) {
  if (t.state) return t.state !== "closed"
  return !t.completed && !/closed|resolved|done/i.test(t.status)
}

function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

async function scopedIds(clients: Client[]) {
  return clients.map((c) => c.id)
}

/* ---------------------------------------------------------------- overview */

export async function PortalOverview({ clients, firstName }: { clients: Client[]; firstName: string }) {
  const ids = await scopedIds(clients)
  const [retainers, invoices, tickets, archives] = await Promise.all([
    db.query.retainers.findMany({ with: { client: true } }).then((rows) =>
      rows.filter((r) => ids.includes(r.clientId) && r.status === "active")
    ),
    db.query.invoices.findMany().then((rows) =>
      rows.filter((i) => ids.includes(i.clientId) && i.status !== "draft")
    ),
    db.query.supportTickets.findMany().then((rows) =>
      rows.filter((t) => t.clientId && ids.includes(t.clientId))
    ),
    db.query.sites
      .findMany()
      .then(async (sites) => {
        const mine = sites.filter((s) => s.clientId && ids.includes(s.clientId))
        if (mine.length === 0) return []
        return db.query.snapshotArchive.findMany({
          where: inArray(snapshotArchive.siteId, mine.map((s) => s.id)),
          orderBy: [desc(snapshotArchive.period)],
          columns: { id: true, period: true, label: true, siteId: true },
        })
      })
      .catch(() => []),
  ])

  const openTickets = tickets.filter(ticketOpen)
  const unpaid = invoices.filter((i) => i.status === "sent")
  const latestArchive = archives[0] ?? null

  const meters = retainers.map((r) => {
    const latest = invoices
      .filter((i) => i.retainerId === r.id && i.hours)
      .sort((a, b) => (a.issuedOn > b.issuedOn ? -1 : 1))[0]
    return {
      id: r.id,
      name: `${r.client.name} · ${r.name === r.client.name ? "Retainer" : r.name}`,
      cap: r.hoursPerMonth,
      hours: latest ? Number(latest.hours) : 0,
      month: latest ? monthLabel(latest.issuedOn.slice(0, 7)).split(" ")[0] : null,
      settled: latest?.status === "paid",
    }
  })

  const journals = retainers
    .map((r) => {
      const latest = invoices
        .filter((i) => i.retainerId === r.id && i.description)
        .sort((a, b) => (a.issuedOn > b.issuedOn ? -1 : 1))[0]
      return latest ? { name: r.client.name, month: monthLabel(latest.issuedOn.slice(0, 7)), text: latest.description } : null
    })
    .filter((j): j is NonNullable<typeof j> => j !== null)

  return (
    <>
      <h1 className="font-['Inter_Tight',sans-serif] text-[22px] font-bold tracking-tight text-tk-onyx">
        Welcome back, {firstName}
      </h1>
      <p className="mt-0.5 text-[13px] text-tk-slate/60">
        Everything about your engagements in one place — hours, work journals, tickets, invoices, and reports.
      </p>

      {meters.length > 0 ? (
        <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
          {meters.map((m) => (
            <div key={m.id} className="rounded-2xl border border-tk-slate/15 bg-white p-4 shadow-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-['Inter_Tight',sans-serif] text-[15px] font-bold text-tk-onyx">{m.name}</span>
                <span className="text-xs font-semibold tabular-nums text-tk-slate">
                  {m.hours.toLocaleString("en-US", { maximumFractionDigits: 1 })} / {m.cap} hrs{m.month ? ` · ${m.month}` : ""}
                </span>
              </div>
              <span className="mt-2 block h-[7px] overflow-hidden rounded-full bg-tk-linen">
                <span
                  className="block h-full rounded-full bg-tk-teal"
                  style={{ width: `${Math.min(100, (m.hours / m.cap) * 100)}%` }}
                />
              </span>
              <p className="mt-1.5 text-[11.5px] text-tk-slate/60">
                {m.cap} hours per month{m.month ? ` · ${m.month} invoiced${m.settled ? " & paid" : ""}` : ""}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3.5 grid gap-3.5 lg:grid-cols-2">
        {journals.length > 0 ? (
          <div className="rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
            <div className="flex items-center justify-between px-4 pt-3.5">
              <h2 className="text-[13px] font-bold text-tk-onyx">{journals[0].month} in review</h2>
              <span className="text-[11px] text-tk-slate/50">the work, month by month</span>
            </div>
            <div className="space-y-3 px-4 pb-4 pt-2">
              {journals.map((j) => (
                <div key={j.name}>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-tk-teal">{j.name}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-tk-slate">{j.text}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
          <div className="flex items-center justify-between px-4 pt-3.5">
            <h2 className="text-[13px] font-bold text-tk-onyx">Right now</h2>
            <span className="text-[11px] text-tk-slate/50">live</span>
          </div>
          <ul className="px-1 pb-2 pt-1">
            <li className="flex items-center gap-3 border-b border-tk-slate/[0.07] px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-tk-onyx">{plural(openTickets.length, "open ticket")}</span>
                <span className="block text-xs text-tk-slate/60">
                  {openTickets.length ? "being worked — see Tickets" : "all clear"}
                </span>
              </span>
              <Link href="/portal/tickets" className="rounded-full border border-tk-slate/20 px-3 py-1 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal">
                Open
              </Link>
            </li>
            <li className="flex items-center gap-3 border-b border-tk-slate/[0.07] px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-tk-onyx">
                  {unpaid.length === 0 ? "All invoices settled" : `${plural(unpaid.length, "invoice")} awaiting payment`}
                </span>
                <span className="block text-xs text-tk-slate/60">
                  {unpaid.length === 0
                    ? "nothing outstanding"
                    : formatMoney(unpaid.reduce((s, i) => s + i.amountCents, 0))}
                </span>
              </span>
              <Link href="/portal/invoices" className="rounded-full border border-tk-slate/20 px-3 py-1 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal">
                View
              </Link>
            </li>
            {latestArchive ? (
              <li className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-tk-onyx">
                    {latestArchive.label || monthLabel(latestArchive.period)} site report
                  </span>
                  <span className="block text-xs text-tk-slate/60">traffic, search, and what it means</span>
                </span>
                <Link href="/portal/reports" className="rounded-full border border-tk-slate/20 px-3 py-1 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal">
                  Open
                </Link>
              </li>
            ) : null}
          </ul>
        </div>
      </div>
    </>
  )
}

/* ----------------------------------------------------------------- tickets */

export async function PortalTickets({ clients }: { clients: Client[] }) {
  const ids = await scopedIds(clients)
  const tickets = await db.query.supportTickets
    .findMany({ orderBy: [desc(supportTickets.submittedOn), desc(supportTickets.createdAt)] })
    .then((rows) => rows.filter((t) => t.clientId && ids.includes(t.clientId)))
  const open = tickets.filter(ticketOpen)
  const closed = tickets.filter((t) => !ticketOpen(t))

  return (
    <div className="mt-4 grid gap-3.5 lg:grid-cols-[1.5fr_1fr]">
      <div className="min-w-0 rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 pt-3.5">
          <h2 className="text-[13px] font-bold text-tk-onyx">Your queue</h2>
          <span className="text-[11px] tabular-nums text-tk-slate/50">
            {open.length} open · {closed.length} closed
          </span>
        </div>
        <ul className="px-1 pb-2 pt-1">
          {[...open, ...closed.slice(0, 4)].map((t) => {
            const isOpen = ticketOpen(t)
            return (
              <li key={t.id} className="flex flex-wrap items-center gap-2.5 border-b border-tk-slate/[0.07] px-3 py-2.5 text-sm last:border-0">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-tk-onyx">{t.title || "Untitled"}</span>
                  <span className="block truncate text-xs tabular-nums text-tk-slate/60">
                    {[t.number.replace("-Ticket", ""), t.submittedBy, t.submittedOn ? formatDay(t.submittedOn) : null]
                      .filter(Boolean)
                      .join(" · ")}
                    {!isOpen && t.resolution ? ` — ${t.resolution}` : ""}
                  </span>
                </span>
                {isOpen && /urgent|high/i.test(t.priority) ? (
                  <span className="rounded-full bg-[#B91C1C]/10 px-2 py-0.5 text-[11px] font-semibold text-[#B91C1C]">
                    {t.priority.toLowerCase()}
                  </span>
                ) : null}
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    !isOpen
                      ? "bg-[#065F46]/10 text-[#065F46]"
                      : /progress/i.test(t.state || t.status)
                        ? "bg-tk-teal/10 text-tk-teal"
                        : "bg-[#B45309]/10 text-[#92400E]"
                  }`}
                >
                  {!isOpen
                    ? "closed"
                    : (() => {
                        const label = (t.state || t.status || "new").toLowerCase()
                        return label === "progress" ? "in progress" : label
                      })()}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
      <PortalTicketForm clients={clients} />
    </div>
  )
}

function PortalTicketForm({ clients }: { clients: Client[] }) {
  return (
    <div className="min-w-0 self-start rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      <div className="px-4 pt-3.5">
        <h2 className="text-[13px] font-bold text-tk-onyx">New ticket</h2>
        <p className="mt-0.5 text-[11.5px] text-tk-slate/60">
          Lands directly on Karol&rsquo;s desk — no Smartsheet required.
        </p>
      </div>
      <form action={submitPortalTicket} className="grid gap-2.5 px-4 pb-4 pt-3">
        <label className="block text-xs font-semibold text-tk-slate">
          What&rsquo;s going on?
          <input name="title" required placeholder="Short title" className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-[#FAF6EE] px-3 py-2 text-[13px] font-normal outline-none focus:border-tk-teal" />
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block text-xs font-semibold text-tk-slate">
            For
            <select name="clientId" className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-[#FAF6EE] px-2.5 py-2 text-[13px] font-normal outline-none focus:border-tk-teal">
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-tk-slate">
            Priority
            <select name="priority" className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-[#FAF6EE] px-2.5 py-2 text-[13px] font-normal outline-none focus:border-tk-teal">
              <option value="Medium">Normal</option>
              <option value="High">High</option>
              <option value="Urgent">Urgent</option>
            </select>
          </label>
        </div>
        <label className="block text-xs font-semibold text-tk-slate">
          Details
          <textarea name="description" rows={4} placeholder="What happened, where, and for whom?" className="mt-1 w-full rounded-lg border border-tk-slate/20 bg-[#FAF6EE] px-3 py-2 text-[13px] font-normal outline-none focus:border-tk-teal" />
        </label>
        <div>
          <button className="rounded-full bg-tk-teal px-4 py-2 text-[13px] font-semibold text-tk-linen hover:bg-tk-teal/90">
            Submit ticket
          </button>
        </div>
      </form>
    </div>
  )
}

/* ---------------------------------------------------------------- invoices */

export async function PortalInvoices({ clients }: { clients: Client[] }) {
  const ids = await scopedIds(clients)
  const invoices = await db.query.invoices
    .findMany({ with: { client: true }, orderBy: [desc(invoicesTable.issuedOn)] })
    .then((all) => all.filter((i) => ids.includes(i.clientId) && i.status !== "draft"))

  return (
    <div className="mt-4 rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      {invoices.length === 0 ? (
        <p className="px-4 py-8 text-sm text-tk-slate/60">No invoices yet.</p>
      ) : (
        <ul className="px-1 py-1">
          {invoices.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 border-b border-tk-slate/[0.07] px-3 py-2.5 text-sm last:border-0">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold tabular-nums text-tk-onyx">
                  {i.number} — {monthLabel(i.issuedOn.slice(0, 7))} · {i.client.name}
                </span>
                <span className="block truncate text-xs text-tk-slate/60">
                  {i.hours ? `${Number(i.hours).toLocaleString("en-US", { maximumFractionDigits: 1 })} hrs · ` : ""}
                  issued {formatDay(i.issuedOn)}
                </span>
              </span>
              <span className="font-bold tabular-nums text-tk-onyx">{formatMoney(i.amountCents, i.currency)}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  i.status === "paid" ? "bg-[#065F46]/10 text-[#065F46]" : "bg-[#B45309]/10 text-[#92400E]"
                }`}
              >
                {i.status === "paid" ? "paid" : "due"}
              </span>
              <a
                href={`/invoice-print/${encodeURIComponent(i.number)}`}
                className="rounded-full border border-tk-slate/20 px-3 py-1 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
              >
                PDF
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ----------------------------------------------------------------- reports */

export async function PortalReports({ clients }: { clients: Client[] }) {
  const ids = await scopedIds(clients)
  const sites = await db.query.sites
    .findMany()
    .then((rows) => rows.filter((s) => s.clientId && ids.includes(s.clientId)))
    .catch(() => [])
  const archives =
    sites.length === 0
      ? []
      : await db.query.snapshotArchive.findMany({
          where: inArray(snapshotArchive.siteId, sites.map((s) => s.id)),
          orderBy: [desc(snapshotArchive.period)],
          columns: { id: true, period: true, label: true, siteId: true },
        })
  const siteName = new Map(sites.map((s) => [s.id, s.name]))
  const siteSlug = new Map(sites.map((s) => [s.id, s.slug]))

  return (
    <div className="mt-4 rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      {archives.length === 0 ? (
        <p className="px-4 py-8 text-sm text-tk-slate/60">
          Your first monthly report publishes when the current month closes.
        </p>
      ) : (
        <ul className="px-1 py-1">
          {archives.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 border-b border-tk-slate/[0.07] px-3 py-2.5 text-sm last:border-0">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-tk-onyx">
                  {a.label || monthLabel(a.period)} — {siteName.get(a.siteId)} site report
                </span>
                <span className="block text-xs text-tk-slate/60">sessions, search queries, top pages · frozen at month end</span>
              </span>
              <a
                href={`/insights-report/${siteSlug.get(a.siteId)}?period=${a.period}`}
                className="rounded-full border border-tk-slate/20 px-3 py-1 text-xs font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
              >
                Open
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
