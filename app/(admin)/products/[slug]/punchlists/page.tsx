import { notFound } from "next/navigation"
import { PunchlistList } from "@/components/punchlist/PunchlistList"
import { loadProductShell } from "@/lib/product-rooms"
import { punchlistsFor } from "@/lib/punchlists"

export const dynamic = "force-dynamic"

export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const product = await loadProductShell(params.slug)
  return { title: product ? `${product.name} · Punch lists` : params.slug }
}

/**
 * The Punch lists room: every list filed to the product. A list joins a
 * product when the /punchlist skill names one (`productSlug`), or from the
 * Product select on the list's own page.
 */
export default async function ProductPunchlistsPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params
  const product = await loadProductShell(params.slug)
  if (!product) notFound()
  const lists = await punchlistsFor({ productId: product.id })

  return (
    <section className="flex flex-col gap-2">
      <h2 className="flex items-baseline justify-between px-0.5 text-[13px] font-bold text-tk-onyx">
        Punch lists
        <span className="font-ui text-[11px] font-medium text-ink-3">{lists.length || "none yet"}</span>
      </h2>
      {lists.length > 0 ? (
        <PunchlistList rows={lists} />
      ) : (
        <p className="rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-3">
          No punch lists on {product.name} yet. Name the product when you make one with /punchlist, or pick {product.name} under
          Product on an existing list.
        </p>
      )}
    </section>
  )
}
