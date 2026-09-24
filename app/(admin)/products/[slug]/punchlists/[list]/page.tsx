import { notFound, redirect } from "next/navigation"
import { PunchlistDetail } from "@/components/punchlist/PunchlistDetail"
import { ROUTES } from "@/lib/nav"
import { loadPunchlist } from "@/lib/punchlists"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { slug: string; list: string } }) {
  const list = await loadPunchlist(params.list)
  return { title: list?.title ?? "Punch list" }
}

/** A punch list in a product's hub — the same page a client's list has, under the product. */
export default async function ProductPunchlistPage({
  params,
  searchParams,
}: {
  /** `slug` is the product (the layout's segment), `list` the punch list. */
  params: { slug: string; list: string }
  searchParams: { state?: string; peek?: string }
}) {
  const list = await loadPunchlist(params.list)
  if (!list || !list.client) notFound()
  // Not a product's list (any more): it lives in its client.
  if (!list.product) redirect(ROUTES.clientPunchlist(list.client.slug, list.slug))
  if (list.product.slug !== params.slug) redirect(ROUTES.productPunchlist(list.product.slug, list.slug))

  return (
    <PunchlistDetail
      list={list}
      base={ROUTES.productPunchlist(list.product.slug, list.slug)}
      back={{ href: ROUTES.productRoom(list.product.slug, "punchlists"), label: "Punch lists" }}
      state={searchParams.state}
      peek={searchParams.peek}
    />
  )
}
