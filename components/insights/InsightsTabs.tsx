"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { cn } from "@/lib/cn"

const TABS = [
  { seg: "", label: "Overview" },
  { seg: "search", label: "Search" },
  { seg: "traffic", label: "Traffic" },
  { seg: "conversions", label: "Conversions" },
  { seg: "reports", label: "Reports" },
  { seg: "health", label: "Health" },
] as const

export function InsightsTabs({ slug, isHouse }: { slug: string; isHouse: boolean }) {
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
      {TABS.filter((tab) => tab.seg !== "conversions" || isHouse).map((tab) => {
        const href = tab.seg ? `${base}/${tab.seg}` : base
        const active = tab.seg
          ? pathname === `${base}/${tab.seg}`
          : pathname === base
        return (
          <Link
            key={tab.label}
            href={`${href}${tab.seg === "reports" || tab.seg === "health" ? "" : suffix}`}
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
