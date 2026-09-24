import { notFound, redirect } from "next/navigation"
import { PunchlistDetail } from "@/components/punchlist/PunchlistDetail"
import { ROUTES } from "@/lib/nav"
import { loadPunchlist } from "@/lib/punchlists"

export const dynamic = "force-dynamic"

export async function generateMetadata(props: { params: Promise<{ slug: string; list: string }> }) {
  const params = await props.params
  const list = await loadPunchlist(params.list)
  return { title: list?.title ?? "Punch list" }
}

/** A punch list inside its client (a product's list lives in the product's hub instead). */
export default async function PunchlistPage(
  props: {
    /** `slug` is the client (the layout's segment), `list` the punch list. */
    params: Promise<{ slug: string; list: string }>
    searchParams: Promise<{ state?: string; peek?: string }>
  }
) {
  const searchParams = await props.searchParams
  const params = await props.params
  const list = await loadPunchlist(params.list)
  if (!list || !list.client) notFound()
  if (list.product) redirect(ROUTES.productPunchlist(list.product.slug, list.slug))
  // A list lives under its own client; a URL naming another one is fixed, not honoured.
  if (list.client.slug !== params.slug) redirect(ROUTES.clientPunchlist(list.client.slug, list.slug))

  return (
    <PunchlistDetail
      list={list}
      base={ROUTES.clientPunchlist(list.client.slug, list.slug)}
      back={{ href: ROUTES.clientRoom(list.client.slug, "dashboards"), label: "Punch lists" }}
      state={searchParams.state}
      peek={searchParams.peek}
    />
  )
}
