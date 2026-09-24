import { notFound, redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { projects } from "@/db/schema"
import { ROUTES } from "@/lib/nav"

export const dynamic = "force-dynamic"

/**
 * `/projects/[slug]` — a project's short link. Projects live inside their
 * client since 24 Sep 2026; this finds the client and goes there, keeping
 * the query (a `?peek=`), so links already out in notifications, the Mac
 * widgets and old tabs still land. A 307, not a 308: a project can move
 * to another client, and a cached permanent redirect would not follow it.
 */
export default async function ProjectShortLink(
  props: {
    params: Promise<{ slug: string }>
    searchParams: Promise<Record<string, string | string[] | undefined>>
  }
) {
  const searchParams = await props.searchParams
  const params = await props.params
  const row = await db.query.projects.findFirst({
    where: eq(projects.slug, params.slug),
    columns: { slug: true },
    with: { client: { columns: { slug: true } } },
  })
  if (!row) notFound()
  redirect(`${ROUTES.clientProject(row.client.slug, row.slug)}${queryOf(searchParams)}`)
}

function queryOf(searchParams: Record<string, string | string[] | undefined>) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) query.append(key, v)
  }
  const qs = query.toString()
  return qs ? `?${qs}` : ""
}
