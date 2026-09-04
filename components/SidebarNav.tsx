"use client"

import { useEffect, useId, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/cn"
import {
  ADMIN_NAV,
  resolveActiveHref,
  type NavLink,
  type NavSection,
} from "@/lib/nav"
import { navIcon } from "@/lib/nav-icons"
import type { UnreadTone } from "@/lib/unread"

/**
 * The rail is onyx in both themes, so everything here is painted with the
 * rail tokens rather than the page ones. Active is a teal wash with a white
 * label and a lifted-teal icon; hover is a faint linen wash.
 */
function leafClass(active: boolean, collapsed?: boolean) {
  return cn(
    "relative flex items-center rounded-lg font-ui text-[13px] font-medium transition-colors duration-150",
    collapsed ? "justify-center px-2 py-[7px]" : "justify-between gap-2.5 px-2.5 py-[6px]",
    active
      ? "bg-[--rail-active] font-semibold text-white"
      : "text-rail-ink/70 hover:bg-rail-ink/[0.06] hover:text-rail-ink"
  )
}

function NavItemIcon({
  item,
  active,
  className,
}: {
  item: NavLink
  active?: boolean
  className?: string
}) {
  const Icon = navIcon(item.icon)
  return (
    <Icon
      aria-hidden
      className={cn(
        "size-4 shrink-0 transition-colors",
        active ? "text-[--rail-active-icon]" : "text-rail-ink/50",
        className
      )}
      strokeWidth={active ? 2.25 : 2}
    />
  )
}

/**
 * A badge says "unread", and its colour says how patiently it can wait —
 * the same ladder the dashboard's Unread card runs on, so the sidebar and
 * the card never tell you two different stories.
 */
export type NavBadge = { count: number; tone?: UnreadTone }

const BADGE_TONE: Record<UnreadTone, string> = {
  clear: "bg-rail-ink/30",
  lead: "bg-accent",
  warn: "bg-[#8A5A05]",
  bad: "bg-tk-tomato",
}

function Badge({ badge, compact }: { badge?: NavBadge; compact?: boolean }) {
  const count = badge?.count ?? 0
  if (count <= 0) return null
  const tone = BADGE_TONE[badge?.tone ?? "lead"]
  if (compact) {
    return (
      <span
        className={cn("absolute right-1 top-1 size-1.5 rounded-full", tone)}
        aria-hidden
      />
    )
  }
  return (
    <span
      className={cn(
        "grid h-[18px] min-w-[20px] place-items-center rounded-full px-1.5 text-[10.5px] font-bold text-tk-linen",
        tone
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  )
}

function NavLeaf({
  item,
  active,
  collapsed,
  badge,
  onNavigate,
}: {
  item: NavLink
  active: boolean
  collapsed?: boolean
  badge?: NavBadge
  onNavigate?: () => void
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-current={active ? "page" : undefined}
      className={leafClass(active, collapsed)}
    >
      {collapsed ? (
        <>
          <NavItemIcon item={item} active={active} />
          <span className="sr-only">{item.label}</span>
          <Badge badge={badge} compact />
        </>
      ) : (
        <>
          <span className="flex min-w-0 flex-1 items-center gap-2.5 truncate">
            <NavItemIcon item={item} active={active} />
            <span className="truncate">{item.label}</span>
          </span>
          <Badge badge={badge} />
        </>
      )}
    </Link>
  )
}

function NavGroup({
  item,
  activeHref,
  collapsed,
  onNavigate,
}: {
  item: NavLink
  activeHref: string | null
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const panelId = useId()
  const parentActive = activeHref === item.href
  const childActive = item.children?.some((c) => activeHref === c.href)
  const subtreeActive = parentActive || Boolean(childActive)
  const [open, setOpen] = useState(subtreeActive)

  useEffect(() => {
    if (subtreeActive) setOpen(true)
  }, [subtreeActive])

  if (collapsed) {
    return (
      <NavLeaf
        item={item}
        active={subtreeActive}
        collapsed
        onNavigate={onNavigate}
      />
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex min-w-0 items-stretch">
        <Link
          href={item.href}
          onClick={onNavigate}
          aria-current={parentActive ? "page" : undefined}
          className={cn(leafClass(parentActive), "min-w-0 flex-1")}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2.5 truncate">
            <NavItemIcon item={item} active={parentActive} />
            <span className="truncate">{item.label}</span>
          </span>
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? "Collapse" : "Expand"} ${item.label}`}
          onClick={() => setOpen((current) => !current)}
          className="flex shrink-0 items-center justify-center rounded-lg px-1.5 text-rail-ink/50 hover:bg-rail-ink/[0.06] hover:text-rail-ink"
        >
          <ChevronDown
            aria-hidden
            className={cn(
              "size-4 transition-transform duration-200 motion-reduce:transition-none",
              open ? "rotate-0" : "-rotate-90"
            )}
          />
        </button>
      </div>
      {open ? (
        <ul
          id={panelId}
          className="ml-4 flex flex-col gap-0.5 border-l border-rail-ink/10 pl-2"
          aria-label={`${item.label} pages`}
        >
          {item.children!.map((child) => {
            const active = activeHref === child.href
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={leafClass(active)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2.5 truncate">
                    <NavItemIcon item={child} active={active} />
                    <span className="truncate">{child.label}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

export function SidebarNav({
  sections = ADMIN_NAV,
  badges,
  collapsed,
  onNavigate,
  className,
}: {
  sections?: readonly NavSection[]
  badges?: Record<string, NavBadge>
  collapsed?: boolean
  onNavigate?: () => void
  className?: string
}) {
  const pathname = usePathname()
  const activeHref = resolveActiveHref(pathname, sections)

  return (
    <nav
      className={cn("flex flex-col gap-4", collapsed && "gap-3", className)}
      aria-label="Admin"
    >
      {sections.map((section, index) => (
        <div key={`${section.title ?? "root"}-${index}`}>
          {section.title && !collapsed ? (
            <h2 className="mb-1.5 px-2.5 font-ui text-[10px] font-bold uppercase tracking-[0.14em] text-rail-ink/45">
              {section.title}
            </h2>
          ) : section.title && collapsed ? (
            <div
              className="mx-auto mb-2 w-6 border-t border-rail-ink/10"
              aria-hidden
            />
          ) : null}
          <div className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              if (item.children?.length) {
                return (
                  <NavGroup
                    key={item.href}
                    item={item}
                    activeHref={activeHref}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                  />
                )
              }

              return (
                <NavLeaf
                  key={item.href}
                  item={item}
                  active={activeHref === item.href}
                  collapsed={collapsed}
                  badge={badges?.[item.href]}
                  onNavigate={onNavigate}
                />
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}
