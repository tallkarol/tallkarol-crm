import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { PeekRouter } from "@/components/peek/PeekRouter"
import { PunchlistBody } from "@/components/punchlist/PunchlistBody"
import { ListStatusMenu } from "@/components/punchlist/ListStatusMenu"
import { ROUTES } from "@/lib/nav"
import type { StateFilter } from "@/lib/punchlist"
import { setListStatusAction } from "@/lib/punchlist-actions"
import { loadPunchlist } from "@/lib/punchlists"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const list = await loadPunchlist(params.slug)
  return { title: list?.title ?? "Punch list" }
}

const FILTERS = new Set<StateFilter>(["all", "todo", "doing", "done"])

export default async function PunchlistPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { state?: string; peek?: string }
}) {
  const list = await loadPunchlist(params.slug)
  if (!list) notFound()

  const filter = (
    searchParams.state && FILTERS.has(searchParams.state as StateFilter)
      ? searchParams.state
      : "all"
  ) as StateFilter
  const base = ROUTES.punchlist(list.slug)
  const closeHref = filter === "all" ? base : `${base}?state=${filter}`

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={ROUTES.punchlists}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-tk-teal hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Punch lists
        </Link>
        <ListStatusMenu
          status={list.effectiveStatus}
          stored={list.status}
          action={setListStatusAction.bind(null, list.id, list.slug)}
        />
      </div>

      {searchParams.peek ? <PeekRouter peek={searchParams.peek} closeHref={closeHref} /> : null}

      <div className="mt-4 max-w-4xl overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-[0_1px_3px_rgba(15,22,21,.06)]">
        <PunchlistBody list={list} filter={filter} base={base} />
      </div>
    </>
  )
}
