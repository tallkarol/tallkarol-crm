"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/cn"

const TABS = [
  { href: "/portal", label: "Overview" },
  { href: "/portal/insights", label: "Insights" },
  { href: "/portal/tickets", label: "Tickets" },
  { href: "/portal/invoices", label: "Invoices" },
  { href: "/portal/reports", label: "Reports" },
]

export function PortalTabs() {
  const pathname = usePathname()
  return (
    <nav className="flex flex-wrap gap-1">
      {TABS.map((tab) => {
        const active =
          tab.href === "/portal" ? pathname === "/portal" : pathname.startsWith(tab.href)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors",
              active ? "bg-tk-linen text-tk-onyx" : "text-tk-linen/70 hover:text-tk-linen"
            )}
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
