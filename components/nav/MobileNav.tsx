"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, Home, LogOut, Menu, MessagesSquare, Search } from "lucide-react"
import { HideMoneyToggle } from "@/components/HideMoneyToggle"
import { ThemeToggle } from "@/components/ThemeToggle"
import { openPalette } from "@/components/nav/CommandPalette"
import { HubBadge } from "@/components/nav/DockRail"
import { logoutAction } from "@/lib/actions"
import { cn } from "@/lib/cn"
import { DOCK_NAV, ROUTES, groupBadge, type NavBadge, type NavGroup } from "@/lib/nav"
import { navIcon } from "@/lib/nav-icons"
import type { Theme } from "@/lib/theme"

/** The two groups that are tabs of their own; the rest of the rail lives under More. */
const TAB_GROUPS = new Set(["inbox", "tasks"])

/** What More lists, in the rail's order: the column's groups, then the foot's. */
const MORE_GROUPS: NavGroup[] = [
  ...DOCK_NAV.filter((group) => !group.bottom && !TAB_GROUPS.has(group.id)),
  ...DOCK_NAV.filter((group) => group.bottom),
]

/**
 * Phone chrome (Karol, 24 Sep 2026 — the mockup's option A): five fixed
 * tabs and nothing else. No top bar (every page has its own header), no
 * floating buttons (the desk lives behind Chat and "Ask the desk"; the
 * running clock docks above the bar). Home · Inbox · Tasks · Chat · More,
 * and More is a sheet: search first, then the seven other groups with their
 * pages, then the account. Visible only below the `rail` breakpoint —
 * AppShell's dock and panel take over above it.
 */
export function MobileNav({
  activeHref,
  activeGroupId,
  badges,
  chatNeedsYou,
  email,
  hideMoney,
  theme,
}: {
  /** The one row to highlight in the sheet — see HubPanel's activeHref doc. */
  activeHref: string | null
  activeGroupId: string | null
  badges: Record<string, NavBadge>
  chatNeedsYou: number
  email: string
  hideMoney: boolean
  theme: Theme
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Any navigation closes the sheet.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open])

  const onHome = pathname === ROUTES.home
  const onChat = pathname === ROUTES.chat || pathname.startsWith(`${ROUTES.chat}/`)
  const onInbox = activeGroupId === "inbox"
  const onTasks = activeGroupId === "tasks"
  // Everything that is not one of the four is under More: another group, a
  // client or product hub, a parked page.
  const onMore = !onHome && !onChat && !onInbox && !onTasks
  const InboxIcon = navIcon("inbox")
  const TasksIcon = navIcon("tasks")
  const inboxGroup = DOCK_NAV.find((g) => g.id === "inbox")

  return (
    <>
      {open ? (
        <MoreSheet
          activeGroupId={activeGroupId}
          activeHref={activeHref}
          badges={badges}
          email={email}
          hideMoney={hideMoney}
          theme={theme}
          onClose={() => setOpen(false)}
        />
      ) : null}

      <nav
        aria-label="Main"
        data-chrome="sidebar"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-rail-line bg-rail px-1.5 pb-[max(8px,env(safe-area-inset-bottom))] rail:hidden"
      >
        <Tab href={ROUTES.home} label="Home" active={onHome} icon={<Home className="size-[22px]" aria-hidden />} />
        <Tab
          href={ROUTES.inbox}
          label="Inbox"
          active={onInbox}
          icon={<InboxIcon className="size-[22px]" aria-hidden />}
          badge={inboxGroup ? groupBadge(inboxGroup, badges) : undefined}
        />
        <Tab href={ROUTES.tasks} label="Tasks" active={onTasks} icon={<TasksIcon className="size-[22px]" aria-hidden />} />
        <Tab
          href={ROUTES.chat}
          label="Chat"
          active={onChat}
          icon={<MessagesSquare className="size-[22px]" aria-hidden />}
          dot={chatNeedsYou > 0}
          ariaLabel={chatNeedsYou > 0 ? `Chat, ${chatNeedsYou} need${chatNeedsYou === 1 ? "s" : ""} a yes` : undefined}
        />
        <Tab
          label="More"
          active={onMore || open}
          icon={<Menu className="size-[22px]" aria-hidden />}
          onClick={() => setOpen((v) => !v)}
          expanded={open}
        />
      </nav>
    </>
  )
}

function Tab({
  href,
  label,
  active,
  icon,
  badge,
  dot,
  ariaLabel,
  onClick,
  expanded,
}: {
  href?: string
  label: string
  active: boolean
  icon: React.ReactNode
  badge?: NavBadge
  dot?: boolean
  ariaLabel?: string
  onClick?: () => void
  expanded?: boolean
}) {
  const className = cn(
    "relative flex h-[58px] flex-col items-center justify-center gap-[3px] pt-0.5 font-ui text-[10.5px] font-semibold transition-colors",
    active ? "text-rail-ink [&>svg]:text-[--rail-active-icon]" : "text-rail-ink-3 [&>svg]:text-rail-ink/60"
  )
  const content = (
    <>
      {icon}
      <span>{label}</span>
      {/* The count and the dot sit up beside the icon, as on the dock. */}
      <span className="absolute left-1/2 top-[7px] ml-1 [&>span]:static">
        <HubBadge badge={badge} />
      </span>
      {dot ? <span aria-hidden className="absolute left-[calc(50%+7px)] top-[9px] size-2 rounded-full bg-[--rail-active-icon] ring-2 ring-rail" /> : null}
    </>
  )
  if (href) {
    return (
      <Link href={href} aria-current={active ? "page" : undefined} aria-label={ariaLabel} className={className}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} aria-expanded={expanded} aria-haspopup="dialog" className={className}>
      {content}
    </button>
  )
}

