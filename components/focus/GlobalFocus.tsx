"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition, type ReactNode } from "react"
import { DndContext } from "@dnd-kit/core"
import { StickyNote } from "lucide-react"
import { FocusNote, type NoteOps } from "@/components/focus/FocusNote"
import { ModeSwitch } from "@/components/focus/FocusTray"
import { cn } from "@/lib/cn"
import { FOCUS_MAX, type FocusCard, type FocusMode } from "@/lib/focus"
import { completeFocusAction, moveFocusAction, setFocusGlobalAction, setFocusModeAction } from "@/lib/focus-actions"
import { ROUTES } from "@/lib/nav"

/**
 * The global set on the dashboard: the post-its pinned across clients, the
 * client flag on each one. No drag here — order is each client's own — but
 * ✓, unpin and "back to the queue" work the same as on the Board. Renders
 * nothing when nothing is pinned.
 */
export function GlobalFocus({
  cards: initial,
  mode: initialMode,
  always = false,
  actions,
}: {
  cards: FocusCard[]
  mode: FocusMode
  /** Show the empty slots too (the roster page); the dashboard hides an empty set. */
  always?: boolean
  /** Controls beside the 3 | 1 switch (the roster puts "New client" here). */
  actions?: ReactNode
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [cards, setCards] = useState(initial)
  const [mode, setMode] = useState(initialMode)
  useEffect(() => setCards(initial), [initial])
  if (cards.length === 0 && !always) return null

  function run(work: () => Promise<unknown>) {
    start(async () => {
      try {
        await work()
      } finally {
        router.refresh()
      }
    })
  }
  const ops: NoteOps = {
    onDone: (id) => {
      setCards((c) => c.filter((x) => x.id !== id))
      run(() => completeFocusAction(id))
    },
    onGlobal: (id, global) => {
      if (!global) setCards((c) => c.filter((x) => x.id !== id))
      run(() => setFocusGlobalAction(id, global))
    },
    onToQueue: (id) => run(() => moveFocusAction(id, { queue: 0 })),
    onUnfocus: (id) => {
      setCards((c) => c.filter((x) => x.id !== id))
      run(() => setFocusGlobalAction(id, false))
    },
  }
  const showing = cards.slice(0, FOCUS_MAX[mode])
  const rest = cards.length - showing.length

  return (
    <section className="flex flex-col gap-2.5" aria-label="Global focus">
      <div className="flex items-center gap-2.5">
        <h2 className="flex items-center gap-1.5 font-ui text-[13px] font-bold text-tk-onyx">
          <StickyNote className="size-3.5" aria-hidden />
          Focus
        </h2>
        <span className="hidden truncate text-[11.5px] text-ink-3 md:inline">
          {cards.length === 0
            ? "Nothing pinned — the pushpin on a post-it lifts it here"
            : `${cards.length} pinned across ${new Set(cards.map((c) => c.clientSlug)).size} client${new Set(cards.map((c) => c.clientSlug)).size === 1 ? "" : "s"}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {actions}
          <ModeSwitch
            mode={mode}
            onMode={(m) => {
              setMode(m)
              start(async () => {
                await setFocusModeAction(m)
              })
            }}
          />
        </div>
      </div>
      <DndContext>
        <div className={cn("grid items-start gap-3.5 px-1 pb-2 pt-2", mode === "one" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-3")}>
          {Array.from({ length: Math.max(0, FOCUS_MAX[mode] - showing.length) }, (_, i) => (
            <div
              key={`empty-${i}`}
              className="grid min-h-[150px] place-items-center rounded-md border-[1.5px] border-dashed border-line-strong px-3 text-center font-ui text-[11.5px] font-semibold text-ink-3"
            >
              <span>
                Empty slot
                <span className="mt-1 block font-medium opacity-80">pin a card on a client&apos;s Board</span>
              </span>
            </div>
          ))}
          {showing.map((card, i) => (
            <div key={card.id} className="min-w-0">
              <FocusNote card={card} size={mode === "one" ? "sheet" : "slot"} tilt={mode === "one" ? -0.3 : [-1.1, 0.7, -0.5][i] ?? 0} ops={ops} />
              <Link href={ROUTES.client(card.clientSlug)} className="mt-2 block px-1 font-ui text-[10.5px] font-semibold text-ink-3 hover:text-accent-ink">
                {card.clientName} → Board
              </Link>
            </div>
          ))}
        </div>
      </DndContext>
      {rest > 0 ? <p className="px-1 text-[11.5px] text-ink-3">+{rest} more pinned — switch to 3, or unpin some on their Boards.</p> : null}
    </section>
  )
}
