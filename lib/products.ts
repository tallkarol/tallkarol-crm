import { db } from "@/db"
import type { ProductStudioKind } from "@/db/schema"
import { readLinks } from "@/lib/engagements"
import type { HubTask } from "@/lib/task-view"

export type ProductListItem = {
  id: string
  name: string
  slug: string
  tagline: string
  status: "idea" | "building" | "live" | "paused"
  sort: number
  notes: string
  linkCount: number
  updatedAt: Date
  clientId: string | null
  clientName: string | null
  clientSlug: string | null
}

export type StudioWithProducts = {
  id: string
  name: string
  slug: string
  kind: ProductStudioKind
  notes: string
  sort: number
  products: ProductListItem[]
}

export async function studiosWithProducts(): Promise<StudioWithProducts[]> {
  const rows = await db.query.productStudios.findMany({
    with: { products: { with: { client: true } } },
    orderBy: (s, { asc }) => [asc(s.sort), asc(s.name)],
  })

  return rows.map((studio) => ({
    id: studio.id,
    name: studio.name,
    slug: studio.slug,
    kind: studio.kind,
    notes: studio.notes,
    sort: studio.sort,
    products: [...studio.products]
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      .map((product) => ({
        id: product.id,
        name: product.name,
        slug: product.slug,
        tagline: product.tagline,
        status: product.status,
        sort: product.sort,
        notes: product.notes,
        linkCount: readLinks(product.links).length,
        updatedAt: product.updatedAt,
        clientId: product.clientId,
        clientName: product.client?.name ?? null,
        clientSlug: product.client?.slug ?? null,
      })),
  }))
}

export function flattenProducts(studios: StudioWithProducts[]): ProductListItem[] {
  return studios.flatMap((studio) => studio.products)
}

/** Highest-priority open task, due dates first — what the card should name. */
export function nextProductTask(tasks: HubTask[]): HubTask | null {
  const open = tasks.filter((task) => task.status === "open")
  if (open.length === 0) return null
  return [...open].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    if (a.dueOn && b.dueOn) return a.dueOn.localeCompare(b.dueOn)
    if (a.dueOn) return -1
    if (b.dueOn) return 1
    return 0
  })[0]
}
