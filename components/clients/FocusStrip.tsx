"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useTransition } from "react"
import { ArrowLeft, Check, StickyNote } from "lucide-react"
import { cn } from "@/lib/cn"
import { markColor } from "@/lib/client-colors"
import { PAPER_LABEL, type FocusCard } from "@/lib/focus"
import { completeFocusAction } from "@/lib/focus-actions"
import { ROUTES, clientRoomOf } from "@/lib/nav"

/**
 * The docked strip on every client room except the Board: the showing
 * cards as chips, the first one with a ✓, so the thing you are doing stays
 * on screen while you read a ticket or a monitor. Hides itself on the Board,
 * where the tray is already on the page.
 */
export function FocusStrip({ cards, queued, client }: { cards: FocusCard[]; queued: number; client: { slug: string; color: string } }) {
  const pathname = usePathname()
  const router = useRouter()
  const [, start] = useTransition()
  if (clientRoomOf(pathname) === "board") return null

  return (
    <div className="flex h-[46px] shrink-0 items-center gap-2 border-t border-line bg-card px-3.5 shadow-[0_-8px_20px_-16px_rgb(0_0_0_/_0.35)]">
      <span className="flex items-center gap-1 font-ui text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-ink-3">
        <StickyNote className="size-3" aria-hidden />
        Focus {cards.length ? `${cards.length}` : ""}
      </span>
      {cards.length === 0 ? (
        <Link href={ROUTES.client(client.slug)} className="font-ui text-[11px] font-semibold text-accent-ink hover:underline">
          Pick from the board
        </Link>
      ) : (
        cards.map((card, i) => (
          <div
            key={card.id}
            style={{ "--paper": `var(--paper-${card.paper})`, borderLeft: `3px solid ${markColor(client.color)}` } as React.CSSProperties}
            className={cn(
              "tk-qnote flex h-[30px] min-w-0 items-center gap-2 pl-2.5 pr-1.5 text-xs",
              i === 0 ? "max-w-[340px] font-semibold" : "hidden max-w-[220px] opacity-80 md:flex"
            )}
          >
            <span className="shrink-0 font-ui text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-[--paper-ink-3]">{PAPER_LABEL[card.paper]}</span>
            <span className="min-w-0 truncate">{card.title}</span>
            {i === 0 ? (
              <button
                type="button"
                aria-label="Done"
                title="Done"
                onClick={() =>
                  start(async () => {
                    await completeFocusAction(card.id)
                    router.refresh()
                  })
                }
                className="grid size-[22px] shrink-0 place-items-center rounded text-[--paper-ink-2] hover:bg-[--paper-line] hover:text-[--paper-ink]"
              >
                <Check className="size-3" aria-hidden />
              </button>
            ) : null}
          </div>
        ))
      )}
      <span className="flex-1" />
      <span className="hidden text-[11px] text-ink-3 sm:inline">{queued} queued</span>
      <Link href={ROUTES.client(client.slug)} className="hidden h-[22px] items-center gap-1 rounded-md border border-line bg-card px-2 font-ui text-[10.5px] font-semibold text-ink-2 hover:text-tk-onyx sm:inline-flex">
        <ArrowLeft className="size-2.5" aria-hidden />
        Board
      </Link>
    </div>
  )
}
