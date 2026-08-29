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
import { ago, stamp } from "../format"
import { acceptProposal, dismissProposal, scanNotebook, syncNotebook } from "../actions"

export const dynamic = "force-dynamic"

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
  searchParams,
}: {
  params: { slug: string }
  searchParams: { page?: string }
}) {
  const client = await db.query.clients.findFirst({
    where: eq(clients.slug, params.slug),
    with: { notionLinks: true },
  })
  const link = client?.notionLinks?.[0]
  if (!client || !link) notFound()

  const [pages, proposals] = await Promise.all([
    db.query.notionPages.findMany({
      where: eq(notionPages.linkId, link.id),
      orderBy: [asc(notionPages.title)],
    }),
    db.query.notionProposals.findMany({
      where: and(
        eq(notionProposals.linkId, link.id),
        eq(notionProposals.status, "proposed")
      ),
      with: { page: { columns: { title: true, url: true } } },
      orderBy: [desc(notionProposals.createdAt)],
    }),
  ])

  const live = pages.filter((p) => !p.archived)
  const archived = pages.filter((p) => p.archived)
  const ordered = treeOrder(live)
  const blocks = live.reduce((n, p) => n + p.blocks.length, 0)

  const openPerPage = new Map<string, number>()
  for (const p of proposals) {
    openPerPage.set(p.pageId, (openPerPage.get(p.pageId) ?? 0) + 1)
  }
  const proposalBlockIds = new Set(proposals.map((p) => p.blockId).filter(Boolean))

  const busiest = live
    .filter((p) => openPerPage.has(p.id))
    .sort((a, b) => (openPerPage.get(b.id) ?? 0) - (openPerPage.get(a.id) ?? 0))[0]
  const selected =
    live.find((p) => p.notionId === searchParams.page) ??
    busiest ??
    ordered[0]?.page

  /** Inbox order: keep each page's proposals together, busiest page first. */
  const grouped = [...proposals].sort((a, b) => {
    const diff = (openPerPage.get(b.pageId) ?? 0) - (openPerPage.get(a.pageId) ?? 0)
    return diff !== 0 ? diff : a.pageId.localeCompare(b.pageId)
  })

  return (
    <>
      <p className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-tk-slate/50">
        <Link href={ROUTES.notebooks} className="hover:text-tk-teal">
          Notebooks
        </Link>{" "}
        / {client.name}
      </p>
      <PageHeader
        title={client.name}
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
                Sync
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
        {live.length} pages · {blocks} blocks · synced {ago(link.lastSyncedAt)}
      </p>

      {link.lastError ? (
        <p className="mt-3 max-w-2xl rounded bg-[#B4322A]/10 px-3 py-2 text-[12px] text-[#B4322A]">
          {link.lastError}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-4 xl:flex-row">
        {/* Page tree */}
        <div className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm xl:w-[300px]">
          <div className="border-b border-tk-slate/10 bg-tk-linen/50 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-tk-slate/55">
            Pages
          </div>
          <div className="flex max-h-[520px] flex-col overflow-y-auto p-1.5">
            {ordered.map(({ page, depth }) => {
              const open = openPerPage.get(page.id) ?? 0
              const edited =
                page.notionEditedAt &&
                (!page.scannedAt || page.notionEditedAt > page.scannedAt)
              const active = page.id === selected?.id
              return (
                <Link
                  key={page.id}
                  href={`${ROUTES.notebook(client.slug)}?page=${page.notionId}`}
                  className={cn(
                    "flex items-center justify-between gap-3 rounded-lg px-2.5 py-[7px] text-[13px]",
                    active
                      ? "bg-tk-teal/10 font-semibold text-tk-onyx"
                      : "text-tk-slate hover:bg-tk-linen/60"
                  )}
                  style={{ paddingLeft: `${10 + depth * 16}px` }}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{page.title}</span>
                    {edited ? (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-[#B4790A]"
                        title="Edited since last scan"
                      />
                    ) : null}
                  </span>
                  {open > 0 ? (
                    <span className="shrink-0 font-mono text-[10.5px] font-bold text-tk-teal">
                      {open}
                    </span>
                  ) : null}
                </Link>
              )
            })}
          </div>
          <div className="mt-auto flex items-center gap-3 border-t border-tk-slate/10 px-4 py-2.5">
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-tk-slate/50">
              <span className="size-1.5 rounded-full bg-[#B4790A]" /> edited
              since scan
            </span>
            {proposals.length > 0 ? (
              <span className="font-mono text-[10px] font-bold text-tk-teal">
                {proposals.length} open proposals
              </span>
            ) : null}
          </div>
        </div>

        {/* Inbox + reading pane */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {grouped.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-tk-teal/30 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-tk-teal/20 bg-tk-teal/[0.06] px-4 py-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-tk-teal">
                  Proposed actionables
                </span>
                <span className="font-mono text-[10px] text-tk-slate/50">
                  {grouped.length} open · accepted become client tasks
                </span>
              </div>
              {grouped.map((p) => (
                <div
                  key={p.id}
                  className="flex items-start justify-between gap-5 border-b border-tk-slate/[0.07] px-4 py-3.5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-semibold text-tk-onyx">
                      {p.title}
                    </p>
                    {p.detail ? (
                      <p className="mt-0.5 text-[12.5px] text-tk-slate/80">
                        {p.detail}
                      </p>
                    ) : null}
                    {p.quote ? (
                      <p className="mt-1.5 border-l-2 border-tk-teal/35 pl-2 text-[12px] italic text-tk-slate/60">
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
                        className="rounded-lg bg-tk-onyx px-3 py-1 text-[12px] font-semibold text-white hover:bg-tk-teal"
                      >
                        Accept
                      </button>
                    </form>
                    <form action={dismissProposal.bind(null, p.id)}>
                      <button
                        type="submit"
                        className="rounded-lg border border-tk-slate/20 px-3 py-1 text-[12px] font-semibold text-tk-slate/70 hover:border-tk-slate/40"
                      >
                        Dismiss
                      </button>
                    </form>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-end bg-tk-linen/40 px-4 py-1.5">
                <span className="font-mono text-[10px] text-tk-slate/45">
                  accepted → Tasks, tagged source: notion
                </span>
              </div>
            </div>
          ) : null}

          {selected ? (
            <div className="flex flex-col overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-tk-slate/10 bg-tk-linen/50 px-4 py-2">
                <span className="text-[13px] font-semibold text-tk-onyx">
                  {selected.title}
                </span>
                <span className="font-mono text-[10px] text-tk-slate/50">
                  {selected.blocks.length} blocks · edited{" "}
                  {stamp(selected.notionEditedAt)} ·{" "}
                  {selected.url ? (
                    <a
                      href={selected.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-tk-teal hover:underline"
                    >
                      open in Notion ↗
                    </a>
                  ) : null}
                </span>
              </div>
              <div className="max-h-[480px] overflow-y-auto px-5 py-4 text-[13px] leading-relaxed text-tk-slate">
                {selected.blocks.filter((b) => b.text.trim()).length === 0 ? (
                  <p className="italic text-tk-slate/50">No text content.</p>
                ) : (
                  selected.blocks
                    .filter((b) => b.text.trim())
                    .map((b) => (
                      <p
                        key={b.id}
                        className={cn(
                          "my-1",
                          b.type.startsWith("heading") && "font-semibold text-tk-onyx",
                          b.type === "to_do" && b.checked && "text-tk-slate/45 line-through",
                          proposalBlockIds.has(b.id) &&
                            "rounded-md bg-tk-teal/[0.07] px-1.5 py-0.5"
                        )}
                        style={{ marginLeft: `${b.depth * 16}px` }}
                      >
                        {b.type === "to_do" ? (
                          <span
                            className={cn(
                              "mr-1.5 inline-block size-3 -mb-px rounded-[3px] border",
                              b.checked
                                ? "border-tk-teal bg-tk-teal"
                                : "border-tk-slate/35"
                            )}
                          />
                        ) : null}
                        {b.text}
                        {proposalBlockIds.has(b.id) ? (
                          <span className="ml-1.5 font-mono text-[9.5px] font-bold text-tk-teal">
                            ← proposal
                          </span>
                        ) : null}
                      </p>
                    ))
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {archived.length > 0 ? (
        <p className="mt-3 font-mono text-[11px] text-tk-slate/45">
          {archived.length} archived page{archived.length === 1 ? "" : "s"} kept
          for history.
        </p>
      ) : null}
    </>
  )
}
