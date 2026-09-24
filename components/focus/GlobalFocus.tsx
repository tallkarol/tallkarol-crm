"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from "@dnd-kit/core"
import type { NoteOps } from "@/components/focus/FocusNote"
import { FocusTray } from "@/components/focus/FocusTray"
import { placeInOrder, windowOf, type FocusCard, type FocusKind, type FocusMode, type Paper } from "@/lib/focus"
import {
  addGlobalFocusAction,
  completeFocusAction,
  moveGlobalFocusAction,
  setFocusGlobalAction,
  setFocusModeAction,
  type FocusTarget,
} from "@/lib/focus-actions"

/**
 * What a card dragged onto the tray from elsewhere on the page carries —
 * enough to draw the post-it before the server answers, and to write the
 * row.
 */
export type FocusPick = {
  refKind: FocusKind
  refId: string
  clientId: string | null
  clientSlug: string | null
  clientName: string | null
  title: string
  paper: Paper
  project: string | null
  dueLabel: string | null
  overdue: boolean
  href: string
}

type DeskDnd = {
  /** Put a pick on the tray now — the card buttons use this without a drag. */
  focus: (pick: FocusPick, target: FocusTarget) => void
  /** Record ids already on the tray, so a card can show it is pinned. */
  focusedRefIds: Set<string>
  /** A drop that landed on one of the page's own zones (a reorder) comes back through here. */
  setDropHandler: (zone: string, handler: ((event: DragEndEvent) => void) | null) => void
}

const DeskDndContext = createContext<DeskDnd | null>(null)

/**
 * Where the pointer is decides the drop, not where the dragged box overlaps.
 * A list row is as wide as the card, so its translated rectangle covers all
 * three slots and the queue at once and the first slot always won; the
 * pointer is unambiguous. Boxes are the fallback for keyboard drags.
 */
const dropWhereThePointerIs: CollisionDetection = (args) => {
  const under = pointerWithin(args)
  return under.length ? under : rectIntersection(args)
}

/** The overlay chip rides under the cursor, whatever part of a wide row was grabbed. */
const snapToCursor: Modifier = ({ activatorEvent, draggingNodeRect, transform }) => {
  const e = activatorEvent as PointerEvent | null
  if (!draggingNodeRect || !e || typeof e.clientX !== "number") return transform
  return {
    ...transform,
    x: transform.x + (e.clientX - draggingNodeRect.left) - draggingNodeRect.width / 2,
    y: transform.y + (e.clientY - draggingNodeRect.top) - draggingNodeRect.height / 2,
  }
}

/** The desk's drag context, for anything rendered under `GlobalFocus`. */
export function useDeskDnd() {
  return useContext(DeskDndContext)
}

/**
 * The global set as a tray — the post-its pinned across clients (and the
 * house rows with no client), the client's name on each one, the queue
 * beside them — and one DndContext over it and whatever the page renders
 * under it, so a card from Needs attention can be dropped straight onto a
 * slot or the queue. Order here is the set's own (`global_position`); a
 * client's Board keeps its own.
 */
