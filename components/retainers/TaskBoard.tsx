"use client"

import { useState, useTransition } from "react"
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
import { setTaskBoardStage } from "@/app/(admin)/retainers/actions"
import { cn } from "@/lib/cn"
import { CADENCE_LABEL } from "@/lib/work"

export type BoardTask = {
  id: string
  title: string
  notes: string
  cadence: "none" | "weekly" | "monthly"
  stage: "queue" | "doing" | "waiting" | "done"
}

const STAGES = [
  { id: "queue", label: "Queue" },
  { id: "doing", label: "In progress" },
  { id: "waiting", label: "Waiting on client" },
  { id: "done", label: "Done" },
] as const

export function TaskBoard({ tasks: initial, doneLabel }: { tasks: BoardTask[]; doneLabel: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [tasks, setTasks] = useState(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const active = tasks.find((t) => t.id === activeId) ?? null

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const stage = e.over?.id as BoardTask["stage"] | undefined
    const task = tasks.find((t) => t.id === e.active.id)
    if (!stage || !task || !STAGES.some((s) => s.id === stage) || task.stage === stage) return
    setTasks((rows) => rows.map((r) => (r.id === task.id ? { ...r, stage } : r)))
    void setTaskBoardStage(task.id, stage).then(() => startTransition(() => router.refresh()))
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
          const inStage = tasks.filter((t) => t.stage === stage.id)
          return <Column key={stage.id} id={stage.id} label={stage.id === "done" ? doneLabel : stage.label} count={inStage.length}>
            {inStage.map((t) => (
              <Card key={t.id} task={t} dragging={t.id === activeId} />
            ))}
          </Column>
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
        <span className="text-xs tabular-nums text-tk-slate/60">{count || ""}</span>
      </div>
      <ul className="flex flex-1 flex-col gap-2 px-2.5 pb-3 pt-1">{children}</ul>
    </div>
  )
}

function Card({ task, dragging }: { task: BoardTask; dragging: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id })
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab touch-none rounded-xl border border-tk-slate/15 bg-white p-2.5 shadow-sm active:cursor-grabbing",
        dragging && "opacity-35",
        task.stage === "done" && "opacity-70"
      )}
    >
      <p className={cn("text-[13px] font-medium leading-snug text-tk-onyx", task.stage === "done" && "line-through text-tk-slate/60")}>
        {task.title}
      </p>
      {task.notes ? <p className="mt-0.5 truncate text-[11px] text-tk-slate/60">{task.notes}</p> : null}
      {task.cadence !== "none" ? (
        <span className="mt-1.5 inline-flex rounded-full bg-tk-linen px-2 py-0.5 text-[10px] font-semibold text-tk-slate">
          {CADENCE_LABEL[task.cadence]}
        </span>
      ) : null}
    </li>
  )
}
