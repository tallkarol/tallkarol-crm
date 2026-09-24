import { notFound } from "next/navigation"
import { ProductHeader } from "@/components/products/ProductHeader"
import { ProductPanelMount } from "@/components/products/ProductPanelMount"
import { loadProductPanel, loadProductShell } from "@/lib/product-rooms"

/**
 * Everything inside one product — the client hub's layout for Karol's own
 * products (24 Sep 2026): the panel swaps into product mode, the header names
 * the product, and the room scrolls on its own.
 */
export default async function ProductLayout(
  props: {
    params: Promise<{ slug: string }>
    children: React.ReactNode
  }
) {
  const params = await props.params

  const {
    children
  } = props

  const product = await loadProductShell(params.slug)
  if (!product) notFound()
  const panel = await loadProductPanel(product)

  return (
    <>
      <ProductPanelMount product={product} data={panel} />
      <div className="flex min-h-0 flex-1 flex-col">
        <ProductHeader product={product} />
        <div className="tk-main-scroll min-h-0 flex-1 overflow-y-auto px-4 py-3.5 sm:px-5">{children}</div>
      </div>
    </>
  )
}
