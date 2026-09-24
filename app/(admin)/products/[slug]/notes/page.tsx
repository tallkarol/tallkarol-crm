import { notFound } from "next/navigation"
import { MeetingNoteList } from "@/components/meeting-notes/MeetingNoteList"
import { Card } from "@/components/ui/Card"
import { db } from "@/db"
import { notesForProduct } from "@/lib/meeting-notes"
import { loadProductShell } from "@/lib/product-rooms"
import { setProductNotes } from "../../actions"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const product = await loadProductShell(params.slug)
  return { title: product ? `${product.name} · Notes` : params.slug }
}

/**
 * The Notes room: the product's own running notes, and every meeting note
 * filed to it. A meeting note joins a product from its own page — the
 * Product select beside Client and Project.
 */
export default async function ProductNotesPage({ params }: { params: { slug: string } }) {
  const product = await loadProductShell(params.slug)
  if (!product) notFound()
  const [row, meetings] = await Promise.all([
    db.query.products.findFirst({ where: (p, { eq }) => eq(p.id, product.id), columns: { notes: true } }),
    notesForProduct(product.id),
  ])

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[1fr_1.2fr]">
      <Card className="p-5">
        <h2 className="text-[13px] font-bold text-tk-onyx">Notes</h2>
        <form action={setProductNotes} className="mt-2">
          <input type="hidden" name="productId" value={product.id} />
          <textarea
            name="notes"
            defaultValue={row?.notes ?? ""}
            rows={12}
            aria-label={`Notes on ${product.name}`}
            className="w-full resize-y rounded-lg border border-line bg-well px-3 py-2 text-sm text-tk-slate focus:border-tk-teal"
          />
          <button className="mt-2 rounded-full border border-line px-3 py-1 text-xs font-semibold text-tk-slate transition-[transform,box-shadow,border-color,color] duration-150 hover:-translate-y-px hover:border-line-strong hover:text-tk-teal motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            Save notes
          </button>
        </form>
      </Card>

      <section className="flex min-w-0 flex-col gap-2">
        <h2 className="flex items-baseline justify-between px-0.5 text-[13px] font-bold text-tk-onyx">
          Meeting notes
          <span className="font-ui text-[11px] font-medium text-ink-3">{meetings.length || "none yet"}</span>
        </h2>
        {meetings.length > 0 ? (
          <MeetingNoteList rows={meetings} />
        ) : (
          <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-3">
            No meeting notes on {product.name} yet. Open a note and pick {product.name} under Product to file it here.
          </p>
        )}
      </section>
    </div>
  )
}
