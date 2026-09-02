"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"

const TABS = [
  { href: ROUTES.timesheet, label: "Dashboard", exact: true },
  { href: ROUTES.timesheetLive, label: "Clock", exact: false },
  { href: ROUTES.timesheetReview, label: "Review", exact: false },
  { href: ROUTES.timesheetSheets, label: "Sheets", exact: false },
  { href: ROUTES.timesheetEntries, label: "Ledger", exact: false },
] as const

const OWN_PATHS = TABS.filter((tab) => !tab.exact).map((tab) => tab.href)

export function TimesheetTabs({ pending = 0 }: { pending?: number }) {
  const pathname = usePathname()

  // Anything else under /timesheet is a sheet, which belongs to Sheets.
  const onSheet =
    pathname.startsWith("/timesheet/") &&
    !OWN_PATHS.some((href) => pathname === href || pathname.startsWith(`${href}/`))

  return (
    <nav
      aria-label="Timesheet sections"
      className="mt-5 flex gap-0.5 overflow-x-auto shadow-[inset_0_-1px_0_rgba(31,44,43,0.15)]"
    >
      {TABS.map((tab) => {
        const active = tab.exact
          ? pathname === tab.href
          : pathname === tab.href ||
            pathname.startsWith(`${tab.href}/`) ||
            (onSheet && tab.href === ROUTES.timesheetSheets)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-1.5 text-xs font-semibold transition-colors",
              active
                ? "border-tk-teal text-tk-teal"
                : "border-transparent text-tk-slate/60 hover:text-tk-onyx"
            )}
          >
            {tab.label}
            {tab.href === ROUTES.timesheetReview && pending > 0 ? (
              <span className="rounded-full bg-tk-teal px-1.5 py-0.5 text-[10px] font-bold leading-none text-tk-linen">
                {pending}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
