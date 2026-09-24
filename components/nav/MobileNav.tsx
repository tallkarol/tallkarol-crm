"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { MessagesSquare, Search } from "lucide-react"
import { ClientsPanel } from "@/components/clients/ClientsPanel"
import { openPalette } from "@/components/nav/CommandPalette"
import { HubButton } from "@/components/nav/DockRail"
import { HubPanel } from "@/components/nav/HubPanel"
import { cn } from "@/lib/cn"
import type { ClientGroup } from "@/lib/client-groups"
import { DOCK_NAV, ROUTES, groupBadge, type NavBadge } from "@/lib/nav"
import { navIcon } from "@/lib/nav-icons"

/** The bottom bar in the rail's order: the column's groups, then the foot's (Time, Money). */
const BAR_GROUPS = [
  ...DOCK_NAV.filter((group) => !group.bottom && !group.topBar),
  ...DOCK_NAV.filter((group) => group.bottom && !group.topBar),
]

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
  clientGroups,
}: {
  /** The one row to highlight in the sheet — see HubPanel's activeHref doc. */
  activeHref: string | null
  /** The current page's name, for the header — "Dashboard" on the monogram, "Chat" on /chat. */
  title: string
  activeGroupId: string | null
  badges: Record<string, NavBadge>
  chatNeedsYou: number
  /** The Clients sheet — the client list, same as the desktop panel. */
  clientGroups: ClientGroup[]
}) {
  const pathname = usePathname()
  const [sheetId, setSheetId] = useState<string | null>(null)
  const bar = useRef<HTMLDivElement>(null)

  // Nine tabs do not fit a phone, so the bar scrolls sideways; bring the
  // current one into view whenever the group changes.
  useEffect(() => {
    bar.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.scrollIntoView({ inline: "nearest", block: "nearest" })
  }, [activeGroupId])

  // Any navigation closes the sheet — keyed on the pathname, not the
  // highlighted row, because a client tapped in the Clients sheet lands on
  // /clients/[slug], which resolves to the same row as /clients.
  useEffect(() => {
    setSheetId(null)
  }, [pathname])

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
        {/* Admin sits with the chrome here, as it does at the foot of the
            desktop rail — the bottom bar is full already. Same
            rule as a bottom-bar tab: a link to the group, or, when you are
            already in it, the button that opens its sheet. */}
        {DOCK_NAV.filter((group) => group.topBar).map((group) => {
          const Icon = navIcon(group.icon)
          const active = activeGroupId === group.id
          const className = cn(
            "grid size-11 shrink-0 place-items-center rounded-lg hover:bg-rail-hover hover:text-rail-ink",
            active ? "bg-[--rail-active] text-[--rail-active-icon]" : "text-rail-ink/60"
          )
          return active ? (
            <button
              key={group.id}
              type="button"
              aria-label={group.label}
              aria-current="page"
              aria-haspopup="dialog"
              onClick={() => setSheetId((current) => (current === group.id ? null : group.id))}
              className={className}
            >
              <Icon className="size-[19px]" aria-hidden />
            </button>
          ) : (
            <Link key={group.id} href={group.href} aria-label={group.label} title={group.label} className={className}>
              <Icon className="size-[19px]" aria-hidden />
            </Link>
          )
        })}
        <button
          type="button"
          onClick={openPalette}
          aria-label="Search"
          title="Search"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-rail-ink/60 hover:bg-rail-hover hover:text-rail-ink"
        >
          <Search className="size-[19px]" aria-hidden />
        </button>
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
            {sheetGroup.clientList ? (
              <ClientsPanel
                groups={clientGroups}
                onClose={() => setSheetId(null)}
                className="w-full max-h-[70vh] overflow-y-auto rounded-t-[20px] bg-rail-2 px-3 pb-4 pt-2.5 shadow-overlay"
              />
            ) : (
              <HubPanel
                group={sheetGroup}
                activeHref={activeHref}
                badges={badges}
                onClose={() => setSheetId(null)}
                className="w-full max-h-[70vh] overflow-y-auto rounded-t-[20px] bg-rail-2 px-3 pb-4 pt-2.5 shadow-overlay"
              />
            )}
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Main"
        data-chrome="sidebar"
        className="fixed inset-x-0 bottom-0 z-40 bg-rail pb-[max(8px,env(safe-area-inset-bottom))] pt-2 rail:hidden"
      >
        {/* The tabs scroll inside a solid bar; the edge fades say there is
            more either way, without fading the bar's own background. */}
        <div
          ref={bar}
          className="flex items-start justify-between gap-0.5 overflow-x-auto px-1.5 [-webkit-mask-image:linear-gradient(to_right,transparent,#000_20px,#000_calc(100%-20px),transparent)] [mask-image:linear-gradient(to_right,transparent,#000_20px,#000_calc(100%-20px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {BAR_GROUPS.map((group) => {
            const active = activeGroupId === group.id
            return (
              <HubButton
                key={group.id}
                group={group}
                active={active}
                badge={groupBadge(group, badges)}
                onOpenSheet={
                  active && !group.noPanel ? () => setSheetId((current) => (current === group.id ? null : group.id)) : undefined
                }
              />
            )
          })}
        </div>
      </nav>
    </>
  )
}
