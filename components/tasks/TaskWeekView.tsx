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
import { clientColor, markColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { updateTask } from "@/lib/task-actions"
import { isoDay, type HubTask } from "@/lib/task-view"

export type WeekEvent = {
  id: string
  title: string
  startsAt: string
  allDay: boolean
}

/** Today plus the next four weekdays — an agenda, not a calendar month. */
function weekDays(now = new Date()) {
  const out: { iso: string; weekday: string; date: string; today: boolean }[] = []
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let first = true
  while (out.length < 5) {
    if (first || (d.getDay() !== 0 && d.getDay() !== 6)) {
      out.push({
        iso: isoDay(d),
        weekday: first ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" }),
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        today: first,
      })
      first = false
    }
    d.setDate(d.getDate() + 1)
  }
  return out
}

/**
 * Drag a task onto a day to set its due date. Calendar events sit in the same
 * columns as fixed blocks, because the day's real capacity is the thing you are
 * actually planning against.
 */
export function TaskWeekView({
  tasks: initial,
  events,
  peekBase,
}: {
  tasks: HubTask[]
  events: WeekEvent[]
  peekBase: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [tasks, setTasks] = useState(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [days] = useState(() => weekDays())
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  useEffect(() => setTasks(initial), [initial])

  const today = days[0].iso
  const active = tasks.find((t) => t.id === activeId) ?? null

  function columnFor(task: HubTask) {
    if (!task.dueOn) return "later"
    if (task.dueOn <= today) return today
    const hit = days.find((d) => d.iso === task.dueOn)
    return hit ? hit.iso : "later"
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const target = event.over?.id as string | undefined
    const task = tasks.find((t) => t.id === event.active.id)
    if (!target || !task) return
    const dueOn = target === "later" ? null : target
    if (columnFor(task) === (dueOn ?? "later")) return

    setTasks((rows) =>
      rows.map((row) => (row.id === task.id ? { ...row, dueOn } : row))
    )
    startTransition(async () => {
      await updateTask(task.id, { dueOn })
      router.refresh()
    })
  }

  const byDay = new Map<string, WeekEvent[]>()
  for (const event of events) {
    const key = isoDay(new Date(event.startsAt))
    byDay.set(key, [...(byDay.get(key) ?? []), event])
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="mt-4 grid gap-2.5 overflow-x-auto pb-2 [grid-template-columns:repeat(6,minmax(160px,1fr))] max-lg:[grid-template-columns:repeat(6,190px)]">
        {days.map((day) => (
          <Column
            key={day.iso}
            id={day.iso}
            title={day.weekday}
            sub={day.date}
            today={day.today}
          >
            {(byDay.get(day.iso) ?? []).map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-dashed border-line-strong bg-well px-2.5 py-1.5 text-[11.5px] leading-snug text-tk-slate"
              >
                <b className="block text-xs font-semibold">
                  {event.allDay
                    ? event.title
                    : `${new Date(event.startsAt).toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })} · ${event.title}`}
                </b>
                calendar · fixed
              </li>
            ))}
            {tasks
              .filter((t) => columnFor(t) === day.iso)
              .map((task) => (
                <Card
                  key={task.id}
                  task={task}
                  dragging={task.id === activeId}
                  peekBase={peekBase}
                />
              ))}
          </Column>
        ))}

        <Column id="later" title="Later" sub="unscheduled" today={false}>
          {tasks
            .filter((t) => columnFor(t) === "later")
            .map((task) => (
              <Card
                key={task.id}
                task={task}
                dragging={task.id === activeId}
                peekBase={peekBase}
              />
            ))}
        </Column>
      </div>

      <DragOverlay>
        {active ? (
          <div className="w-44 rotate-2 rounded-xl border border-line bg-card p-2.5 shadow-overlay">
            <p className="text-[13px] font-medium text-tk-onyx">{active.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function Column({
  id,
  title,
  sub,
  today,
  children,
}: {
  id: string
  title: string
  sub: string
  today: boolean
  children: React.ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[220px] flex-col rounded-2xl border bg-well transition-colors",
        isOver
          ? "border-tk-teal bg-tk-teal/5"
          : today
            ? "border-tk-teal/40 bg-tk-teal/[0.04]"
            : "border-line"
      )}
    >
      <div className="flex items-baseline justify-between px-3 pb-1 pt-2.5">
        <h3
          className={cn(
            "text-[13px] font-semibold",
            today ? "text-tk-teal" : "text-tk-onyx"
          )}
        >
          {title}
        </h3>
        <span className="text-[11px] text-ink-3">{sub}</span>
      </div>
      <ul className="flex flex-1 flex-col gap-2 px-2.5 pb-3 pt-1">{children}</ul>
    </div>
  )
}

function Card({
  task,
  dragging,
  peekBase,
}: {
  task: HubTask
  dragging: boolean
  peekBase: string
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
        "cursor-grab touch-none rounded-xl border border-line bg-card p-2.5 shadow-card active:cursor-grabbing",
        dragging && "opacity-35"
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: markColor(color) }}
    >
      <Link
        href={`${peekBase}${join}peek=task:${task.id}`}
        scroll={false}
        onPointerDown={(e) => e.stopPropagation()}
        className="block text-[13px] font-medium leading-snug text-tk-onyx hover:text-tk-teal"
      >
        {task.title}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        {task.priority === 1 ? (
          <span aria-hidden className="size-[7px] rounded-full bg-bad" />
        ) : null}
        {task.clientName ? (
          <span
            className="inline-flex items-center gap-1 text-[11px] font-semibold"
            style={{ color }}
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ backgroundColor: markColor(color) }}
            />
            {task.clientName}
          </span>
        ) : null}
        {task.items.total > 0 ? (
          <span className="rounded bg-well px-1.5 font-mono text-[10px] text-ink-3">
            {task.items.done}/{task.items.total}
          </span>
        ) : null}
      </div>
    </li>
  )
}
