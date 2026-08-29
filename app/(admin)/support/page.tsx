import { desc } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { db } from "@/db"
import type { SupportTicket } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { ROUTES } from "@/lib/nav"
import { getSmartsheetConfig, smartsheetTokenPresent } from "@/lib/smartsheet"
import { formatDay, plural } from "@/lib/work"
import { connectSheet, enableInstantSync, refreshTickets } from "./actions"

export const metadata = { title: "Support Tickets" }
export const dynamic = "force-dynamic"

function isOpen(t: SupportTicket) {
  return !t.completed && !/closed|resolved|done/i.test(t.status)
}

function priorityTone(priority: string) {
  if (/urgent/i.test(priority)) return "bg-red-700/10 text-red-700"
  if (/high/i.test(priority)) return "bg-amber-700/10 text-amber-800"
  return "bg-tk-linen text-tk-slate"
}

function statusTone(t: SupportTicket) {
  if (!isOpen(t)) return "bg-tk-slate/10 text-tk-slate/70"
  if (/progress/i.test(t.status)) return "bg-tk-teal/10 text-tk-teal"
  return "bg-amber-700/10 text-amber-800"
}

export default async function SupportPage() {
  const [tickets, clients, config] = await Promise.all([
    db.query.supportTickets.findMany({
      with: { client: true },
      orderBy: (t) => [desc(t.submittedOn), desc(t.createdAt)],
    }),
    db.query.clients.findMany({ orderBy: (c, { asc }) => [asc(c.name)] }),
    getSmartsheetConfig(),
  ])
  const tokenPresent = smartsheetTokenPresent()
  const connected = tokenPresent && config.sheetId

  const open = tickets.filter(isOpen)
  const closed = tickets.filter((t) => !isOpen(t))
  const urgent = open.filter((t) => /urgent|high/i.test(t.priority))
  const zemvelo = clients.find((c) => c.slug === "zemvelo")

  return (
    <>
      <PageHeader title="Support Tickets" />

      {!connected ? (
        <section className="mt-8 max-w-2xl rounded-2xl border border-tk-slate/15 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-tk-onyx">Connect Smartsheet</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-tk-slate">
            <li className={tokenPresent ? "line-through opacity-50" : ""}>
              Smartsheet → Personal Settings → <b>API Access</b> → generate a token. Add it as{" "}
              <code className="rounded bg-tk-linen px-1.5 py-0.5 text-xs">SMARTSHEET_ACCESS_TOKEN</code>{" "}
              in <code className="rounded bg-tk-linen px-1.5 py-0.5 text-xs">crm/.env.local</code> and on Railway.
              {tokenPresent ? " ✓ done" : ""}
            </li>
            <li>
              Open the sheet → File → <b>Properties</b> → copy the Sheet ID and paste it below.
            </li>
          </ol>
          <form action={connectSheet} className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="text-xs font-medium text-tk-slate/70">Sheet ID</span>
              <input
                name="sheetId"
                placeholder="4583173393803140"
                inputMode="numeric"
                className="mt-1 w-56 rounded-lg border border-tk-slate/20 bg-tk-linen px-3 py-2 text-sm tabular-nums outline-none focus:border-tk-teal"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs font-medium text-tk-slate/70">Tickets belong to</span>
              <select
                name="clientId"
                defaultValue={zemvelo?.id ?? ""}
                className="mt-1 rounded-lg border border-tk-slate/20 bg-tk-linen px-3 py-2 text-sm outline-none focus:border-tk-teal"
              >
                <option value="">— no client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={!tokenPresent}
              className="rounded-lg bg-tk-teal px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90 disabled:opacity-50"
            >
              Connect &amp; sync
            </button>
          </form>
          {!tokenPresent ? (
            <p className="mt-2 text-xs text-tk-slate/60">
              The connect button unlocks once the token env var is set.
            </p>
          ) : null}
        </section>
      ) : (
        <>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <Stat label="Open" value={String(open.length)} sub={plural(urgent.length, "urgent/high ticket")} tone={urgent.length ? "bad" : undefined} />
            <Stat label="Closed" value={String(closed.length)} sub="synced from Smartsheet" />
            <Stat
              label="Sync"
              value={config.webhookId ? "Instant" : "Manual"}
              sub={config.lastSyncAt ? `last ${new Date(config.lastSyncAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "never synced"}
            />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <form action={refreshTickets}>
              <button className="rounded-full bg-tk-teal px-4 py-1.5 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90">
                Refresh from Smartsheet
              </button>
            </form>
            {!config.webhookId ? (
              <form action={enableInstantSync}>
                <button className="rounded-full border border-tk-slate/20 px-4 py-1.5 text-sm font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal">
                  Enable instant sync (webhook)
                </button>
              </form>
            ) : (
              <span className="rounded-full bg-tk-teal/10 px-3 py-1 text-xs font-semibold text-tk-teal">
                webhook live — new rows land within seconds
              </span>
            )}
          </div>

          <TicketList title="Open" tickets={open} emptyNote="Nothing open. Enjoy it." />
          <TicketList title="Closed" tickets={closed} emptyNote="Nothing closed yet." muted />
        </>
      )}
    </>
  )
}

function TicketList({
  title,
  tickets,
  emptyNote,
  muted,
}: {
  title: string
  tickets: (SupportTicket & { client: { slug: string; name: string } | null })[]
  emptyNote: string
  muted?: boolean
}) {
  return (
    <div className="mt-6">
      <h2 className="flex items-baseline gap-2 px-0.5 text-[11px] font-semibold uppercase tracking-widest text-tk-slate/60">
        {title} <span className="font-medium tabular-nums">{tickets.length}</span>
      </h2>
      {tickets.length === 0 ? (
        <p className="mt-2 px-0.5 text-sm text-tk-slate/60">{emptyNote}</p>
      ) : (
        <ul className={`mt-2 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm ${muted ? "opacity-75" : ""}`}>
          {tickets.map((t) => (
            <li key={t.id} className="border-b border-tk-slate/[0.07] last:border-0">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 px-5 py-3 hover:bg-tk-linen/50 [&::-webkit-details-marker]:hidden">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: t.client ? clientColor(t.client.slug) : "rgba(15,22,21,.25)" }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-tk-onyx">
                      <span className="tabular-nums text-tk-slate/50">{t.number.replace("-Ticket", "")}</span>
                      {" · "}
                      {t.title || "Untitled"}
                    </span>
                    <span className="block truncate text-xs text-tk-slate/60">
                      {[t.submittedBy, t.submittedOn ? formatDay(t.submittedOn) : null, t.department]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {t.dueOn && isOpen(t) ? (
                    <span className="shrink-0 text-xs tabular-nums text-tk-slate/60">due {formatDay(t.dueOn)}</span>
                  ) : null}
                  {t.priority ? (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityTone(t.priority)}`}>
                      {t.priority.toLowerCase()}
                    </span>
                  ) : null}
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone(t)}`}>
                    {t.completed ? "closed" : (t.status || "new").toLowerCase()}
                  </span>
                </summary>
                <div className="space-y-2 border-t border-tk-slate/[0.07] bg-tk-linen/30 px-5 py-3 text-sm text-tk-slate">
                  {t.description ? <p>{t.description}</p> : null}
                  {t.resolution ? (
                    <p>
                      <b className="text-[10.5px] uppercase tracking-wider text-tk-slate/60">Resolution</b>{" "}
                      {t.resolution}
                    </p>
                  ) : null}
                  <p className="text-xs text-tk-slate/60">
                    {[
                      t.requestType,
                      t.contactEmail,
                      t.customerContact && `customer: ${t.customerContact}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "bad" }) {
  return (
    <div className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-tk-slate/60">{label}</p>
      <p className="mt-1.5 text-[23px] font-semibold leading-tight tracking-tight text-tk-onyx tabular-nums">{value}</p>
      <p className={`mt-0.5 truncate text-xs ${tone === "bad" ? "font-semibold text-red-700" : "text-tk-slate/60"}`}>{sub}</p>
    </div>
  )
}
