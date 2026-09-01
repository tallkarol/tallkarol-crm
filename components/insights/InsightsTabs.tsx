"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { cn } from "@/lib/cn"

const TABS = [
  { seg: "", label: "Overview" },
  { seg: "unfiltered", label: "Unfiltered" },
  { seg: "host", label: "Host" },
  { seg: "search", label: "Search" },
  { seg: "traffic", label: "Traffic" },
  { seg: "conversions", label: "Conversions" },
  { seg: "experiments", label: "Experiments" },
  { seg: "reports", label: "Reports" },
  { seg: "health", label: "Health" },
] as const

/** Tabs that show their own fixed windows, so `?range=` means nothing to them. */
const RANGELESS = new Set<string>(["reports", "health", "experiments"])

export function InsightsTabs({
  slug,
  isHouse,
  hasHost,
}: {
  slug: string
  isHouse: boolean
  hasHost: boolean
}) {
  const pathname = usePathname()
  const search = useSearchParams()
  const range = search.get("range")
  const base = `/insights/${slug}`
  const suffix = range ? `?range=${range}` : ""

  return (
    <nav
      aria-label="Insights sections"
      className="mt-5 flex gap-0.5 overflow-x-auto border-b border-tk-slate/15"
    >
      {TABS.filter((tab) => {
        if (tab.seg === "conversions") return isHouse
        if (tab.seg === "host") return hasHost
        return true
      }).map((tab) => {
        const href = tab.seg ? `${base}/${tab.seg}` : base
        const active = tab.seg
          ? pathname === `${base}/${tab.seg}`
          : pathname === base
        return (
          <Link
            key={tab.label}
            href={`${href}${RANGELESS.has(tab.seg) ? "" : suffix}`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-xs font-semibold transition-colors",
              active
                ? "border-tk-teal text-tk-teal"
                : "border-transparent text-tk-slate/60 hover:text-tk-onyx"
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
