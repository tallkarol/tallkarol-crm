import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { ListStatusMenu } from "@/components/punchlist/ListStatusMenu"
import { PunchlistBody } from "@/components/punchlist/PunchlistBody"
import { PunchlistProductSelect } from "@/components/punchlist/PunchlistProductSelect"
import { Card } from "@/components/ui/Card"
import { db } from "@/db"
import type { StateFilter } from "@/lib/punchlist"
import { setListStatusAction } from "@/lib/punchlist-actions"
import type { PunchlistView } from "@/lib/punchlists"

const FILTERS = new Set<StateFilter>(["all", "todo", "doing", "done"])

export function stateFilter(raw: string | undefined): StateFilter {
  return (raw && FILTERS.has(raw as StateFilter) ? raw : "all") as StateFilter
}

/**
 * A punch list's page body, wherever it lives — inside its client, or in a
 * product's hub. The caller decides `base` (the page's own path, which the
 * filters and peeks link back to) and where Back goes.
 */
export async function PunchlistDetail({
  list,
  base,
  back,
  state,
  peek,
}: {
  list: PunchlistView & { client: { slug: string } }
  base: string
  back: { href: string; label: string }
  state?: string
  peek?: string
}) {
  const filter = stateFilter(state)
  const closeHref = filter === "all" ? base : `${base}?state=${filter}`
  const products = await db.query.products.findMany({
    columns: { id: true, name: true, slug: true },
    orderBy: (p, { asc }) => [asc(p.sort), asc(p.name)],
  })

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={back.href} className="inline-flex items-center gap-1.5 text-sm font-semibold text-tk-teal hover:underline">
          <ArrowLeft className="size-3.5" />
          {back.label}
        </Link>
        <span className="flex flex-wrap items-center gap-2">
          <PunchlistProductSelect
            list={{ id: list.id, slug: list.slug, clientSlug: list.client.slug, productId: list.productId }}
            products={products}
          />
          <ListStatusMenu status={list.effectiveStatus} stored={list.status} action={setListStatusAction.bind(null, list.id)} />
        </span>
      </div>

      {peek ? <PeekRouter peek={peek} closeHref={closeHref} /> : null}

      <Card elevation="none" className="mt-4 max-w-4xl overflow-hidden shadow-[0_1px_3px_rgba(15,22,21,.06)]">
        <PunchlistBody list={list} filter={filter} base={base} />
      </Card>
    </>
  )
}
