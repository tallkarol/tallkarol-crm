"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { FocusTray } from "@/components/focus/FocusTray"
import { Takeover } from "@/components/focus/Takeover"
import { HorizonBoard } from "@/components/clients/HorizonBoard"
import type { NoteOps } from "@/components/focus/FocusNote"
import { cn } from "@/lib/cn"
import { FOCUS_MAX, placeInOrder, windowOf, type FocusCard, type FocusMode } from "@/lib/focus"
import {
  addFocusAction,
  completeFocusAction,
  deferFocusAction,
  moveFocusAction,
  moveTaskHorizonAction,
  removeFocusAction,
  setFocusGlobalAction,
  setFocusModeAction,
  type FocusTarget,
} from "@/lib/focus-actions"
import { bandBoard, horizonOf, type BoardColumns, type Horizon } from "@/lib/horizon"
import { createTask } from "@/lib/task-actions"
import type { HubTask } from "@/lib/task-view"

/**
 * The Board room's interactive half: one DndContext over the Focus row and
 * the horizon columns, so a card can move between them. State is a local
 * copy of what the server rendered; a drop applies the pure rule locally,
 * fires the action, then refreshes so the server's truth replaces the copy.
 */
export function BoardRoom({
  client,
  focus: initialFocus,
  tasks: initialTasks,
  mode: initialMode,
  today,
  takeover: initialTakeover = false,
  middle,
}: {
  client: { id: string; slug: string; name: string; short: string }
  focus: FocusCard[]
  /** Every open-or-recent task of the client; the board bands them itself. */
  tasks: HubTask[]
  mode: FocusMode
  today: string
  takeover?: boolean
  /** The week strip and Signals, server-rendered, between Focus and the board. */
  middle: React.ReactNode
}) {
  const router = useRouter()
  const [, start] = useTransition()
  const [focus, setFocus] = useState(initialFocus)
  const [tasks, setTasks] = useState(initialTasks)
  const [mode, setMode] = useState<FocusMode>(initialMode)
  const [takeover, setTakeover] = useState(initialTakeover)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // Server refreshes replace the local copies.
  useEffect(() => setFocus(initialFocus), [initialFocus])
  useEffect(() => setTasks(initialTasks), [initialTasks])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === "1") changeMode("one")
      if (e.key === "3") changeMode("three")
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  })

  const { showing, queue } = windowOf(focus, mode)
  const focusedTaskIds = new Set(focus.filter((c) => c.refKind === "task").map((c) => c.refId))
  const columns: BoardColumns = bandBoard(tasks, today, focusedTaskIds)

  function changeMode(next: FocusMode) {
    setMode(next)
    start(async () => {
      await setFocusModeAction(next)
    })
  }

  function run(work: () => Promise<unknown>) {
    start(async () => {
      try {
        await work()
      } finally {
        router.refresh()
      }
    })
  }

  /** Reorder the local copy the way the server will. */
  function reorderLocal(id: string, target: FocusTarget) {
    const order = placeInOrder(
      [...focus].sort((a, b) => a.position - b.position).map((c) => c.id),
      id,
      target,
      mode
    )
    setFocus((cards) => cards.map((c) => ({ ...c, position: order.indexOf(c.id) })))
  }

  const ops: NoteOps = {
    onDone: (id) => {
      setFocus((cards) => cards.filter((c) => c.id !== id))
      run(() => completeFocusAction(id))
    },
    onGlobal: (id, global) => {
      setFocus((cards) => cards.map((c) => (c.id === id ? { ...c, global } : c)))
      run(() => setFocusGlobalAction(id, global))
    },
    onToQueue: (id) => {
      reorderLocal(id, { queue: 0 })
      run(() => moveFocusAction(id, { queue: 0 }))
    },
    onUnfocus: (id) => {
      setFocus((cards) => cards.filter((c) => c.id !== id))
      run(() => deferFocusAction(id, "week"))
    },
  }

  const onPromote = useCallback(
    (id: string) => {
      reorderLocal(id, { front: true })
      run(() => moveFocusAction(id, { front: true }))
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focus, mode]
  )

  function focusTask(taskId: string, target?: FocusTarget) {
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return
    // A provisional card so the slot fills before the server answers.
    const provisional: FocusCard = {
      id: `pending:${taskId}`,
      refKind: "task",
      refId: taskId,
      position: focus.length,
      global: false,
      paper: task.source === "punchlist" ? "punch" : "task",
      title: task.title,
      project: task.projectName,
      dueOn: task.dueOn,
      dueLabel: task.dueOn,
      overdue: !!task.dueOn && task.dueOn < today,
      checklist: task.items.total ? task.items : null,
      steps: [],
      notes: task.notes,
      href: `/tasks/${taskId}`,
      clientSlug: client.slug,
      clientName: client.name,
    }
    const order = placeInOrder([...focus].sort((a, b) => a.position - b.position).map((c) => c.id).concat(provisional.id), provisional.id, target ?? { queue: null }, mode)
    setFocus([...focus, provisional].map((c) => ({ ...c, position: order.indexOf(c.id) })))
    run(() => addFocusAction({ clientId: client.id, clientSlug: client.slug, refKind: "task", refId: taskId, target }))
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const over = event.over
    const data = event.active.data.current as { kind: "focus" | "task"; id: string } | undefined
    if (!over || !data) return
    const zone = over.data.current as { zone: string; index?: number; id?: string; horizon?: Horizon } | undefined
    if (!zone) return

    if (data.kind === "focus") {
      if (zone.zone === "slot") {
        reorderLocal(data.id, { slot: zone.index ?? 0 })
        run(() => moveFocusAction(data.id, { slot: zone.index ?? 0 }))
      } else if (zone.zone === "queue") {
        reorderLocal(data.id, { queue: null })
        run(() => moveFocusAction(data.id, { queue: null }))
      } else if (zone.zone === "qbefore") {
        const idx = zone.index ?? 0
        reorderLocal(data.id, { queue: idx })
        run(() => moveFocusAction(data.id, { queue: idx }))
      } else if (zone.zone === "col" && zone.horizon) {
        const card = focus.find((c) => c.id === data.id)
        setFocus((cards) => cards.filter((c) => c.id !== data.id))
        if (card?.refKind === "task") setTasks((list) => list.map((t) => (t.id === card.refId ? applyHorizon(t, zone.horizon!, today) : t)))
        run(() => deferFocusAction(data.id, zone.horizon!))
      }
      return
    }

    // A board card.
    if (zone.zone === "slot") focusTask(data.id, { slot: zone.index ?? 0 })
    else if (zone.zone === "queue") focusTask(data.id, { queue: null })
    else if (zone.zone === "qbefore") focusTask(data.id, { queue: zone.index ?? 0 })
    else if (zone.zone === "col" && zone.horizon) {
      const task = tasks.find((t) => t.id === data.id)
      if (!task || horizonOf(task, today) === zone.horizon) return
      setTasks((list) => list.map((t) => (t.id === data.id ? applyHorizon(t, zone.horizon!, today) : t)))
      run(() => moveTaskHorizonAction(data.id, zone.horizon!, { dueOn: task.dueOn }))
    }
  }

  const active = activeId
    ? focus.find((c) => `focus:${c.id}` === activeId)?.title ?? tasks.find((t) => `task:${t.id}` === activeId)?.title ?? null
    : null

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="flex flex-col gap-3">
        <FocusTray
          showing={showing}
          queue={queue}
          mode={mode}
          ops={ops}
          onMode={changeMode}
          onTakeover={() => setTakeover(true)}
          onPromote={onPromote}
          onAdd={async (title) => {
            const result = await createTask({ title, clientId: client.id, source: "manual" })
            if (result.ok) {
              await addFocusAction({ clientId: client.id, clientSlug: client.slug, refKind: "task", refId: result.data.id })
            }
            router.refresh()
          }}
        />
        <div className="border-t border-line pt-3">{middle}</div>
        <div className="border-t border-line pt-3">
          <HorizonBoard columns={columns} today={today} peekBase={`/clients/${client.slug}`} onFocus={(id) => focusTask(id)} activeId={activeId} />
        </div>
      </div>

      <DragOverlay>
        {active ? (
          <div className={cn("w-56 rotate-2 rounded-xl border border-line bg-card px-3 py-2.5 text-[13px] font-medium text-tk-onyx shadow-overlay")}>{active}</div>
        ) : null}
      </DragOverlay>

      {takeover ? (
        <Takeover
          client={client}
          showing={showing}
          queueCount={queue.length}
          mode={mode}
          ops={ops}
          onMode={changeMode}
          onPromote={onPromote}
          onClose={() => setTakeover(false)}
        />
      ) : null}
    </DndContext>
  )
}

/** The local guess of what a horizon drop writes — replaced on refresh. */
function applyHorizon(task: HubTask, horizon: Horizon, today: string): HubTask {
  if (horizon === "done") return { ...task, status: "done", completedAt: `${today}T12:00:00.000Z` }
  const base: HubTask = { ...task, status: "open", completedAt: null, snoozedUntil: null, stage: "queue" }
  if (horizon === "waiting") return { ...base, stage: "waiting" }
  if (horizon === "later") return { ...base, dueOn: null }
  const end = weekEndLocal(today)
  return { ...base, dueOn: task.dueOn && task.dueOn <= end ? task.dueOn : end }
}

function weekEndLocal(today: string) {
  const [y, m, d] = today.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const dow = date.getDay() || 7
  date.setDate(date.getDate() + (7 - dow))
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export { FOCUS_MAX }
