import { asc } from "drizzle-orm"
import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { db } from "@/db"
import { notionLinks } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { unlinkedSharedPages } from "@/lib/notion"
import { ago } from "./format"
import { linkNotebook, scanAllNotebooks, syncAllNotebooks } from "./actions"
import { Card } from "@/components/ui/Card"

export const metadata = { title: "Notebooks" }
export const dynamic = "force-dynamic"

const FRESH_MS = 6 * 60 * 60 * 1000

export default async function NotebooksPage() {
  const [links, discovered] = await Promise.all([
    db.query.notionLinks.findMany({
      with: {
        client: { columns: { slug: true, name: true } },
        pages: {
          columns: { id: true, title: true, archived: true, blocks: true },
        },
        proposals: { columns: { id: true, status: true, pageId: true } },
      },
      orderBy: [asc(notionLinks.createdAt)],
    }),
    unlinkedSharedPages(),
  ])

  const totalProposed = links.reduce(
    (n, l) => n + l.proposals.filter((p) => p.status === "proposed").length,
    0
  )
  const busiest = [...links].sort(
    (a, b) =>
      b.proposals.filter((p) => p.status === "proposed").length -
      a.proposals.filter((p) => p.status === "proposed").length
  )[0]

  /** Page titles carrying open proposals, across every notebook. */
  const hotPages = links
    .flatMap((l) => {
      const counts = new Map<string, number>()
      for (const p of l.proposals) {
        if (p.status === "proposed") {
          counts.set(p.pageId, (counts.get(p.pageId) ?? 0) + 1)
        }
      }
      return l.pages
        .filter((page) => counts.has(page.id))
        .map((page) => page.title)
    })
    .slice(0, 3)

  return (
    <>
      <PageHeader
        title="Notebooks"
        actions={
          links.length > 0 ? (
            <>
              <form action={syncAllNotebooks}>
                <button
                  type="submit"
                  className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
                >
                  Sync all
                </button>
              </form>
              <form action={scanAllNotebooks}>
                <button
                  type="submit"
                  className="rounded-lg bg-tk-onyx px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-accent"
                >
                  Scan all
                </button>
              </form>
            </>
          ) : undefined
        }
      />

      {totalProposed > 0 && busiest?.client ? (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-accent p-5 text-tk-linen">
          <div>
            <p className="text-[15px] font-semibold">
              {totalProposed} actionable{totalProposed === 1 ? "" : "s"} waiting
              for review
            </p>
            <p className="mt-0.5 text-[12.5px] text-tk-linen/75">
              Found across {hotPages.join(", ")}
            </p>
          </div>
          <Link
            href={ROUTES.notebook(busiest.client.slug)}
            className="rounded-lg bg-well px-3.5 py-1.5 text-[13px] font-bold text-tk-teal hover:bg-card"
          >
            Review inbox →
          </Link>
        </div>
      ) : null}

      {links.length === 0 && discovered.matched.length === 0 ? (
        <Card surface="well" elevation="none" className="mt-8 max-w-2xl border-dashed p-6 text-sm text-tk-slate">
          <p className="font-semibold text-tk-onyx">No notebooks linked yet</p>
          <p className="mt-1.5 text-ink-3">
            Share a client&apos;s Notion notebook with the integration and it
            appears here, or link one directly:{" "}
            <code className="rounded bg-well px-1 py-0.5 text-xs">
              npm run notion:link -- &lt;clientSlug&gt; &lt;pageId&gt;
            </code>
          </p>
        </Card>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {links.map((link) => {
            const live = link.pages.filter((p) => !p.archived)
            const blocks = live.reduce((n, p) => n + p.blocks.length, 0)
            const open = link.proposals.filter((p) => p.status === "proposed")
            const perPage = new Map<string, number>()
            for (const p of open) {
              perPage.set(p.pageId, (perPage.get(p.pageId) ?? 0) + 1)
            }
            const topPages = live
              .filter((p) => perPage.has(p.id))
              .sort((a, b) => (perPage.get(b.id) ?? 0) - (perPage.get(a.id) ?? 0))
              .slice(0, 3)
            const fresh =
              link.lastSyncedAt &&
              Date.now() - link.lastSyncedAt.getTime() < FRESH_MS
            return (
              <Card className="flex flex-col p-5" key={link.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={ROUTES.notebook(link.client?.slug ?? "")}
                      className="block truncate text-base font-semibold text-tk-onyx hover:text-tk-teal"
                    >
                      {link.client?.name ?? "Unknown client"}
                    </Link>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">
                      {link.client?.slug} · {live.length} pages · {blocks} blocks
                    </p>
                  </div>
                  {open.length > 0 ? (
                    <span className="shrink-0 rounded-full bg-tk-teal/10 px-2.5 py-0.5 text-[12px] font-bold text-tk-teal">
                      {open.length} proposed
                    </span>
                  ) : null}
                </div>

                {topPages.length > 0 ? (
                  <div className="mt-3.5 flex flex-col gap-1.5">
                    {topPages.map((page) => (
                      <div
                        key={page.id}
                        className="flex items-center justify-between gap-3 text-[12.5px] text-tk-slate"
                      >
                        <span className="truncate">{page.title}</span>
                        <span className="shrink-0 font-mono text-[10.5px] font-semibold text-tk-teal">
                          {perPage.get(page.id)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {link.lastError ? (
                  <p className="mt-3 rounded bg-bad-soft px-2 py-1 text-[11px] text-bad">
                    {link.lastError}
                  </p>
                ) : null}

                <div className="mt-auto flex items-center justify-between border-t border-line pt-3.5">
                  <span className="flex items-center gap-1.5 font-mono text-[10.5px] text-ink-3">
                    <span
                      className={`size-1.5 rounded-full ${fresh ? "bg-good" : "bg-warn"}`}
                    />
                    synced {ago(link.lastSyncedAt)}
                  </span>
                  <Link
                    href={ROUTES.notebook(link.client?.slug ?? "")}
                    className="text-[12px] font-semibold text-tk-teal hover:underline"
                  >
                    Open →
                  </Link>
                </div>
              </Card>
            )
          })}

          {discovered.matched.map((page) => (
            <div
              key={page.id}
              className="flex flex-col items-start justify-between rounded-2xl border border-dashed border-line-strong bg-well p-5"
            >
              <div>
                <p className="text-base font-semibold text-tk-slate">
                  {page.clientName}
                </p>
                <p className="mt-1 text-[12.5px] text-ink-3">
                  &ldquo;{page.title}&rdquo; is shared with the integration but
                  not linked yet.
                </p>
              </div>
              <form action={linkNotebook.bind(null, page.id, page.clientId)}>
                <button
                  type="submit"
                  className="mt-4 rounded-lg border border-tk-teal/40 px-3 py-1.5 text-[13px] font-semibold text-tk-teal hover:bg-tk-teal/5"
                >
                  Connect notebook
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {discovered.unmatched > 0 ? (
        <p className="mt-4 font-mono text-[10.5px] text-ink-3">
          {discovered.unmatched} more shared top-level pages without a matching
          client · link one with npm run notion:link
        </p>
      ) : null}
    </>
  )
}
