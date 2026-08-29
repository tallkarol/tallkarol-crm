import { and, asc, desc, eq } from "drizzle-orm"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { db } from "@/db"
import { clients, notionPages, notionProposals } from "@/db/schema"
import type { NotionPage } from "@/db/schema"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { blockDeepLink } from "@/lib/notion-scan"
import { acceptProposal, dismissProposal, scanNotebook, syncNotebook } from "../actions"

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
  const proposals = await db.query.notionProposals.findMany({
    where: and(
      eq(notionProposals.linkId, link.id),
      eq(notionProposals.status, "proposed")
    ),
    with: { page: { columns: { title: true, url: true } } },
    orderBy: [desc(notionProposals.createdAt)],
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
                className="rounded-lg border border-tk-slate/20 px-3 py-1.5 text-[13px] font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
              >
                Sync now
              </button>
            </form>
            <form action={scanNotebook.bind(null, link.id)}>
              <button
                type="submit"
                className="rounded-lg bg-tk-onyx px-3 py-1.5 text-[13px] font-semibold text-white hover:bg-tk-teal"
              >
                Scan for actionables
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

      {proposals.length > 0 ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-tk-teal/30 bg-white shadow-sm">
          <div className="border-b border-tk-teal/20 bg-tk-teal/[0.06] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-tk-teal">
            Proposed actionables
            <span className="float-right tabular-nums">{proposals.length}</span>
          </div>
          {proposals.map((p) => (
            <div
              key={p.id}
              className="border-b border-tk-slate/[0.07] px-4 py-3 last:border-0"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-tk-onyx">{p.title}</p>
                  {p.detail ? (
                    <p className="mt-0.5 text-[12.5px] text-tk-slate/80">{p.detail}</p>
                  ) : null}
                  {p.quote ? (
                    <p className="mt-1.5 border-l-2 border-tk-slate/20 pl-2 text-[12px] italic text-tk-slate/60">
                      “{p.quote}”
                    </p>
                  ) : null}
                  <a
                    href={blockDeepLink(p.page?.url ?? "", p.blockId)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block font-mono text-[10.5px] text-tk-teal hover:underline"
                  >
                    {p.page?.title ?? "source"} ↗
                  </a>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <form action={acceptProposal.bind(null, p.id)}>
                    <button
                      type="submit"
                      className="rounded-lg bg-tk-onyx px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-tk-teal"
                    >
                      Accept
                    </button>
                  </form>
                  <form action={dismissProposal.bind(null, p.id)}>
                    <button
                      type="submit"
                      className="rounded-lg border border-tk-slate/20 px-2.5 py-1 text-[12px] font-semibold text-tk-slate/70 hover:border-tk-slate/40"
                    >
                      Dismiss
                    </button>
                  </form>
                </div>
              </div>
            </div>
          ))}
        </div>
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
