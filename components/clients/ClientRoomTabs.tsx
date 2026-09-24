"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/cn"
import type { ClientPanelData } from "@/lib/client-rooms"
import { CLIENT_ROOMS, ROUTES, clientRoomOf } from "@/lib/nav"
import { navIcon } from "@/lib/nav-icons"

/**
 * A client's rooms on a phone (24 Sep 2026): a chip row under the header,
 * since the dock panel that lists them is desktop-only. Same rooms, same
 * badges as ClientPanel.
 */
export function ClientRoomTabs({ slug, badges }: { slug: string; badges: ClientPanelData["badges"] }) {
  const room = clientRoomOf(usePathname())
  return (
    <nav
      aria-label="Rooms"
      className="flex shrink-0 gap-2 overflow-x-auto border-b border-line px-4 py-2.5 [scrollbar-width:none] rail:hidden [&::-webkit-scrollbar]:hidden"
    >
      {CLIENT_ROOMS.map((r) => {
        const active = r.id === room
        const Icon = navIcon(r.icon)
        const count = r.id === "inbox" ? badges.inbox : r.id === "monitors" ? badges.monitors : r.id === "board" ? badges.board : 0
        const hot = (r.id === "inbox" && badges.inboxHot) || (r.id === "monitors" && count > 0)
        return (
          <Link
            key={r.id}
            href={ROUTES.clientRoom(slug, r.id)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 font-ui text-[13px] font-semibold",
              active ? "border-transparent bg-rail text-rail-ink" : "border-line bg-card text-ink-2"
            )}
          >
            <Icon className={cn("size-3.5", active ? "text-[--rail-active-icon]" : "text-ink-3")} aria-hidden />
            {r.label}
            {count > 0 ? (
              <span
                className={cn(
                  "grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10.5px] font-bold text-tk-linen",
                  hot ? "bg-tk-tomato" : "bg-accent"
                )}
              >
                {count > 99 ? "99+" : count}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
