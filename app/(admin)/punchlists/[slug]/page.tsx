import { notFound, redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { punchlists } from "@/db/schema"
import { ROUTES } from "@/lib/nav"

export const dynamic = "force-dynamic"

/**
 * `/punchlists/[slug]` — a punch list's short link. Punch lists live inside
 * their client since 24 Sep 2026; this finds the client and goes there,
 * keeping the query (`?peek=run:…`, `?state=`), so links already out in
 * notifications, the Mac widgets and push still land. A 307, as for projects.
 */
export default async function PunchlistShortLink(
  props: {
    params: Promise<{ slug: string }>
    searchParams: Promise<Record<string, string | string[] | undefined>>
  }
) {
  const searchParams = await props.searchParams
  const params = await props.params
  const row = await db.query.punchlists.findFirst({
    where: eq(punchlists.slug, params.slug),
    columns: { slug: true },
    with: { client: { columns: { slug: true } }, product: { columns: { slug: true } } },
  })
  if (!row) notFound()
  // A product's list lives in the product's hub; every other list in its client.
  if (row.product) redirect(`${ROUTES.productPunchlist(row.product.slug, row.slug)}${queryOf(searchParams)}`)
  if (!row.client) notFound()
  redirect(`${ROUTES.clientPunchlist(row.client.slug, row.slug)}${queryOf(searchParams)}`)
}

function queryOf(searchParams: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v)
  }
  const qs = query.toString()
  return qs ? `?${qs}` : ""
}
