"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { DeskDock } from "@/components/chat/DeskDock"
import { DockRail } from "@/components/nav/DockRail"
import { HubPanel } from "@/components/nav/HubPanel"
import { MobileNav } from "@/components/nav/MobileNav"
import { cn } from "@/lib/cn"
import { DOCK_NAV, ROUTES, resolveActiveNav, type NavBadge } from "@/lib/nav"
import { primeHideMoney } from "@/lib/money-privacy"
import type { Theme } from "@/lib/theme"

const PINNED_KEY = "tk-crm-panel-pinned"
const GROUP_KEY = "tk-crm-panel-group"

/**
 * Routes that own their own scrolling. The chat is one frame the height of
 * the window — a persistent thread rail beside a thread that scrolls on its
 * own — so the canvas padding and the <main> scroller both step aside and
 * the page gets a flex column to fill instead.
 */
const FULL_BLEED = new Set<string>([ROUTES.chat])

/** "Review" on /timesheet/review, "Dashboard" on the monogram, "Chat" on
 *  /chat — the phone header's title. Falls back to the last path segment
 *  for a parked page, which has no row in the dock to read a label from. */
function titleFor(pathname: string, itemLabel: string | undefined): string {
  if (itemLabel) return itemLabel
  if (pathname === "/") return "Dashboard"
  if (pathname === ROUTES.chat) return "Chat"
  const last = pathname.split("/").filter(Boolean).pop() ?? ""
  const words = last.replace(/-/g, " ")
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Tall Karol"
}

export function AppShell({
  email,
  badges = {},
  hideMoney = false,
  theme = "system",
  children,
}: {
  email: string
  /** Keyed by href — see `lib/unread.ts` for what the counts and tones mean. */
  badges?: Record<string, NavBadge>
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
  const fullBleed = FULL_BLEED.has(pathname)
  const [pinned, setPinned] = useState(true)
  const [lastGroupId, setLastGroupId] = useState<string>(DOCK_NAV[0].id)
  // The dock's Chat icon can wear the desks' "needs a yes" total, but the
  // count has to come up from DeskDock's own 30s poll rather than a second
  // one. That prop is waiting on the chat session's in-flight work, so the
  // dot stays dark until it lands.
  const [chatNeedsYou] = useState(0)

  useEffect(() => {
    try {
      const rawPinned = localStorage.getItem(PINNED_KEY)
      if (rawPinned !== null) setPinned(rawPinned === "true")
      const rawGroup = localStorage.getItem(GROUP_KEY)
      if (rawGroup && DOCK_NAV.some((g) => g.id === rawGroup)) setLastGroupId(rawGroup)
    } catch {
      /* ignore */
    }
  }, [])

  // The pathname is the source of truth for which group is current — a
  // group opened by clicking its dock icon before navigating away must not
  // outlive the navigation. Only chrome-only routes (the dashboard, /chat, a
  // parked settings page) fall back to whichever group was last real, so the
  // panel has something sensible to show rather than nothing.
  const activeNav = resolveActiveNav(pathname)
  const activeGroupId = activeNav?.group.id ?? lastGroupId

  useEffect(() => {
    if (!activeNav) return
    setLastGroupId(activeNav.group.id)
    try {
      localStorage.setItem(GROUP_KEY, activeNav.group.id)
    } catch {
      /* ignore */
    }
  }, [activeNav])

  function togglePinned() {
    setPinned((current) => {
      const next = !current
      try {
        localStorage.setItem(PINNED_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const openGroup = DOCK_NAV.find((g) => g.id === activeGroupId) ?? DOCK_NAV[0]

  return (
    <div className="flex h-[100dvh] min-w-0 flex-1 flex-col overflow-hidden rail:flex-row">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[80] focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-tk-linen"
      >
        Skip to main content
      </a>

      {/* Desktop and tablet: the 76px dock, then the panel beside it when
          pinned open. Below the `rail` breakpoint both are replaced by
          MobileNav's top bar, bottom bar and sheet. */}
      <DockRail
        badges={badges}
        chatNeedsYou={chatNeedsYou}
        activeGroupId={activeGroupId}
        pinned={pinned}
        onTogglePinned={togglePinned}
        email={email}
        hideMoney={hideMoney}
        theme={theme}
      />
      {pinned ? (
        <HubPanel
          group={openGroup}
          activeHref={activeNav?.item.href ?? null}
          badges={badges}
          pinned={pinned}
          onTogglePinned={togglePinned}
          className="hidden w-[236px] shrink-0 flex-col gap-3.5 border-r border-rail-line bg-rail-2 px-3 py-5 rail:flex"
        />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <MobileNav
          activeHref={activeNav?.item.href ?? null}
          title={titleFor(pathname, activeNav?.item.label)}
          activeGroupId={activeNav ? activeGroupId : null}
          badges={badges}
          chatNeedsYou={chatNeedsYou}
        />

        {/* The page and, on the right edge, the desk dock — a panel when a desk is open. */}
        <div className="flex min-h-0 min-w-0 flex-1">
          <main
            id="main"
            className={cn(
              "relative min-w-0 flex-1 pb-[76px] rail:pb-0",
              fullBleed
                ? "flex min-h-0 flex-col overflow-hidden"
                : "tk-main-scroll overflow-x-hidden overflow-y-auto"
            )}
          >
            {/* Full-bleed canvas — pages cap their own prose/form widths. */}
            <div
              className={
                fullBleed ? "flex min-h-0 flex-1 flex-col" : "w-full px-5 py-8 sm:px-8"
              }
            >
              {children}
            </div>
          </main>
          <DeskDock />
        </div>
      </div>
    </div>
  )
}
