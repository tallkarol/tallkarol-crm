"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { MessagesSquare, Search } from "lucide-react"
import { HubButton } from "@/components/nav/DockRail"
import { HubPanel } from "@/components/nav/HubPanel"
import { DOCK_NAV, ROUTES, groupBadge, type NavBadge } from "@/lib/nav"

/**
 * Phone chrome: the dock becomes a bottom bar and the panel becomes a sheet
 * that rises above it, per Dock-Phone.dc.html / Dock-Phone-Sheet.dc.html.
 * Visible only below the `rail` breakpoint — AppShell's desktop DockRail +
 * HubPanel take over above it. Sheet state is local and transient (no
 * localStorage): a phone sheet is a peek, not a layout decision the way the
 * desktop panel's pinned/closed state is.
 *
 * Tapping a hub icon that is NOT the active group navigates there directly,
 * same as any link. Tapping the ACTIVE group's icon opens the sheet instead
 * — going to the page you're already on would do nothing, so that tap is
 * repurposed to show the rest of the group's pages (see HubButton).
 */
export function MobileNav({
  activeHref,
  title,
  activeGroupId,
  badges,
  chatNeedsYou,
}: {
  /** The one row to highlight in the sheet — see HubPanel's activeHref doc. */
  activeHref: string | null
  /** The current page's name, for the header — "Dashboard" on the monogram, "Chat" on /chat. */
  title: string
  activeGroupId: string | null
  badges: Record<string, NavBadge>
  chatNeedsYou: number
}) {
  const [sheetId, setSheetId] = useState<string | null>(null)

  useEffect(() => {
    setSheetId(null)
  }, [activeHref])

  useEffect(() => {
    if (!sheetId) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setSheetId(null)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [sheetId])

  useEffect(() => {
    document.body.style.overflow = sheetId ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [sheetId])

  const sheetGroup = DOCK_NAV.find((g) => g.id === sheetId) ?? null

  return (
    <>
      <header
        data-chrome="topbar"
        className="sticky top-0 z-40 flex h-[52px] shrink-0 items-center gap-2.5 bg-rail px-3 rail:hidden"
      >
        <Link href={ROUTES.home} aria-label="Dashboard" className="grid h-10 w-[34px] shrink-0 place-items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/tallkarol-monogram-logo.svg"
            alt=""
            width={20}
            height={28}
            className="h-7 w-5 object-contain"
          />
        </Link>
        <span className="flex-1 truncate font-ui text-[15px] font-bold text-rail-ink">{title}</span>
        <Link
          href={ROUTES.home}
          aria-label="Search"
          title="Search"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-rail-ink/60 hover:bg-rail-hover hover:text-rail-ink"
        >
          <Search className="size-[19px]" aria-hidden />
        </Link>
        <Link
          href={ROUTES.chat}
          aria-label={chatNeedsYou > 0 ? `Chat, ${chatNeedsYou} need${chatNeedsYou === 1 ? "s" : ""} a yes` : "Chat"}
          className="relative grid size-11 shrink-0 place-items-center rounded-lg text-rail-ink/60 hover:bg-rail-hover hover:text-rail-ink"
        >
          <MessagesSquare className="size-[19px]" aria-hidden />
          {chatNeedsYou > 0 ? (
            <span aria-hidden className="absolute right-[9px] top-2 size-[7px] rounded-full bg-tk-teal" />
          ) : null}
        </Link>
      </header>

      {sheetGroup ? (
        <div className="fixed inset-0 z-50 rail:hidden">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSheetId(null)}
            className="absolute inset-0 bg-scrim"
          />
          <div role="presentation" className="absolute inset-x-0 bottom-[76px] flex justify-center">
            <HubPanel
              group={sheetGroup}
              activeHref={activeHref}
              badges={badges}
              onClose={() => setSheetId(null)}
              className="w-full max-h-[70vh] overflow-y-auto rounded-t-[20px] bg-rail-2 px-3 pb-4 pt-2.5 shadow-overlay"
            />
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Main"
        data-chrome="sidebar"
        className="fixed inset-x-0 bottom-0 z-40 flex items-start justify-between gap-0.5 bg-rail px-1.5 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 rail:hidden"
      >
        {DOCK_NAV.map((group) => {
          const active = activeGroupId === group.id
          return (
            <HubButton
              key={group.id}
              group={group}
              active={active}
              badge={groupBadge(group, badges)}
              onOpenSheet={active ? () => setSheetId((current) => (current === group.id ? null : group.id)) : undefined}
            />
          )
        })}
      </nav>
    </>
  )
}
