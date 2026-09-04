import Link from "next/link"
import { cn } from "@/lib/cn"
import {
  REVENUE_RANGES,
  rangeHref,
  type RevenueRange,
} from "@/lib/revenue"

export function RangeSwitch({ range }: { range: RevenueRange }) {
  return (
    <div className="flex rounded-lg border border-line bg-card p-0.5">
      {REVENUE_RANGES.map((option) => (
        <Link
          key={option.id}
          href={rangeHref(option.id)}
          aria-current={range === option.id ? "true" : undefined}
          className={cn(
            "rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
            range === option.id
              ? "bg-tk-onyx text-tk-linen"
              : "text-ink-3 hover:text-tk-onyx"
          )}
        >
          {option.label}
        </Link>
      ))}
    </div>
  )
}
