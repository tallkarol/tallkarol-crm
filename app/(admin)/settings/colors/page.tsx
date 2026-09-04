import { PageHeader } from "@/components/PageHeader"
import { ColorGrid } from "@/components/settings/ColorGrid"
import { CLIENT_COLORS } from "@/lib/client-colors"
import { getColorOverrides } from "@/lib/client-colors-store"
import { db } from "@/db"

export const metadata = { title: "Colours" }
export const dynamic = "force-dynamic"

/**
 * Every accent in one place, deliberately.
 *
 * These colours only work if they stay distinguishable from each other, so the
 * page lists them together rather than hiding one behind each client — you
 * cannot tell that two greens collide by looking at one of them.
 */
export default async function ColorSettingsPage() {
  const [clients, products, overrides] = await Promise.all([
    db.query.clients.findMany({
      columns: { name: true, slug: true },
      orderBy: (c, { asc }) => [asc(c.name)],
    }),
    db.query.products.findMany({
      columns: { name: true, slug: true },
      orderBy: (p, { asc }) => [asc(p.name)],
    }),
    getColorOverrides(),
  ])

  // Anything with a hand-picked default but no row of its own still belongs
  // here — the palette predates some of these records.
  const known = new Set([...clients, ...products].map((r) => r.slug))
  const orphans = Object.keys(CLIENT_COLORS)
    .filter((slug) => !known.has(slug))
    .map((slug) => ({ name: slug, slug }))

  return (
    <>
      <PageHeader title="Colours" />

      <p className="mt-2 max-w-2xl text-sm text-ink-3">
        The accent behind every client and product — used across lists, boards,
        meters, and the macOS widgets. Leave one unset to keep its default.
      </p>

      <ColorGrid
        groups={[
          { label: "Clients", rows: clients },
          { label: "Products", rows: products },
          ...(orphans.length ? [{ label: "Unlinked", rows: orphans }] : []),
        ]}
        overrides={overrides}
        defaults={CLIENT_COLORS}
      />
    </>
  )
}
