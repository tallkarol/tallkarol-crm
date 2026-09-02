"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { setTaskStage } from "@/lib/task-actions"
import type { HubTask } from "@/lib/task-view"
import { CADENCE_LABEL } from "@/lib/work"

const STAGES = [
  { id: "queue", label: "Queue" },
  { id: "doing", label: "In progress" },
  { id: "waiting", label: "Waiting on client" },
  { id: "done", label: "Done" },
] as const

/**
 * One board, three mount points: the task hub, a retainer, a project. A task
 * dragged to "doing" here reads as "in progress" in the list, because both are
 * the same `board_stage`.
 */
export function TaskBoardView({
  tasks: initial,
  peekBase,
  doneLabel = "Done",
  showClient = true,
}: {
  tasks: HubTask[]
  peekBase: string
  doneLabel?: string
  showClient?: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [tasks, setTasks] = useState(initial)
  const [forced, setForced] = useState<Record<string, "done" | HubTask["stage"]>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  // Server refreshes (a peek edit, another tab) replace the board's copy.
  // A stale refresh after a drag must not undo a stage we just wrote.
  useEffect(() => {
    setTasks(
      initial.map((task) => {
        const override = forced[task.id]
        if (!override) return task
        return {
          ...task,
          status: override === "done" ? "done" : "open",
          stage: override === "done" ? task.stage : override,
        }
      })
    )
  }, [initial, forced])

  const active = tasks.find((t) => t.id === activeId) ?? null

  function stageOf(task: HubTask) {
    return task.status === "done" ? "done" : task.stage
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const stage = event.over?.id as string | undefined
    const task = tasks.find((t) => t.id === event.active.id)
    if (!stage || !task || !STAGES.some((s) => s.id === stage)) return
    if (stageOf(task) === stage) return

    setForced((current) => ({
      ...current,
      [task.id]: stage === "done" ? "done" : (stage as HubTask["stage"]),
    }))
    startTransition(async () => {
      await setTaskStage(task.id, stage)
      router.refresh()
    })
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="mt-4 grid gap-2.5 overflow-x-auto pb-1 [grid-template-columns:repeat(4,minmax(200px,1fr))] max-lg:[grid-template-columns:repeat(4,220px)]">
        {STAGES.map((stage) => {
          const inStage = tasks.filter((t) => stageOf(t) === stage.id)
          return (
            <Column
              key={stage.id}
              id={stage.id}
              label={stage.id === "done" ? doneLabel : stage.label}
              count={inStage.length}
            >
              {inStage.map((task) => (
                <Card
                  key={task.id}
                  task={task}
                  dragging={task.id === activeId}
                  peekBase={peekBase}
                  showClient={showClient}
                />
              ))}
            </Column>
          )
        })}
      </div>

      <DragOverlay>
        {active ? (
          <div className="w-52 rotate-2 rounded-xl border border-tk-slate/15 bg-white p-2.5 shadow-xl">
            <p className="text-[13px] font-medium text-tk-onyx">{active.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  id,
  label,
  count,
  children,
}: {
  id: string
  label: string
  count: number
  children: React.ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[140px] flex-col rounded-2xl border bg-[#FAF6EE] transition-colors",
        isOver ? "border-tk-teal bg-tk-teal/5" : "border-tk-slate/15"
      )}
    >
      <div className="flex items-baseline justify-between px-3 pb-1 pt-2.5">
        <h3 className="text-[13px] font-semibold text-tk-onyx">{label}</h3>
        <span className="font-mono text-xs tabular-nums text-tk-slate/60">
          {count || ""}
        </span>
      </div>
      <ul className="flex flex-1 flex-col gap-2 px-2.5 pb-3 pt-1">{children}</ul>
    </div>
  )
}

function Card({
  task,
  dragging,
  peekBase,
  showClient,
}: {
  task: HubTask
  dragging: boolean
  peekBase: string
  showClient: boolean
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id })
  const color = task.clientSlug ? clientColor(task.clientSlug) : "#8A9794"
  const join = peekBase.includes("?") ? "&" : "?"

  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab touch-none overflow-hidden rounded-xl border border-tk-slate/15 bg-white shadow-sm active:cursor-grabbing",
        dragging && "opacity-35",
        task.status === "done" && "opacity-70"
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div className="p-2.5">
        <Link
          href={`${peekBase}${join}peek=task:${task.id}`}
          scroll={false}
          onPointerDown={(e) => e.stopPropagation()}
          className={cn(
            "block text-[13px] font-medium leading-snug hover:text-tk-teal",
            task.status === "done"
              ? "text-tk-slate/60 line-through"
              : "text-tk-onyx"
          )}
        >
          {task.title}
        </Link>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {task.priority === 1 ? (
            <span
              aria-hidden
              title="High priority"
              className="size-[7px] rounded-full bg-[#B4322A]"
            />
          ) : null}
          {showClient && task.clientName ? (
            <span
              className="inline-flex items-center gap-1 text-[11px] font-semibold"
              style={{ color }}
            >
              <span
                aria-hidden
                className="size-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              {task.clientName}
            </span>
          ) : null}
          {task.productName && !showClient ? (
            <span className="text-[11px] text-tk-slate/60">{task.productName}</span>
          ) : task.projectName && !showClient ? (
            <span className="text-[11px] text-tk-slate/60">{task.projectName}</span>
          ) : null}
          {task.items.total > 0 ? (
            <span className="rounded bg-tk-linen px-1.5 font-mono text-[10px] text-tk-slate/70">
              {task.items.done}/{task.items.total}
            </span>
          ) : null}
          {task.overdueDays != null ? (
            <span className="rounded-full bg-[#B4322A]/10 px-1.5 py-px text-[10px] font-bold uppercase text-[#B4322A]">
              {task.overdueDays}d over
            </span>
          ) : null}
          {task.waitingDays != null && task.waitingDays >= 7 ? (
            <span className="rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-bold uppercase text-amber-800">
              {task.waitingDays}d
            </span>
          ) : null}
          {task.cadence !== "none" ? (
            <span className="rounded-full bg-tk-linen px-1.5 py-px text-[10px] font-semibold text-tk-slate">
              {CADENCE_LABEL[task.cadence]}
            </span>
          ) : null}
        </div>
      </div>
    </li>
  )
}
