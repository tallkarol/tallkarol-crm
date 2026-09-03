"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react"
import { BrandMark } from "@/components/BrandMark"
import { SidebarNav, type NavBadge } from "@/components/SidebarNav"
import { ThemeToggle } from "@/components/ThemeToggle"
import { logoutAction } from "@/lib/actions"
import { cn } from "@/lib/cn"
import { HideMoneyToggle } from "@/components/HideMoneyToggle"
import { ADMIN_NAV, type NavSection } from "@/lib/nav"
import { primeHideMoney } from "@/lib/money-privacy"
import type { Theme } from "@/lib/theme"

const STORAGE_KEY = "tk-crm-sidebar-collapsed"

export function AppShell({
  email,
  badges = {},
  nav = ADMIN_NAV,
  hideMoney = false,
  theme = "system",
  children,
}: {
  email: string
  /** Keyed by href — see `lib/unread.ts` for what the counts and tones mean. */
  badges?: Record<string, NavBadge>
  nav?: readonly NavSection[]
  /** Demo mode, from the cookie the admin layout read. */
  hideMoney?: boolean
  /** Appearance, from the cookie the admin layout read. */
  theme?: Theme
  children: React.ReactNode
}) {
  // Primes the server pass of every client component below this one, which
  // cannot read the cookie itself. In the browser the inline script has
  // already set the global, so this is a no-op there. See lib/money-privacy.ts.
  primeHideMoney(hideMoney)

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

      {/* The rail: onyx in both themes, so the brand chrome is the one
          constant while the canvas flips. */}
      <aside
        data-chrome="sidebar"
        className={cn(
          "hidden h-full shrink-0 flex-col border-r border-rail-ink/10 bg-rail text-rail-ink md:flex",
          "transition-[width] duration-200 ease-out motion-reduce:transition-none",
          collapsed ? "w-[4.25rem]" : "w-[15.5rem]"
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 pb-2 pt-[18px]",
            collapsed ? "flex-col px-2" : "justify-between pl-[18px] pr-3"
          )}
        >
          <BrandMark compact={collapsed} tone="rail" />
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-rail-ink/50 hover:bg-rail-ink/[0.06] hover:text-rail-ink"
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
            "tk-nav-scroll min-h-0 flex-1 overflow-y-auto py-3",
            collapsed ? "tk-nav-scroll--compact px-1.5" : "px-2.5"
          )}
        >
          <SidebarNav
            sections={nav}
            collapsed={collapsed}
            badges={badges}
          />
        </div>
        <UserFooter
          email={email}
          collapsed={collapsed}
          hideMoney={hideMoney}
          theme={theme}
        />
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header
          data-chrome="topbar"
          className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-tk-slate/10 bg-white/95 px-4 backdrop-blur-md md:hidden"
        >
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
            className="relative flex h-full w-[min(18rem,88vw)] flex-col bg-rail text-rail-ink shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
          >
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-rail-ink/10 px-4">
              <BrandMark onClick={() => setMenuOpen(false)} tone="rail" />
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-lg text-rail-ink/70 hover:bg-rail-ink/[0.06] hover:text-rail-ink"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
              >
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <div className="tk-nav-scroll min-h-0 flex-1 overflow-y-auto px-2.5 py-3">
              <SidebarNav
                sections={nav}
                badges={badges}
                onNavigate={() => setMenuOpen(false)}
              />
            </div>
            <UserFooter email={email} hideMoney={hideMoney} theme={theme} />
          </aside>
        </div>
      ) : null}
    </div>
  )
}

function UserFooter({
  email,
  collapsed,
  hideMoney,
  theme,
}: {
  email: string
  collapsed?: boolean
  hideMoney: boolean
  theme: Theme
}) {
  const initial = email.slice(0, 1).toUpperCase()

  return (
    <div
      className={cn(
        "mt-auto border-t border-rail-ink/10 bg-rail-2 py-3.5",
        collapsed ? "px-2" : "px-3.5"
      )}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2">
          <HideMoneyToggle initial={hideMoney} collapsed />
          <ThemeToggle initial={theme} collapsed />
          <span
            className="flex size-8 items-center justify-center rounded-full bg-[--rail-active] text-xs font-bold text-[--rail-active-icon]"
            title={email}
          >
            {initial}
          </span>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-[11px] font-semibold text-rail-ink/60 hover:text-rail-ink hover:underline"
            >
              Out
            </button>
          </form>
        </div>
      ) : (
        <div className="space-y-2.5">
          <HideMoneyToggle initial={hideMoney} />
          <ThemeToggle initial={theme} />
          <div className="flex items-center justify-between gap-3 pt-0.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[--rail-active] text-[11px] font-bold text-[--rail-active-icon]">
                {initial}
              </span>
              <span className="truncate text-xs text-rail-ink/70">{email}</span>
            </div>
            <form action={logoutAction}>
              <button
                type="submit"
                className="shrink-0 text-xs font-semibold text-rail-ink/70 hover:text-rail-ink hover:underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
