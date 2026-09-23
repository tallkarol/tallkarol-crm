"use client"

import Link from "next/link"
import { useEffect } from "react"
import { usePanelSlot } from "@/components/nav/PanelSlot"
import type { ClientGroup } from "@/lib/client-groups"
import { markColor } from "@/lib/client-colors"
import { ROUTES } from "@/lib/nav"

/**
 * The dock panel while you are on the roster: just the clients, grouped
 * (active retainer · active project · completed · internal). A row opens
 * that client's Board, where the panel switches into client mode.
 */
export function ClientsPanel({ groups }: { groups: ClientGroup[] }) {
  const total = groups.reduce((n, g) => n + g.rows.length, 0)
  return (
    <aside
      aria-label="Clients"
      data-chrome="sidebar"
      className="hidden w-[236px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-rail-line bg-rail-2 px-3 py-5 rail:flex"
    >
      <div className="flex items-baseline justify-between px-2.5">
        <h2 className="font-display text-[17px] font-bold tracking-[-0.01em] text-rail-ink">Clients</h2>
        <span className="font-mono text-[10.5px] text-rail-ink-3">{total}</span>
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
                  className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 font-ui text-[13px] leading-[19px] text-rail-ink-2 transition-colors hover:bg-rail-hover hover:text-rail-ink"
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

/** Puts the grouped client list into the dock while the roster is mounted. */
export function ClientsPanelMount({ groups }: { groups: ClientGroup[] }) {
  const { setOverride } = usePanelSlot()
  useEffect(() => {
    setOverride(<ClientsPanel groups={groups} />)
    return () => setOverride(null)
  }, [groups, setOverride])
  return null
}
