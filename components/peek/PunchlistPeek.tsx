import Link from "next/link"
import { GonePeek } from "@/components/peek/bits"
import { PunchlistBody } from "@/components/punchlist/PunchlistBody"
import { ROUTES } from "@/lib/nav"
import { loadPunchlist } from "@/lib/punchlists"

/** The list in a slide-over; the full page has the same body plus the source text. */
export async function PunchlistPeek({ slug, base }: { slug: string; base: string }) {
  const list = await loadPunchlist(slug)
  if (!list) return <GonePeek />

  return (
    <>
      <div className="px-6 pt-4">
        <p className="text-base font-semibold text-tk-onyx">{list.title}</p>
        <p className="mt-0.5 text-sm text-tk-slate/70">
          {list.client.name}
          {list.project ? ` · ${list.project.name}` : ""}
        </p>
      </div>
      <PunchlistBody list={list} filter="all" base={base} compact />
      <div className="border-t border-tk-slate/10 px-6 py-3">
        <Link href={ROUTES.punchlist(list.slug)} className="text-xs font-semibold text-tk-teal hover:underline">
          Open full page ↗
        </Link>
      </div>
    </>
  )
}
