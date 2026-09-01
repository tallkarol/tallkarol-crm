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

function leafClass(active: boolean, collapsed?: boolean) {
  return cn(
    "relative flex items-center rounded-r-lg text-[13px] font-medium transition-colors duration-150",
    collapsed
      ? "justify-center px-2 py-[5px]"
      : "justify-between gap-2 px-3 py-[5px]",
    active
      ? "bg-tk-teal/10 text-tk-onyx before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-tk-teal"
      : "text-tk-slate hover:bg-tk-linen hover:text-tk-onyx"
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
        "size-4 shrink-0",
        active ? "text-tk-teal" : "text-tk-slate/70",
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
  clear: "bg-tk-slate/40",
  lead: "bg-tk-teal",
  warn: "bg-[#8A5A05]",
  bad: "bg-[#A62228]",
}

function Badge({ badge, compact }: { badge?: NavBadge; compact?: boolean }) {
  const count = badge?.count ?? 0
  if (count <= 0) return null
  const tone = BADGE_TONE[badge?.tone ?? "lead"]
  if (compact) {
    return (
      <span
        className={cn("absolute top-1 right-1 size-1.5 rounded-full", tone)}
        aria-hidden
      />
    )
  }
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-px text-[10px] font-semibold text-tk-linen",
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
          <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
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
          className={cn(leafClass(parentActive), "min-w-0 flex-1")}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
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
          className={cn(
            "flex shrink-0 items-center justify-center rounded-lg px-1.5",
            "text-tk-slate/70 hover:bg-tk-linen hover:text-tk-onyx"
          )}
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
          className="ml-3 flex flex-col gap-0.5 border-l border-tk-slate/15 pl-3"
          aria-label={`${item.label} pages`}
        >
          {item.children!.map((child) => {
            const active = activeHref === child.href
            return (
              <li key={child.href}>
                <Link
                  href={child.href}
                  onClick={onNavigate}
                  className={leafClass(active)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
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
      className={cn("flex flex-col gap-3.5", collapsed && "gap-3", className)}
      aria-label="Admin"
    >
      {sections.map((section, index) => (
        <div key={`${section.title ?? "root"}-${index}`}>
          {section.title && !collapsed ? (
            <h2 className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-tk-slate/70">
              {section.title}
            </h2>
          ) : section.title && collapsed ? (
            <div
              className="mx-auto mb-2 w-6 border-t border-tk-slate/15"
              aria-hidden
            />
          ) : null}
          <div
            className={cn(
              "flex flex-col gap-0.5",
              !collapsed && "ml-2 border-l border-tk-slate/15 pl-3"
            )}
          >
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
