"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { cn } from "@/lib/cn"

const RANGES = [
  { days: "7", label: "7d" },
  { days: "28", label: "28d" },
  { days: "90", label: "90d" },
] as const

/** Window picker. Pure links — the data is already local, switching is free. */
export function RangeSwitcher() {
  const pathname = usePathname()
  const search = useSearchParams()
  const current = search.get("range") === "7" ? "7" : search.get("range") === "90" ? "90" : "28"

  return (
    <div className="flex rounded-lg border border-tk-slate/20 bg-white p-0.5">
      {RANGES.map((r) => (
        <Link
          key={r.days}
          href={r.days === "28" ? pathname : `${pathname}?range=${r.days}`}
          aria-current={current === r.days ? "true" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
            current === r.days
              ? "bg-tk-onyx text-tk-linen"
              : "text-tk-slate/70 hover:text-tk-onyx"
          )}
        >
          {r.label}
        </Link>
      ))}
    </div>
  )
}