/**
 * The More sheet. Search first (it is ⌘K), then each group as a row: a
 * one-page group (Calendar, HiveMind, Time) is a link; the rest fold open
 * to list their pages, the current group already open. The account block
 * at the foot is the dock's avatar menu, laid flat.
 */
function MoreSheet({
  activeGroupId,
  activeHref,
  badges,
  email,
  hideMoney,
  theme,
  onClose,
}: {
  activeGroupId: string | null
  activeHref: string | null
  badges: Record<string, NavBadge>
  email: string
  hideMoney: boolean
  theme: Theme
  onClose: () => void
}) {
  const [openId, setOpenId] = useState<string | null>(activeGroupId)

  return (
    <div className="fixed inset-0 z-50 rail:hidden">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-scrim" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="More"
        className="absolute inset-x-0 bottom-0 top-24 flex flex-col overflow-y-auto rounded-t-[28px] bg-canvas px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2 shadow-overlay"
      >
        <span aria-hidden className="mx-auto mb-3 h-[5px] w-10 shrink-0 rounded-full bg-line-strong" />

        <button
          type="button"
          onClick={() => {
            onClose()
            openPalette()
          }}
          className="flex h-[50px] shrink-0 items-center gap-2.5 rounded-[14px] border border-line bg-card px-3.5 text-left text-[15px] text-ink-3 shadow-card"
        >
          <Search className="size-[18px] shrink-0" aria-hidden />
          <span className="flex-1">Search or jump to…</span>
          <kbd className="rounded-md border border-line px-1.5 py-0.5 font-ui text-[10.5px] font-semibold text-ink-3">⌘K</kbd>
        </button>

        <ul className="mt-3 shrink-0 overflow-hidden rounded-2xl border border-line bg-card shadow-card">
          {MORE_GROUPS.map((group) => {
            const Icon = navIcon(group.icon)
            const active = group.id === activeGroupId
            const expanded = openId === group.id && !group.noPanel
            const badge = groupBadge(group, badges)
            const rowClass =
              "flex min-h-[58px] w-full items-center gap-3 px-4 py-2 text-left border-t border-line first:border-t-0"
            const body = (
              <>
                <Icon className={cn("size-[18px] shrink-0", active ? "text-accent-ink" : "text-ink-3")} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={cn("block font-ui text-[15px] font-semibold", active ? "text-accent-ink" : "text-tk-onyx")}>{group.label}</span>
                  {group.items.length > 1 ? (
                    <span className="block truncate font-ui text-[12px] text-ink-3">{group.items.map((i) => i.label).join(" · ")}</span>
                  ) : null}
                </span>
                {badge ? <SheetBadge badge={badge} /> : null}
                {group.noPanel ? null : (
                  <ChevronDown className={cn("size-[18px] shrink-0 text-ink-3 transition-transform", expanded && "rotate-180")} aria-hidden />
                )}
              </>
            )
            return (
              <li key={group.id}>
                {group.noPanel ? (
                  <Link href={group.href} aria-current={active ? "page" : undefined} className={rowClass}>
                    {body}
                  </Link>
                ) : (
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setOpenId((current) => (current === group.id ? null : group.id))}
                    className={rowClass}
                  >
                    {body}
                  </button>
                )}
                {expanded ? (
                  <ul className="border-t border-line bg-well py-1">
                    {group.items.map((item) => {
                      const ItemIcon = navIcon(item.icon)
                      const on = item.href === activeHref
                      const itemBadge = badges[item.href]
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={on ? "page" : undefined}
                            className={cn(
                              "flex min-h-[46px] items-center gap-3 px-4 pl-[46px] font-ui text-[14px]",
                              on ? "font-semibold text-accent-ink" : "text-ink-2"
                            )}
                          >
                            <ItemIcon className={cn("size-4 shrink-0", on ? "text-accent-ink" : "text-ink-3")} aria-hidden />
                            <span className="flex-1">{item.label}</span>
                            {itemBadge && itemBadge.count > 0 ? <SheetBadge badge={itemBadge} /> : null}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </li>
            )
          })}
        </ul>

        {/* The dock's avatar menu, laid flat: the toggles keep their rail
            tokens, so the block is rail-2 like the popover they came from. */}
        <div className="mt-3 shrink-0 rounded-2xl border border-rail-line bg-rail-2 p-3 text-rail-ink">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[--rail-active] font-ui text-sm font-bold text-[--rail-active-icon]">
              {email.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1 truncate font-ui text-[13px] text-rail-ink/80">{email}</span>
            <form action={logoutAction}>
              <button
                type="submit"
                aria-label="Sign out"
                title="Sign out"
                className="grid size-9 place-items-center rounded-lg text-rail-ink/60 hover:bg-rail-ink/[0.06] hover:text-rail-ink"
              >
                <LogOut className="size-4" aria-hidden />
              </button>
            </form>
          </div>
          <div className="mt-2.5 space-y-2.5 border-t border-rail-line pt-2.5">
            <HideMoneyToggle initial={hideMoney} />
            <ThemeToggle initial={theme} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** A count on a canvas-toned row — the rail's badge tones read wrong on a light card. */
function SheetBadge({ badge }: { badge: NavBadge }) {
  if (badge.count <= 0) return null
  return (
    <span
      className={cn(
        "grid h-[20px] min-w-[20px] shrink-0 place-items-center rounded-full px-1.5 font-ui text-[11px] font-bold text-tk-linen",
        badge.tone === "bad" || badge.tone === "warn" ? "bg-tk-tomato" : "bg-accent"
      )}
    >
      {badge.count > 99 ? "99+" : badge.count}
    </span>
  )
}
