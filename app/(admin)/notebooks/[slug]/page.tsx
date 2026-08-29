import { asc, eq } from "drizzle-orm"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { db } from "@/db"
import { clients, notionPages } from "@/db/schema"
import type { NotionPage } from "@/db/schema"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { syncNotebook } from "../actions"

export const dynamic = "force-dynamic"

const PREVIEW_CHARS = 4000

function stamp(date: Date | null) {
  if (!date) return "—"
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

/** Depth-first tree order: each page followed by its children. */
function treeOrder(pages: NotionPage[]): { page: NotionPage; depth: number }[] {
  const children = new Map<string, NotionPage[]>()
  for (const page of pages) {
    const list = children.get(page.parentNotionId) ?? []
    list.push(page)
    children.set(page.parentNotionId, list)
  }
  const known = new Set(pages.map((p) => p.notionId))
  const roots = pages.filter((p) => !known.has(p.parentNotionId))
  const out: { page: NotionPage; depth: number }[] = []
  const walk = (page: NotionPage, depth: number) => {
    out.push({ page, depth })
    for (const child of children.get(page.notionId) ?? []) walk(child, depth + 1)
  }
  for (const root of roots) walk(root, 0)
  return out
}

export default async function NotebookPage({
  params,
}: {
  params: { slug: string }
}) {
  const client = await db.query.clients.findFirst({
    where: eq(clients.slug, params.slug),
    with: { notionLinks: true },
  })
  const link = client?.notionLinks?.[0]
  if (!client || !link) notFound()

  const pages = await db.query.notionPages.findMany({
    where: eq(notionPages.linkId, link.id),
    orderBy: [asc(notionPages.title)],
  })
  const live = pages.filter((p) => !p.archived)
  const archived = pages.filter((p) => p.archived)
  const ordered = treeOrder(live)

  return (
    <>
      <PageHeader
        title={`${client.name} — Notebook`}
        actions={
          <>
            {link.url ? (
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-tk-slate/20 px-3 py-1.5 text-[13px] font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
              >
                Open in Notion ↗
              </a>
            ) : null}
            <form action={syncNotebook.bind(null, link.id)}>
              <button
                type="submit"
                className="rounded-lg bg-tk-onyx px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-tk-teal"
              >
                Sync now
              </button>
            </form>
          </>
        }
      />

      <p className="mt-1 font-mono text-[11px] text-tk-slate/50">
        {live.length} pages · synced {stamp(link.lastSyncedAt)} ·{" "}
        <Link href={ROUTES.notebooks} className="text-tk-teal hover:underline">
          all notebooks
        </Link>
      </p>

      {link.lastError ? (
        <p className="mt-3 max-w-2xl rounded bg-[#B4322A]/10 px-3 py-2 text-[12px] text-[#B4322A]">
          Last sync failed: {link.lastError}
        </p>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
        {ordered.map(({ page, depth }) => (
          <details key={page.id} className="group border-b border-tk-slate/[0.07] last:border-0">
            <summary
              className="flex cursor-pointer items-baseline gap-3 px-4 py-2.5 hover:bg-tk-linen/50"
              style={{ paddingLeft: `${16 + depth * 20}px` }}
            >
              <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-tk-onyx">
                {page.title}
              </span>
              <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-tk-slate/45">
                {page.blocks.length} blocks
              </span>
              <span className="w-28 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-tk-slate/45">
                {stamp(page.notionEditedAt)}
              </span>
            </summary>
            <div
              className="border-t border-tk-slate/[0.07] bg-tk-linen/30 px-4 py-3"
              style={{ paddingLeft: `${16 + depth * 20}px` }}
            >
              {page.url ? (
                <a
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[12px] font-semibold text-tk-teal hover:underline"
                >
                  Open in Notion ↗
                </a>
              ) : null}
              <pre
                className={cn(
                  "mt-2 max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-tk-slate",
                  !page.plainText && "italic text-tk-slate/50"
                )}
              >
                {page.plainText
                  ? page.plainText.slice(0, PREVIEW_CHARS) +
                    (page.plainText.length > PREVIEW_CHARS ? "\n…" : "")
                  : "No text content."}
              </pre>
            </div>
          </details>
        ))}
      </div>

      {archived.length > 0 ? (
        <p className="mt-3 font-mono text-[11px] text-tk-slate/45">
          {archived.length} archived page{archived.length === 1 ? "" : "s"} kept for history.
        </p>
      ) : null}
    </>
  )
}
