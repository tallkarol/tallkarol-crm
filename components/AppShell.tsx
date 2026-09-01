"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react"
import { BrandMark } from "@/components/BrandMark"
import { SidebarNav, type NavBadge } from "@/components/SidebarNav"
import { logoutAction } from "@/lib/actions"
import { cn } from "@/lib/cn"
import { ADMIN_NAV, type NavSection } from "@/lib/nav"

const STORAGE_KEY = "tk-crm-sidebar-collapsed"

export function AppShell({
  email,
  badges = {},
  nav = ADMIN_NAV,
  children,
}: {
  email: string
  /** Keyed by href — see `lib/unread.ts` for what the counts and tones mean. */
  badges?: Record<string, NavBadge>
  nav?: readonly NavSection[]
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(STORAGE_KEY) === "true")
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menuOpen])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [menuOpen])

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  return (
    <div className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-tk-teal focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-tk-linen"
      >
        Skip to main content
      </a>

      <aside
        className={cn(
          "hidden h-full shrink-0 flex-col border-r border-tk-slate/10 bg-white md:flex",
          "transition-[width] duration-200 ease-out motion-reduce:transition-none",
          collapsed ? "w-[4.25rem]" : "w-64"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 pt-5 pb-2.5",
            collapsed ? "flex-col px-2" : "justify-between px-5"
          )}
        >
          <BrandMark compact={collapsed} />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-tk-slate/70 hover:bg-tk-linen hover:text-tk-onyx"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" aria-hidden />
            ) : (
              <PanelLeftClose className="size-4" aria-hidden />
            )}
          </button>
        </div>
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto py-4",
            collapsed ? "px-1.5" : "px-3"
          )}
        >
          <SidebarNav
            sections={nav}
            collapsed={collapsed}
            badges={badges}
          />
        </div>
        <UserFooter email={email} collapsed={collapsed} />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-tk-slate/10 bg-white/95 px-4 backdrop-blur-md md:hidden">
          <BrandMark />
          <button
            type="button"
            className="flex size-9 items-center justify-center rounded-lg text-tk-onyx hover:bg-tk-linen"
            aria-expanded={menuOpen}
            aria-controls="tk-crm-mobile-nav"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? (
              <X className="size-5" aria-hidden />
            ) : (
              <Menu className="size-5" aria-hidden />
            )}
          </button>
        </header>

        <main
          id="main"
          className="relative min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
        >
          {/* Full-bleed canvas — pages cap their own prose/form widths. */}
          <div className="w-full px-5 py-8 sm:px-8">
            {children}
          </div>
        </main>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-tk-onyx/40"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            id="tk-crm-mobile-nav"
            className="relative flex h-full w-[min(18rem,88vw)] flex-col bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-tk-slate/10 px-4">
              <BrandMark onClick={() => setMenuOpen(false)} />
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-lg text-tk-onyx hover:bg-tk-linen"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
              <SidebarNav
                sections={nav}
                badges={badges}
                onNavigate={() => setMenuOpen(false)}
              />
            </div>
            <UserFooter email={email} />
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function UserFooter({
  email,
  collapsed,
}: {
  email: string
  collapsed?: boolean
}) {
  const initial = email.slice(0, 1).toUpperCase()

  return (
    <div
      className={cn(
        "mt-auto border-t border-tk-slate/10 bg-white py-4",
        collapsed ? "px-2" : "px-4"
      )}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2">
          <span
            className="flex size-8 items-center justify-center rounded-full bg-tk-teal/10 text-xs font-semibold text-tk-teal"
            title={email}
          >
            {initial}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-[11px] font-semibold text-tk-slate hover:text-tk-teal hover:underline"
            >
              Out
            </button>
          </form>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tk-teal/10 text-xs font-semibold text-tk-teal">
              {initial}
            </span>
            <span className="truncate text-xs text-tk-slate/70">{email}</span>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="shrink-0 text-xs font-semibold text-tk-slate hover:text-tk-teal hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
