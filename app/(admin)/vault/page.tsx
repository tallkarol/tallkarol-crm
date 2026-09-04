import { asc } from "drizzle-orm"
import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { VaultComposer } from "@/components/vault/VaultComposer"
import { VaultRow } from "@/components/vault/VaultRow"
import { db } from "@/db"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { filterVaultEntries, groupVaultEntries } from "@/lib/vault"
import { listVaultEntries } from "@/lib/vault-data"
import { plural } from "@/lib/work"

export const metadata = { title: "Vault" }
export const dynamic = "force-dynamic"

export default async function VaultPage({
  searchParams,
}: {
  searchParams: { q?: string; client?: string }
}) {
  const q = searchParams.q?.trim() ?? ""
  const clientSlug = searchParams.client?.trim() ?? ""
  const [entries, clients] = await Promise.all([
    listVaultEntries(),
    db.query.clients.findMany({
      columns: { id: true, name: true, slug: true },
      orderBy: (c) => [asc(c.name)],
    }),
  ])

  const shown = filterVaultEntries(entries, q, clientSlug)
  const groups = groupVaultEntries(shown)
  const workspaceCount = entries.filter((entry) => !entry.client).length
  const clientOptions = [
    { slug: "", label: "All", count: entries.length },
    { slug: "workspace", label: "Workspace", count: workspaceCount },
    ...clients
      .map((client) => ({
        slug: client.slug,
        label: client.name,
        count: entries.filter((entry) => entry.client?.id === client.id).length,
      }))
      .filter((option) => option.count > 0),
  ].filter((option) => option.slug === "" || option.count > 0)

  return (
    <>
      <PageHeader title="Vault" />
      <p className="mt-1 text-[11.5px] text-ink-3">
        {plural(entries.length, "credential")}
        {q || clientSlug
          ? ` · showing ${shown.length}`
          : " · secrets stay encrypted until you copy or reveal them"}
      </p>

      <VaultComposer
        clients={clients.map((client) => ({ id: client.id, name: client.name }))}
      />

      <form
        action={ROUTES.vault}
        method="get"
        className="mt-6 flex flex-wrap items-center gap-2"
      >
        {clientSlug ? <input type="hidden" name="client" value={clientSlug} /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search title, user, URL, note…"
          className="min-w-[16rem] flex-1 rounded-lg border border-line bg-card px-3 py-2 text-sm outline-none focus:border-tk-teal"
        />
        <button
          type="submit"
          className="rounded-lg border border-line px-3 py-2 text-[13px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
        >
          Search
        </button>
        {q ? (
          <Link
            href={clientSlug ? `${ROUTES.vault}?client=${clientSlug}` : ROUTES.vault}
            className="text-[13px] font-semibold text-tk-teal hover:underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {clientOptions.length > 1 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {clientOptions.map((option) => {
            const href = option.slug
              ? q
                ? `${ROUTES.vault}?client=${option.slug}&q=${encodeURIComponent(q)}`
                : `${ROUTES.vault}?client=${option.slug}`
              : q
                ? `${ROUTES.vault}?q=${encodeURIComponent(q)}`
                : ROUTES.vault
            const active = option.slug === clientSlug
            return (
              <Link
                key={option.slug || "all"}
                href={href}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[12px] font-semibold",
                  active
                    ? "border-ink bg-ink text-canvas"
                    : "border-line bg-card text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
                )}
              >
                <span
                  className="mr-1.5 inline-block size-1.5 rounded-full"
                  style={{
                    background: option.slug && option.slug !== "workspace"
                      ? clientColor(option.slug)
                      : active
                        ? "#fff"
                        : "rgba(15,22,21,.25)",
                  }}
                />
                {option.label}
                <span className="ml-1 tabular-nums text-[11px] opacity-70">
                  {option.count}
                </span>
              </Link>
            )
          })}
        </div>
      ) : null}

      {shown.length === 0 ? (
        <p className="mt-8 text-sm text-ink-3">
          {entries.length === 0
            ? "Nothing stored yet. Save the first login or key in the form above."
            : "Nothing matches that search."}
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key}>
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <h2 className="font-['Inter_Tight',sans-serif] text-lg font-bold tracking-tight text-tk-onyx">
                  {group.label}
                </h2>
                <p className="text-[11px] tabular-nums text-ink-3">
                  {plural(group.entries.length, "entry")}
                </p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
                <ul className="divide-y divide-line">
                  {group.entries.map((entry) => (
                    <VaultRow
                      key={entry.id}
                      entry={entry}
                      clients={clients.map((client) => ({
                        id: client.id,
                        name: client.name,
                      }))}
                    />
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  )
}
