import Link from "next/link"
import { notFound } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { PageHeader } from "@/components/PageHeader"
import { SpecSheet } from "@/components/codebases/SpecSheet"
import { RenderedDoc } from "@/components/codebases/RenderedDoc"
import { DOC_KIND_LABEL, DOC_KINDS, docHistory, latestDoc, latestDocsFor } from "@/lib/codebase-docs"
import { ROUTES } from "@/lib/nav"
import { Card } from "@/components/ui/Card"

export const dynamic = "force-dynamic"

/**
 * One codebase of a client: the latest sheet of each kind the tools have
 * produced, the spec sheet rendered in full, and the run history behind it.
 */
export default async function CodebasePage({
  params,
  searchParams,
}: {
  params: { slug: string; codebase: string }
  searchParams: { kind?: string; view?: string }
}) {
  const client = await db.query.clients.findFirst({ where: eq(clients.slug, params.slug) })
  if (!client) notFound()

  const kind = (DOC_KINDS as readonly string[]).includes(searchParams.kind ?? "") ? (searchParams.kind as string) : "spec"
  const [docs, doc] = await Promise.all([
    latestDocsFor(client.id),
    latestDoc(client.id, params.codebase, kind),
  ])
  const mine = docs.filter((d) => d.codebase === params.codebase)
  if (mine.length === 0) notFound()
  const history = await docHistory(client.id, params.codebase, kind)
  const title = mine.find((d) => d.title)?.title || params.codebase

  return (
    <>
      <Link href={ROUTES.client(client.slug)} className="text-sm font-semibold text-tk-teal hover:underline">
        ← {client.name}
      </Link>
      <div className="mt-3">
        <PageHeader title={title} />
      </div>
      <p className="mt-1 font-mono text-xs text-ink-3">
        {client.slug} / {params.codebase}
      </p>

      <nav className="mt-4 flex flex-wrap gap-1.5">
        {DOC_KINDS.map((k) => {
          const has = mine.some((d) => d.kind === k)
          const active = k === kind
          return (
            <Link
              key={k}
              href={has ? `${ROUTES.client(client.slug)}/codebases/${params.codebase}?kind=${k}` : "#"}
              aria-disabled={!has}
              className={
                active
                  ? "rounded-full bg-tk-onyx px-3 py-1 text-xs font-semibold text-tk-linen"
                  : has
                    ? "rounded-full border border-line px-3 py-1 text-xs font-semibold text-tk-onyx hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                    : "rounded-full border border-dashed border-line px-3 py-1 text-xs text-ink-3"
              }
            >
              {DOC_KIND_LABEL[k]}
              {!has ? " · not generated" : ""}
            </Link>
          )
        })}
      </nav>

      {doc ? (
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.7fr_1fr]">
          <div className="min-w-0">
            {kind === "spec" ? (
              <SpecSheet data={doc.data as Record<string, unknown>} />
            ) : kind === "launch-audit" && (doc.data as { html?: { handoff?: string; internal?: string } }).html ? (
              <RenderedDoc
                html={(doc.data as { html: { handoff?: string; internal?: string } }).html}
                view={searchParams.view === "internal" ? "internal" : "handoff"}
                base={`${ROUTES.client(client.slug)}/codebases/${params.codebase}?kind=${kind}`}
              />
            ) : (
              <pre className="overflow-x-auto rounded-2xl border border-line bg-card p-5 text-xs shadow-card">
                {JSON.stringify(doc.data, null, 2)}
              </pre>
            )}
          </div>
          <aside className="flex flex-col gap-4">
            <Card className="px-5 py-4">
              <h2 className="text-[13px] font-bold text-tk-onyx">This run</h2>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-ink-3">generated</dt>
                <dd className="text-tk-onyx">{doc.generatedAt.toISOString().replace("T", " ").slice(0, 16)} UTC</dd>
                <dt className="text-ink-3">commit</dt>
                <dd className="font-mono text-tk-onyx">{doc.commitHash ? doc.commitHash.slice(0, 10) : "—"}{doc.branch ? ` · ${doc.branch}` : ""}</dd>
                <dt className="text-ink-3">tool</dt>
                <dd className="text-tk-onyx">{doc.tool || "—"}</dd>
                <dt className="text-ink-3">scanned at</dt>
                <dd className="break-all font-mono text-tk-onyx">{doc.sourcePath || "—"}</dd>
                <dt className="text-ink-3">contract</dt>
                <dd className="text-tk-onyx">{doc.kind} v{doc.schemaVersion}</dd>
              </dl>
            </Card>
            <Card className="px-5 py-4">
              <h2 className="text-[13px] font-bold text-tk-onyx">History</h2>
              <ul className="mt-2 divide-y divide-line text-xs">
                {history.map((h) => (
                  <li key={h.id} className="flex items-baseline justify-between gap-2 py-1.5 first:pt-0 last:pb-0">
                    <span className="text-tk-onyx">{h.generatedAt.toISOString().slice(0, 10)}</span>
                    <span className="font-mono text-ink-3">{h.commitHash ? h.commitHash.slice(0, 7) : "—"}</span>
                    <span className="min-w-0 flex-1 truncate text-right text-ink-3">{h.summary}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-ink-3">A rerun on the same commit with nothing changed adds no row.</p>
            </Card>
          </aside>
        </div>
      ) : (
        <p className="mt-6 text-sm text-ink-3">No {DOC_KIND_LABEL[kind as keyof typeof DOC_KIND_LABEL]} for this codebase yet.</p>
      )}
    </>
  )
}