export function GlobalFocus({
  cards: initial,
  mode: initialMode,
  actions,
  children,
}: {
  cards: FocusCard[]
  mode: FocusMode
  /** Controls beside the 3 | 1 switch (the roster puts "New client" here). */
  actions?: ReactNode
  /** The rest of the page, inside the same drag context. */
  children?: ReactNode
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [cards, setCards] = useState(initial)
  const [mode, setMode] = useState(initialMode)
  const [active, setActive] = useState<{ title: string; paper: Paper } | null>(null)
  const handlers = useRef(new Map<string, (event: DragEndEvent) => void>())
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  useEffect(() => setCards(initial), [initial])

  function run(work: () => Promise<unknown>) {
    start(async () => {
      try {
        await work()
      } finally {
        router.refresh()
      }
    })
  }

  function changeMode(next: FocusMode) {
    setMode(next)
    start(async () => {
      await setFocusModeAction(next)
    })
  }

  /** Reorder the local copy the way the server will. */
  function reorderLocal(id: string, target: FocusTarget) {
    setCards((current) => {
      const order = placeInOrder(
        [...current].sort((a, b) => a.position - b.position).map((c) => c.id),
        id,
        target,
        mode
      )
      return current.map((c) => ({ ...c, position: order.indexOf(c.id) }))
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
    onToQueue: (id) => {
      reorderLocal(id, { queue: 0 })
      run(() => moveGlobalFocusAction(id, { queue: 0 }))
    },
    // Off the tray; the card stays on its client's Board (a house row is gone).
    onUnfocus: (id) => {
      setCards((c) => c.filter((x) => x.id !== id))
      run(() => setFocusGlobalAction(id, false))
    },
  }

  function onPromote(id: string) {
    reorderLocal(id, { front: true })
    run(() => moveGlobalFocusAction(id, { front: true }))
  }

  const focusPick = useCallback(
    (pick: FocusPick, target: FocusTarget) => {
      setCards((current) => {
        if (current.some((c) => c.refKind === pick.refKind && c.refId === pick.refId)) return current
        // A provisional card so the slot fills before the server answers.
        const provisional: FocusCard = {
          id: `pending:${pick.refKind}:${pick.refId}`,
          refKind: pick.refKind,
          refId: pick.refId,
          position: current.length,
          global: true,
          paper: pick.paper,
          title: pick.title,
          project: pick.project,
          dueOn: null,
          dueLabel: pick.dueLabel,
          overdue: pick.overdue,
          checklist: null,
          steps: [],
          notes: "",
          href: pick.href,
          clientSlug: pick.clientSlug,
          clientName: pick.clientName,
        }
        const order = placeInOrder(
          [...current]
            .sort((a, b) => a.position - b.position)
            .map((c) => c.id)
            .concat(provisional.id),
          provisional.id,
          target,
          mode
        )
        return [...current, provisional].map((c) => ({ ...c, position: order.indexOf(c.id) }))
      })
      run(() =>
        addGlobalFocusAction({
          clientId: pick.clientId,
          clientSlug: pick.clientSlug,
          refKind: pick.refKind,
          refId: pick.refId,
          target,
        })
      )
    },
    // `run` is a fresh closure each render but only ever reaches the same router.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode]
  )

  const setDropHandler = useCallback((zone: string, handler: ((event: DragEndEvent) => void) | null) => {
    if (handler) handlers.current.set(zone, handler)
    else handlers.current.delete(zone)
  }, [])

  const focusedRefIds = useMemo(() => new Set(cards.map((c) => c.refId)), [cards])
  const desk = useMemo<DeskDnd>(() => ({ focus: focusPick, focusedRefIds, setDropHandler }), [focusPick, focusedRefIds, setDropHandler])

  function onDragStart(event: DragStartEvent) {
    const data = event.active.data.current as { kind?: string; id?: string; title?: string; pick?: FocusPick } | undefined
    if (data?.kind === "focus") {
      const card = cards.find((c) => c.id === data.id)
      setActive(card ? { title: card.title, paper: card.paper } : null)
    } else if (data?.pick) setActive({ title: data.pick.title, paper: data.pick.paper })
    else setActive(null)
  }

  function onDragEnd(event: DragEndEvent) {
    setActive(null)
    const over = event.over
    const data = event.active.data.current as { kind?: string; id?: string; pick?: FocusPick } | undefined
    if (!over || !data) return
    const zone = over.data.current as { zone?: string; index?: number } | undefined
    if (!zone?.zone) return
    const target: FocusTarget | null =
      zone.zone === "slot"
        ? { slot: zone.index ?? 0 }
        : zone.zone === "queue"
          ? { queue: null }
          : zone.zone === "qbefore"
            ? { queue: zone.index ?? 0 }
            : null
    if (target) {
      if (data.kind === "focus" && data.id) {
        const id = data.id
        reorderLocal(id, target)
        run(() => moveGlobalFocusAction(id, target))
      } else if (data.kind === "pick" && data.pick) {
        focusPick(data.pick, target)
      }
      return
    }
    // One of the page's own zones — a reorder inside Needs attention.
    handlers.current.get(zone.zone)?.(event)
  }

  const { showing, queue } = windowOf(cards, mode)
  const pinnedOn = new Set(cards.map((c) => c.clientSlug ?? "house")).size
  const hint =
    cards.length === 0
      ? "Nothing pinned — drag a card up from below, or push the pin on a client's Board"
      : `${cards.length} pinned across ${pinnedOn} client${pinnedOn === 1 ? "" : "s"}`

  return (
    <DeskDndContext.Provider value={desk}>
      <DndContext
        sensors={sensors}
        collisionDetection={dropWhereThePointerIs}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActive(null)}
      >
        {/* Nothing on a desktop (display: contents). On a phone a flex column,
            so the page can put a card above the tray with `order` — the
            dashboard leads with Needs attention there. */}
        <div className="contents max-rail:flex max-rail:flex-col max-rail:gap-3.5">
          <div className="contents max-rail:order-2 max-rail:block">
            <FocusTray
              showing={showing}
              queue={queue}
              mode={mode}
              ops={ops}
              onMode={changeMode}
              onPromote={onPromote}
              actions={actions}
              hint={hint}
              flag="client"
              queueHint="Queue is empty — drag a card up from Needs attention"
            />
          </div>
          {children}
        </div>
        <DragOverlay modifiers={[snapToCursor]} dropAnimation={null}>
          {active ? (
            <div
              className="tk-note w-56 rotate-2 px-3.5 py-3 text-[13px] font-semibold leading-snug text-[--paper-ink] shadow-overlay"
              style={{ "--paper": `var(--paper-${active.paper})` } as React.CSSProperties}
            >
              {active.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </DeskDndContext.Provider>
  )
}
