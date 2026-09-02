import Link from "next/link"
import type { Client, Site } from "@/db/schema"
import { isHouseSite } from "@/lib/insights/crm"
import { cn } from "@/lib/cn"

function domain(origin: string) {
  return origin.replace(/^https?:\/\//, "").replace(/^www\./, "")
}

/**
 * The spine of the hub: one chip per property, house first, grouped under the
 * client each belongs to. Adding a property is still a CLI job on purpose —
 * granting the service account comes first (see the Health tab).
 */
export function ClientRail({
  sites,
  activeSlug,
  hrefFor = (slug) => `/insights/${slug}`,
  showAdd = true,
}: {
  sites: (Site & { client: Client | null })[]
  activeSlug: string
  hrefFor?: (slug: string) => string
  showAdd?: boolean
}) {
  const ordered = [...sites].sort((a, b) => {
    const houseA = isHouseSite(a) ? 0 : 1
    const houseB = isHouseSite(b) ? 0 : 1
    if (houseA !== houseB) return houseA - houseB
    return a.sort - b.sort || a.name.localeCompare(b.name)
  })

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {ordered.map((site) => {
        const active = site.slug === activeSlug
        const house = isHouseSite(site)
        const title = house ? site.name.toUpperCase() : site.client?.name ?? site.name
        return (
          <Link
            key={site.slug}
            href={hrefFor(site.slug)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-3.5 py-2 transition-colors",
              active
                ? "border-tk-teal bg-tk-teal text-tk-linen"
                : "border-tk-slate/20 bg-white text-tk-onyx hover:border-tk-teal"
            )}
          >
            <span
              className={cn(
                "h-2 w-2 rounded-[3px]",
                active ? "bg-tk-linen" : "bg-tk-slate/25"
              )}
            />
            <span className="leading-tight">
              <span className="block text-xs font-semibold tracking-wide">{title}</span>
              <span
                className={cn(
                  "block text-[10.5px]",
                  active ? "text-tk-linen/70" : "text-tk-slate/55"
                )}
              >
                {domain(site.origin) || site.slug}
                {house ? " · house" : ""}
              </span>
            </span>
          </Link>
        )
      })}
      {showAdd ? (
        <p className="rounded-xl border border-dashed border-tk-slate/25 px-3 py-2 text-xs font-semibold text-tk-slate/55">
          ＋ npm run site:add
        </p>
      ) : null}
    </div>
  )
}
