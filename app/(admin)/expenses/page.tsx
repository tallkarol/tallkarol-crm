import { desc } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import { Importer } from "@/components/expenses/Importer"
import { db } from "@/db"
import { clientColor } from "@/lib/client-colors"
import { EXPENSE_CATEGORIES as CATEGORIES } from "@/lib/expense-categories"
import { formatDay, formatMoney, plural } from "@/lib/work"
import { addExpense, deleteExpense, mapExpenseClient } from "./actions"

export const metadata = { title: "Expenses" }
export const dynamic = "force-dynamic"

export default async function ExpensesPage() {
  const [rows, clients] = await Promise.all([
    db.query.expenses.findMany({
      orderBy: (e) => [desc(e.occurredOn), desc(e.createdAt)],
      with: { client: true },
    }),
    db.query.clients.findMany({ orderBy: (c, { asc }) => [asc(c.name)] }),
  ])

  const year = String(new Date().getFullYear())
  const ytd = rows.filter((r) => r.occurredOn.startsWith(year))
  const ytdCents = ytd.reduce((s, r) => s + r.amountCents, 0)
  const mappedCents = ytd
    .filter((r) => r.clientId)
    .reduce((s, r) => s + r.amountCents, 0)
  const byClient = new Map<string, { name: string; slug: string; cents: number }>()
  for (const r of ytd) {
    if (!r.client) continue
    const cur = byClient.get(r.client.id) ?? { name: r.client.name, slug: r.client.slug, cents: 0 }
    cur.cents += r.amountCents
    byClient.set(r.client.id, cur)
  }

  return (
    <>
      <PageHeader title="Expenses" />

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <SummaryCard label={`${year} total`} value={formatMoney(ytdCents)} sub={plural(ytd.length, "expense")} />
        <SummaryCard
          label="Mapped to client work"
          value={formatMoney(mappedCents)}
          sub={
            byClient.size
              ? Array.from(byClient.values())
                  .map((c) => `${c.name} ${formatMoney(c.cents)}`)
                  .join(" · ")
              : "nothing mapped yet"
          }
        />
        <SummaryCard
          label="Business overhead"
          value={formatMoney(ytdCents - mappedCents)}
          sub="not tied to a specific client"
        />
      </div>

      <Importer clients={clients.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))} />

      <section className="mt-6 rounded-2xl border border-line bg-card p-5 shadow-card">
        <h2 className="text-sm font-semibold text-tk-onyx">Add an expense</h2>
        <form action={addExpense} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <label className="block text-sm">
            <span className="text-xs font-medium text-ink-3">Date</span>
            <input name="occurredOn" type="date" required className="mt-1 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm outline-none focus:border-tk-teal" />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-ink-3">Vendor</span>
            <input name="vendor" required placeholder="Railway, Adobe…" className="mt-1 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm outline-none focus:border-tk-teal" />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-ink-3">Amount</span>
            <input name="amount" required inputMode="decimal" placeholder="20.00" className="mt-1 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm outline-none focus:border-tk-teal" />
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-ink-3">Category</span>
            <select name="category" className="mt-1 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm outline-none focus:border-tk-teal">
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-medium text-ink-3">Client (optional)</span>
            <select name="clientId" className="mt-1 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm outline-none focus:border-tk-teal">
              <option value="">— overhead</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90">
              Add
            </button>
          </div>
          <label className="block text-sm sm:col-span-2 lg:col-span-6">
            <span className="text-xs font-medium text-ink-3">Note (optional)</span>
            <input name="description" placeholder="What was it for?" className="mt-1 w-full rounded-lg border border-line bg-well px-3 py-2 text-sm outline-none focus:border-tk-teal" />
          </label>
        </form>
      </section>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-ink-3">
          No expenses yet. Drop a statement in the importer above, or add one by hand.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
          <ul className="divide-y divide-line">
            {rows.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: e.client ? clientColor(e.client.slug) : "rgba(15,22,21,.25)" }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-tk-onyx">
                    {e.vendor}
                    {e.description ? (
                      <span className="font-normal text-ink-3"> · {e.description}</span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-ink-3">
                    {formatDay(e.occurredOn)} · {e.category}
                  </span>
                </span>
                <span className="text-sm font-semibold tabular-nums text-tk-onyx">
                  {formatMoney(e.amountCents, e.currency)}
                </span>
                <form action={mapExpenseClient} className="flex items-center gap-1.5">
                  <input type="hidden" name="id" value={e.id} />
                  <select
                    name="clientId"
                    defaultValue={e.clientId ?? ""}
                    className="rounded-lg border border-line bg-card px-2 py-1 text-xs outline-none focus:border-tk-teal"
                  >
                    <option value="">overhead</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button type="submit" className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal">
                    Save
                  </button>
                </form>
                <form action={deleteExpense}>
                  <input type="hidden" name="id" value={e.id} />
                  <button type="submit" aria-label={`Delete ${e.vendor} expense`} className="rounded-full px-2 py-1 text-[11px] font-semibold text-ink-3 hover:text-red-700">
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card px-5 py-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-3">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-tk-onyx tabular-nums">{value}</p>
      <p className="mt-1 truncate text-xs text-ink-3">{sub}</p>
    </div>
  )
}
