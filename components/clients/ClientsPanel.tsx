"use client"

import Link from "next/link"
import { X } from "lucide-react"
import { cn } from "@/lib/cn"
import type { ClientGroup } from "@/lib/client-groups"
import { markColor } from "@/lib/client-colors"
import { ROUTES } from "@/lib/nav"

/**
 * The Clients group's panel: just the clients, grouped (active retainer ·
 * active project · completed · internal). The admin layout loads the roster
 * and AppShell puts this beside every page in the group — the roster,
 * Insights, Reports, … — so it is there from the first paint; nothing swaps
 * it in after the fact (the group's own rows used to show for a beat first;
 * Karol, 24 Sep 2026). A row opens that client's Board, where the panel
 * switches into client mode. `onClose` marks the phone sheet, which gets an
 * X in place of the count and the touch row height, as HubPanel does.
 */
export function ClientsPanel({
  groups,
  onClose,
  className,
}: {
  groups: ClientGroup[]
  onClose?: () => void
  /** The wrapper's own box — the desktop column or the phone sheet, see HubPanel. */
  className: string
}) {
  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  return (
    <aside
      aria-label="Clients"
      data-chrome="sidebar"
      role={onClose ? "dialog" : undefined}
      aria-modal={onClose ? true : undefined}
      className={cn("flex flex-col gap-2", className)}
    >
      {onClose ? (
        <span aria-hidden className="mx-auto -mt-1 h-1 w-9 shrink-0 rounded-full bg-rail-ink/[0.22]" />
      ) : null}
      <div className={cn("flex justify-between", onClose ? "items-center pl-2.5 pr-1" : "items-baseline px-2.5")}>
        <h2 className="font-display text-[17px] font-bold tracking-[-0.01em] text-rail-ink">Clients</h2>
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
          <span className="font-mono text-[10.5px] text-rail-ink-3">{total}</span>
        )}
      </div>

      {groups.map((group) => (
        <section key={group.id} aria-label={group.label} className="flex flex-col gap-0.5">
          <h3 className="px-2.5 pb-1 pt-2 font-ui text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-rail-ink-3">
            {group.label} <span className="ml-1 font-mono font-medium normal-case tracking-normal">{group.rows.length}</span>
          </h3>
          <ul className="flex flex-col gap-0.5">
            {group.rows.map((c) => (
              <li key={c.slug}>
                <Link
                  href={ROUTES.client(c.slug)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 font-ui text-[13px] leading-[19px] text-rail-ink-2 transition-colors hover:bg-rail-hover hover:text-rail-ink",
                    onClose ? "py-3" : "py-1.5"
                  )}
                >
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: markColor(c.color) }} />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="flex shrink-0 gap-1">
                    {c.hot ? <span title="Tickets waiting on you" className="size-1.5 rounded-full bg-tk-tomato" /> : null}
                    {c.warn ? <span title="Overdue tasks" className="size-1.5 rounded-full bg-[--rail-warn]" /> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  )
}
