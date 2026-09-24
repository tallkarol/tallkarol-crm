"use client"

import Link from "next/link"
import { Pin, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { navIcon } from "@/lib/nav-icons"
import type { NavBadge, NavGroup } from "@/lib/nav"

const BADGE_TONE: Record<NonNullable<NavBadge["tone"]>, string> = {
  clear: "bg-rail-ink/30",
  lead: "bg-accent",
  warn: "bg-[--rail-warn]",
  bad: "bg-tk-tomato",
}

function RowBadge({ badge }: { badge?: NavBadge }) {
  if (!badge || badge.count <= 0) return null
  return (
    <span
      className={cn(
        "grid h-[18px] min-w-5 place-items-center rounded-full px-1.5 font-ui text-[10.5px] font-bold text-tk-linen",
        BADGE_TONE[badge.tone ?? "lead"]
      )}
    >
      {badge.count > 99 ? "99+" : badge.count}
    </span>
  )
}

/**
 * The 236px rail-2 panel beside the dock: a group's title and its rows.
 * (Time has no panel since 24 Sep 2026, and its clock card went with it —
 * the floating clock still shows a running punch.) `onClose` swaps the desktop pin/unpin
 * toggle for a phone sheet's X, since the mockup draws two different
 * dismiss affordances for the same "make this go away" action.
 */
export function HubPanel({
  group,
  activeHref,
  badges,
  pinned,
  onTogglePinned,
  onClose,
  className,
}: {
  group: NavGroup
  /**
   * The one row to highlight — resolved by AppShell's longest-prefix match
   * (`resolveActiveNav`), not recomputed per row here. A naive per-row
   * `pathname.startsWith(item.href)` would light up BOTH "Timesheet" and
   * "Review" at once on /timesheet/review, since "/timesheet" prefixes
   * "/timesheet/review" too.
   */
  activeHref: string | null
  badges: Record<string, NavBadge>
  pinned?: boolean
  onTogglePinned?: () => void
  onClose?: () => void
  /**
   * The wrapper's own box — width, background, padding, rounding, border.
   * Left to the caller rather than defaulted here because the desktop panel
   * (a fixed 236px column with a right hairline) and the phone sheet (full
   * width, rounded top corners, no border) do not share a box, only the
   * content inside it.
   */
  className: string
}) {
  return (
    <aside
      aria-label={`${group.label} pages`}
      data-chrome="sidebar"
      role={onClose ? "dialog" : undefined}
      aria-modal={onClose ? true : undefined}
      className={cn("flex flex-col gap-3.5", className)}
    >
      {onClose ? (
        <span aria-hidden className="mx-auto -mt-1 h-1 w-9 shrink-0 rounded-full bg-rail-ink/[0.22]" />
      ) : null}
      <div className="flex items-center justify-between py-0 pl-2.5 pr-1">
        <h2 className="font-display text-[17px] font-bold tracking-[-0.01em] text-rail-ink">{group.label}</h2>
        {onClose ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-full bg-rail-ink/[0.08] text-rail-ink"
          >
            <X className="size-[18px]" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin this panel" : "Pin this panel open"}
            onClick={onTogglePinned}
            className={cn(
              "grid size-7 place-items-center rounded-lg",
              pinned ? "bg-[--rail-active] text-[--rail-active-icon]" : "text-[--rail-active-icon] hover:bg-rail-hover"
            )}
          >
            <Pin className="size-[15px]" aria-hidden />
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-0.5">
        {group.items.map((item) => {
          const active = item.href === activeHref
          const Icon = navIcon(item.icon)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between gap-2.5 rounded-lg px-2.5 font-ui text-[13px] leading-[19px] transition-colors",
                  onClose ? "py-3" : "py-1.5",
                  active
                    ? "bg-[--rail-active] font-semibold text-white"
                    : "text-rail-ink-2 hover:bg-rail-hover hover:text-rail-ink"
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon
                    aria-hidden
                    className={cn("size-4 shrink-0", active ? "text-[--rail-active-icon]" : "text-rail-ink/50")}
                    strokeWidth={active ? 2.25 : 2}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <RowBadge badge={badges[item.href]} />
              </Link>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
