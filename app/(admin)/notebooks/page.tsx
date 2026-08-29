import { asc } from "drizzle-orm"
import Link from "next/link"
import { PageHeader } from "@/components/PageHeader"
import { db } from "@/db"
import { notionLinks } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import { syncNotebook } from "./actions"

export const metadata = { title: "Notebooks" }
export const dynamic = "force-dynamic"

function stamp(date: Date | null) {
  if (!date) return "never"
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export default async function NotebooksPage() {
  const links = await db.query.notionLinks.findMany({
    with: {
      client: { columns: { slug: true, name: true } },
      pages: { columns: { id: true, archived: true, blocks: true } },
      proposals: { columns: { id: true, status: true } },
    },
    orderBy: [asc(notionLinks.createdAt)],
  })

  return (
    <>
      <PageHeader title="Notebooks" />

      {links.length === 0 ? (
        <div className="mt-8 max-w-2xl rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 p-6 text-sm text-tk-slate">
          <p className="font-semibold text-tk-onyx">No notebooks linked yet</p>
          <p className="mt-1.5 text-tk-slate/70">
            Share a client&apos;s Notion notebook with the integration, then link it:{" "}
            <code className="rounded bg-tk-linen px-1 py-0.5 text-xs">
              npm run notion:link -- &lt;clientSlug&gt; &lt;pageId&gt;
            </code>
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {links.map((link) => {
            const live = link.pages.filter((p) => !p.archived)
            const blocks = live.reduce((n, p) => n + p.blocks.length, 0)
            const proposed = link.proposals.filter((p) => p.status === "proposed").length
            return (
              <div
                key={link.id}
                className="flex flex-col rounded-2xl border border-tk-slate/15 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={ROUTES.notebook(link.client?.slug ?? "")}
                      className="block truncate text-base font-semibold text-tk-onyx hover:text-tk-teal"
                    >
                      {link.client?.name ?? "Unknown client"}
                    </Link>
                    <p className="mt-0.5 truncate text-[13px] text-tk-slate/70">
                      {link.title}
                    </p>
                  </div>
                  {link.url ? (
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-[12px] font-semibold text-tk-teal hover:underline"
                    >
                      Notion ↗
                    </a>
                  ) : null}
                </div>

                <div className="mt-4 flex items-baseline gap-4 font-mono text-[11px] text-tk-slate/60">
                  <span>
                    <span className="text-sm font-semibold text-tk-onyx tabular-nums">
                      {live.length}
                    </span>{" "}
                    pages
                  </span>
                  <span>
                    <span className="text-sm font-semibold text-tk-onyx tabular-nums">
                      {blocks}
                    </span>{" "}
                    blocks
                  </span>
                  {proposed > 0 ? (
                    <span className="rounded bg-tk-teal/10 px-1.5 py-0.5 font-semibold text-tk-teal">
                      {proposed} proposed
                    </span>
                  ) : null}
                </div>

                {link.lastError ? (
                  <p className="mt-3 rounded bg-[#B4322A]/10 px-2 py-1 text-[11px] text-[#B4322A]">
                    {link.lastError}
                  </p>
                ) : null}

                <div className="mt-4 flex items-center justify-between border-t border-tk-slate/10 pt-3">
                  <span className="font-mono text-[10.5px] text-tk-slate/45">
                    synced {stamp(link.lastSyncedAt)}
                  </span>
                  <form action={syncNotebook.bind(null, link.id)}>
                    <button
                      type="submit"
                      className="rounded-lg border border-tk-slate/20 px-2.5 py-1 text-[12px] font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
                    >
                      Sync now
                    </button>
                  </form>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
