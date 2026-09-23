"use client"

import Link from "next/link"
import { useDraggable, useDroppable } from "@dnd-kit/core"
import { Check, StickyNote } from "lucide-react"
import { cn } from "@/lib/cn"
import { HORIZONS, HORIZON_LABEL, isOverdue, type BoardColumns, type Horizon } from "@/lib/horizon"
import type { HubTask } from "@/lib/task-view"

const RULE: Partial<Record<Horizon, string>> = { done: "last 7 days" }

/**
 * The four horizon columns under the Focus row. Each column is a drop
 * target (its rule is what a drop writes — lib/horizon.ts) and each card is
 * a draggable that can also go up into a Focus slot or the queue.
 */
export function HorizonBoard({
  columns,
  today,
  peekBase,
  onFocus,
  activeId,
}: {
  columns: BoardColumns
  today: string
  peekBase: string
  onFocus: (taskId: string) => void
  activeId: string | null
}) {
  return (
    <section className="flex flex-col gap-2" aria-label="Board">
      <h2 className="flex items-center gap-1.5 px-0.5 font-ui text-[13px] font-bold text-tk-onyx">
        <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 5v11" /><path d="M12 5v6" /><path d="M18 5v14" />
        </svg>
        Board
      </h2>
      <div className="grid grid-flow-col auto-cols-[minmax(212px,1fr)] items-start gap-3 overflow-x-auto pb-1">
        {HORIZONS.map((h) => (
          <Column key={h} id={h} tasks={columns[h]} today={today} peekBase={peekBase} onFocus={onFocus} activeId={activeId} />
        ))}
      </div>
    </section>
  )
}

function Column({
  id,
  tasks,
  today,
  peekBase,
  onFocus,
  activeId,
}: {
  id: Horizon
  tasks: HubTask[]
  today: string
  peekBase: string
  onFocus: (taskId: string) => void
  activeId: string | null
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `col:${id}`, data: { zone: "col", horizon: id } })
  const overdue = id === "week" ? tasks.filter((t) => isOverdue(t, today)).length : 0
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-1.5 px-1 font-ui text-[11.5px] font-bold text-ink-2">
        {HORIZON_LABEL[id]}
        <span
          className={cn(
            "inline-grid h-4 place-items-center rounded-full border px-1.5 font-mono text-[10.5px]",
            overdue ? "border-transparent bg-bad-soft text-bad" : "border-line bg-well text-ink-3"
          )}
        >
          {overdue ? `${overdue} overdue` : tasks.length}
        </span>
        {RULE[id] ? <span className="ml-auto font-ui text-[10px] font-medium text-ink-3">{RULE[id]}</span> : null}
      </div>
      <ul
        ref={setNodeRef}
        className={cn(
          "flex min-h-[60px] flex-col gap-1.5 rounded-xl p-0.5",
          isOver && "outline outline-2 outline-offset-2 outline-dashed outline-accent-ink"
        )}
      >
        {tasks.map((task) => (
          <BoardCard key={task.id} task={task} today={today} peekBase={peekBase} onFocus={onFocus} dragging={task.id === activeId} />
        ))}
        {tasks.length === 0 ? (
          <li className="rounded-xl border border-dashed border-line-strong px-3 py-3 text-center text-[11.5px] text-ink-3">
            {id === "waiting" ? "Nothing on them" : id === "done" ? "Nothing finished this week" : "Empty"}
          </li>
        ) : null}
      </ul>
    </div>
  )
}

function BoardCard({
  task,
  today,
  peekBase,
  onFocus,
  dragging,
}: {
  task: HubTask
  today: string
  peekBase: string
  onFocus: (taskId: string) => void
  dragging: boolean
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `task:${task.id}`, data: { kind: "task", id: task.id } })
  const done = task.status === "done"
  const overdue = isOverdue(task, today)
  const kind = task.source === "punchlist" ? "Punch item" : task.deliverableLabel ? "Deliverable" : null
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "group relative flex cursor-grab touch-none flex-col gap-1 rounded-[10px] border border-line bg-card px-2.5 pb-2 pt-2.5 shadow-card active:cursor-grabbing",
        dragging && "opacity-35",
        done && "opacity-60"
      )}
    >
      {task.priority === 1 && !done ? <span aria-hidden className="absolute -left-px bottom-2.5 top-2.5 w-[3px] rounded-r bg-bad" /> : null}
      {done ? (
        <Check className="absolute right-2 top-2 size-3 text-good" aria-hidden />
      ) : (
        <button
          type="button"
          aria-label="Add to focus"
          title="Add to focus"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onFocus(task.id)
          }}
          className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded text-ink-3 opacity-0 hover:bg-well hover:text-[--pin] group-hover:opacity-100"
        >
          <StickyNote className="size-3" aria-hidden />
        </button>
      )}
      <Link
        href={`${peekBase}${peekBase.includes("?") ? "&" : "?"}peek=task:${encodeURIComponent(task.id)}`}
        scroll={false}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn("pr-5 text-[12.5px] font-medium leading-[1.35] hover:text-tk-teal", done ? "text-ink-3 line-through" : "text-tk-onyx")}
      >
        {task.title}
      </Link>
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-ink-3">
        {kind ? (
          <span
            className={cn(
              "rounded-[3px] px-1.5 py-px font-ui text-[8.5px] font-extrabold uppercase tracking-[0.1em]",
              kind === "Punch item" ? "bg-[--paper-punch] text-[--paper-ink]" : "bg-[--paper-deliverable] text-[--paper-ink]"
            )}
          >
            {kind}
          </span>
        ) : null}
        {task.projectName ? <span className="text-ink-2">{task.projectName}</span> : null}
        {task.dueOn && !done ? (
          <span className={cn(overdue && "font-bold text-bad")}>
            {overdue ? "overdue · " : "due "}
            {dayLabel(task.dueOn)}
          </span>
        ) : null}
        {task.waitingDays ? <span>{task.waitingDays} d on them</span> : null}
      </p>
    </li>
  )
}

function dayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}
