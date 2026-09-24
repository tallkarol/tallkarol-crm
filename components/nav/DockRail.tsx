"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { MessagesSquare, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react"
import { AccountMenu } from "@/components/nav/AccountMenu"
import { cn } from "@/lib/cn"
import { navIcon } from "@/lib/nav-icons"
import { DOCK_NAV, ROUTES, groupBadge, type NavBadge, type NavGroup } from "@/lib/nav"
import type { Theme } from "@/lib/theme"

/**
 * Rail-scoped badge tones — the rail is onyx in both themes, but the page's
 * --warn and --bad tokens invert between them (dark ships a LIGHT hex so it
 * reads on a light card), which would put a linen count under 3:1 on this
 * always-dark surface. --rail-warn/--rail-bad exist precisely so a badge
 * reads the same regardless of the app's theme. See SidebarNav's retired
 * BADGE_TONE map (crm-dashboard-redesign memory note) for the contrast math.
 */
const BADGE_TONE: Record<NonNullable<NavBadge["tone"]>, string> = {
  clear: "bg-rail-ink/30",
  lead: "bg-accent",
  warn: "bg-[--rail-warn]",
  bad: "bg-tk-tomato",
}

/** The numbered pill on a hub icon. Cutout border matches the dock's own
 *  background so the badge reads as punched into the icon, not floating on it. */
export function HubBadge({ badge }: { badge?: NavBadge }) {
  if (!badge || badge.count <= 0) return null
  return (
    <span
      aria-hidden
      className={cn(
        "absolute right-1.5 top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-rail px-1 font-ui text-[9.5px] font-bold text-tk-linen",
        BADGE_TONE[badge.tone ?? "lead"]
      )}
    >
      {badge.count > 99 ? "99+" : badge.count}
    </span>
  )
}

/**
 * One of the six group icons. Shared between the vertical dock (desktop and
 * tablet) and the phone's bottom bar — same row, different flex direction.
 *
 * A real link to the group's landing page, EXCEPT when it is already the
 * active group: navigating to the page you're already on is a no-op, so on
 * the phone that tap is repurposed to open the sheet instead (`onOpenSheet`)
 * — see Dock-Phone-Sheet.dc.html, where the active tab is what the open
 * sheet belongs to. Desktop has no `onOpenSheet`, so it stays a plain link
 * even when active.
 */
export function HubButton({
  group,
  active,
  badge,
  onOpenSheet,
}: {
  group: NavGroup
  active: boolean
  badge?: NavBadge
  onOpenSheet?: () => void
}) {
  const Icon = navIcon(group.icon)
  const className = cn(
    "relative flex w-[60px] flex-col items-center justify-center gap-1 rounded-xl py-2 pb-[7px] font-ui text-[10.5px] font-semibold transition-colors",
    active ? "bg-[--rail-active] text-white" : "text-rail-ink-2 hover:bg-rail-hover hover:text-rail-ink"
  )
  const content = (
    <>
      <Icon
        aria-hidden
        className={cn("size-5 shrink-0", active ? "text-[--rail-active-icon]" : "text-rail-ink/60")}
        strokeWidth={active ? 2.25 : 2}
      />
      <span>{group.label}</span>
      <HubBadge badge={badge} />
    </>
  )

  if (active && onOpenSheet) {
    return (
      <button type="button" aria-current="page" aria-haspopup="dialog" onClick={onOpenSheet} className={className}>
        {content}
      </button>
    )
  }

  return (
    <Link href={group.href} aria-current={active ? "page" : undefined} className={className}>
      {content}
    </Link>
  )
}

/**
 * The 76px onyx dock: monogram (the dashboard link), Chat, the panel toggle,
 * the six group icons, then search and the account avatar. Fixed width,
 * never collapses — the old sidebar's expand/collapse toggle is gone; the
 * panel beside it is what now opens and closes. Hidden below the `rail`
 * breakpoint, where AppShell's phone chrome takes over.
 */
export function DockRail({
  badges,
  chatNeedsYou,
  activeGroupId,
  hasPanel = true,
  pinned,
  onTogglePinned,
  email,
  hideMoney,
  theme,
}: {
  badges: Record<string, NavBadge>
  chatNeedsYou: number
  activeGroupId: string | null
  /** False on the dashboard, which has no panel — the toggle would do nothing. */
  hasPanel?: boolean
  pinned: boolean
  onTogglePinned: () => void
  email: string
  hideMoney: boolean
  theme: Theme
}) {
  const pathname = usePathname()
  const onHome = pathname === "/"

  return (
    <nav
      aria-label="Main"
      data-chrome="sidebar"
      className="hidden w-[76px] shrink-0 flex-col items-center gap-1.5 bg-rail py-4 pb-3.5 rail:flex"
    >
      <Link
        href={ROUTES.home}
        aria-label="Dashboard"
        aria-current={onHome ? "page" : undefined}
        className={cn("grid h-12 w-11 place-items-center rounded-xl", onHome && "bg-[--rail-active]")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/tallkarol-monogram-logo.svg"
          alt=""
          width={26}
          height={36}
          className="h-9 w-[26px] object-contain"
        />
      </Link>

      <div className="flex flex-col items-center gap-0.5">
        <Link
          href={ROUTES.chat}
          aria-label={
            chatNeedsYou > 0 ? `Chat, ${chatNeedsYou} need${chatNeedsYou === 1 ? "s" : ""} a yes` : "Chat"
          }
          className="relative grid size-11 place-items-center rounded-lg text-rail-ink/60 hover:bg-rail-hover hover:text-rail-ink"
        >
          <MessagesSquare className="size-[18px]" aria-hidden />
          {chatNeedsYou > 0 ? (
            <span aria-hidden className="absolute right-[10px] top-[10px] size-[7px] rounded-full bg-tk-teal" />
          ) : null}
        </Link>
        {/* 44px, not the desktop artboard's 40x36 — Dock-Tablet.dc.html draws
            this same toggle at 44x44, and a tablet (or any coarse pointer at
            this width) gets the touch floor rather than the mouse one. */}
        {hasPanel ? (
        <button
          type="button"
          aria-expanded={pinned}
          aria-label={pinned ? "Hide the panel" : "Show the panel"}
          onClick={onTogglePinned}
          className="grid size-11 place-items-center rounded-lg text-rail-ink/60 hover:bg-rail-hover hover:text-rail-ink"
        >
          {pinned ? (
            <PanelLeftClose className="size-[18px]" aria-hidden />
          ) : (
            <PanelLeftOpen className="size-[18px]" aria-hidden />
          )}
        </button>
        ) : null}
      </div>

      <div aria-hidden className="my-1 w-8 border-t border-rail-line" />

      <div className="flex flex-col items-center gap-1">
        {DOCK_NAV.map((group) => (
          <HubButton
            key={group.id}
            group={group}
            active={activeGroupId === group.id}
            badge={groupBadge(group, badges)}
          />
        ))}
      </div>

      <div className="flex-1" />

      <Link
        href={ROUTES.home}
        aria-label="Search (⌘K)"
        title="Search (⌘K)"
        className="grid size-11 place-items-center rounded-lg text-rail-ink/60 hover:bg-rail-hover hover:text-rail-ink"
      >
        <Search className="size-[18px]" aria-hidden />
      </Link>

      <AccountMenu email={email} hideMoney={hideMoney} theme={theme} />
    </nav>
  )
}
