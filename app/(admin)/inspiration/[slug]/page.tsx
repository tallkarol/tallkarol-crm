import Link from "next/link"
import { notFound } from "next/navigation"
import { AddPinForm } from "@/components/inspiration/AddPinForm"
import { PinCard } from "@/components/inspiration/PinCard"
import { PageHeader } from "@/components/PageHeader"
import { loadBoard } from "@/lib/inspiration-data"
import { ROUTES } from "@/lib/nav"
import { plural } from "@/lib/work"

export const dynamic = "force-dynamic"

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}) {
  const board = await loadBoard(params.slug)
  return { title: board ? board.title : "Inspiration" }
}

export default async function InspirationBoardPage({
  params,
}: {
  params: { slug: string }
}) {
  const board = await loadBoard(params.slug)
  if (!board) notFound()

  return (
    <>
      <p className="mb-2 text-[12px] font-semibold text-ink-3">
        <Link href={ROUTES.inspiration} className="hover:text-tk-teal">
          Inspiration
        </Link>
        <span aria-hidden> / </span>
        {board.slug}
      </p>
      <PageHeader title={board.title} />
      <p className="mt-1 text-[11.5px] text-ink-3">
        {board.pins.length === 0
          ? "Empty — pin a link below or send one in chat"
          : plural(board.pins.length, "pin")}
        {board.description ? ` · ${board.description}` : ""}
      </p>

      <div className="mt-6">
        <AddPinForm board={board.title} />
      </div>

      {board.pins.length === 0 ? null : (
        <div className="mt-6 columns-1 gap-4 sm:columns-2 xl:columns-3">
          {board.pins.map((pin) => (
            <PinCard key={pin.id} pin={pin} boardSlug={board.slug} />
          ))}
        </div>
      )}
    </>
  )
}
