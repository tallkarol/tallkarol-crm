"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
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
import { addTask, setTaskDue, toggleTask } from "@/app/(admin)/tasks/actions"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { CADENCE_LABEL } from "@/lib/work"

export type HubTask = {
  id: string
  title: string
  notes: string
  cadence: "none" | "weekly" | "monthly"
  status: "open" | "done"
  dueOn: string | null
  clientId: string | null
  clientSlug: string | null
  clientName: string | null
  doneToday: boolean
}

export type HubEvent = {
  id: string
  title: string
  startsAt: string
  allDay: boolean
}

export type HubClient = { id: string; slug: string; name: string }

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Today plus the next 4 weekdays (weekends skipped, like an agenda). */
function weekDays(): { iso: string; weekday: string; date: string; today: boolean }[] {
  const out: { iso: string; weekday: string; date: string; today: boolean }[] = []
  const d = new Date()
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

function monthEnd(): string {
  const d = new Date()
  return isoDay(new Date(d.getFullYear(), d.getMonth() + 1, 0))
}

function Checkbox({ done, onToggle, label }: { done: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={done}
      onClick={onToggle}
      onPointerDown={(e) => e.stopPropagation()}
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-md border-[1.5px] transition-colors",
        done ? "border-tk-teal bg-tk-teal" : "border-tk-slate/40 bg-white hover:border-tk-teal"
      )}
    >
      <svg width="11" height="9" viewBox="0 0 11 9" fill="none" className={done ? "opacity-100" : "opacity-0"}>
        <path d="M1 4.5L4 7.5L10 1.5" stroke="#F1EADC" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  )
}

function ClientTag({ task }: { task: HubTask }) {
  if (!task.clientSlug || !task.clientName) return null
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold"
      style={{ color: clientColor(task.clientSlug) }}
    >
      <span className="size-1.5 rounded-full" style={{ background: clientColor(task.clientSlug) }} />
      {task.clientName}
    </span>
  )
}

export function TasksHub({
  tasks: initial,
  events,
  clients,
}: {
  tasks: HubTask[]
  events: HubEvent[]
  clients: HubClient[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [rows, setRows] = useState(initial)
  // Server refreshes (peek-card edits, other tabs) replace the board's copy.
  useEffect(() => setRows(initial), [initial])
  const [view, setView] = useState<"list" | "week">("list")
  const [filter, setFilter] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const refresh = () => startTransition(() => router.refresh())
  const today = isoDay(new Date())
  const days = useMemo(weekDays, [])
  const eom = monthEnd()

  const visible = filter ? rows.filter((t) => t.clientSlug === filter) : rows
  const open = visible.filter((t) => t.status === "open")
  const now = open.filter((t) => t.cadence === "none" && (!t.dueOn || t.dueOn <= today))
  const scheduled = open.filter((t) => t.cadence === "none" && t.dueOn && t.dueOn > today)
  const repeats = open.filter((t) => t.cadence !== "none")
  const doneToday = visible.filter((t) => t.status === "done" && t.doneToday)

  const filterClients = useMemo(() => {
    const seen = new Map<string, { slug: string; name: string }>()
    for (const t of rows) {
      if (t.clientSlug && t.clientName) seen.set(t.clientSlug, { slug: t.clientSlug, name: t.clientName })
    }
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  function toggle(task: HubTask) {
    const done = task.status === "open"
    setRows((rs) =>
      rs.map((r) => (r.id === task.id ? { ...r, status: done ? "done" : "open", doneToday: done } : r))
    )
    void toggleTask(task.id, done).then(refresh)
  }

  function quickAdd(e: React.FormEvent) {
    e.preventDefault()
    let text = draft.trim()
    if (!text) return
    let client: HubClient | null = null
    const at = text.match(/@([\w-]+)\s*$/)
    if (at) {
      const needle = at[1].toLowerCase()
      client =
        clients.find(
          (c) => c.slug.toLowerCase().startsWith(needle) || c.name.toLowerCase().startsWith(needle)
        ) ?? null
      if (client) text = text.slice(0, at.index).trim()
    }
    const temp: HubTask = {
      id: `tmp-${Date.now()}`,
      title: text,
      notes: "",
      cadence: "none",
      status: "open",
      dueOn: null,
      clientId: client?.id ?? null,
      clientSlug: client?.slug ?? null,
      clientName: client?.name ?? null,
      doneToday: false,
    }
    setRows((rs) => [...rs, temp])
    setDraft("")
    void addTask(text, client?.id ?? null).then(refresh)
  }

  /* week view placement */
  function dayFor(task: HubTask): string {
    if (task.dueOn) {
      if (task.dueOn <= today) return today
      const hit = days.find((d) => d.iso === task.dueOn)
      return hit ? hit.iso : "later"
    }
    if (task.cadence !== "none") {
      const hit = days.find((d) => d.iso === eom)
      return hit ? hit.iso : "later"
    }
    return today
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const target = e.over?.id as string | undefined
    const task = rows.find((t) => t.id === e.active.id)
    if (!target || !task) return
    const dueOn = target === "later" ? null : target
    if (dayFor(task) === (dueOn ?? "later")) return
    setRows((rs) => rs.map((r) => (r.id === task.id ? { ...r, dueOn } : r)))
    void setTaskDue(task.id, dueOn).then(refresh)
  }

  const activeTask = rows.find((t) => t.id === activeId) ?? null
  const eventsByDay = useMemo(() => {
    const m = new Map<string, HubEvent[]>()
    for (const ev of events) {
      const key = isoDay(new Date(ev.startsAt))
      m.set(key, [...(m.get(key) ?? []), ev])
    }
    return m
  }, [events])

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center gap-2">
        <form
          onSubmit={quickAdd}
          className="flex min-w-[240px] flex-1 gap-2 rounded-xl border border-tk-slate/20 bg-white py-1 pl-3.5 pr-1 shadow-sm"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a task… (@client to link)"
            aria-label="Add a task"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-tk-slate/40"
          />
          <button
            type="submit"
            className="rounded-lg bg-tk-teal px-3.5 py-1.5 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90"
          >
            Add
          </button>
        </form>
        {filterClients.map((c) => {
          const on = filter === c.slug
          return (
            <button
              key={c.slug}
              type="button"
              onClick={() => setFilter(on ? null : c.slug)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold",
                on ? "border-current" : "border-tk-slate/20 bg-white text-tk-slate hover:text-tk-onyx"
              )}
              style={on ? { color: clientColor(c.slug) } : undefined}
            >
              <span className="size-2 rounded-full" style={{ background: clientColor(c.slug) }} />
              {c.name}
            </button>
          )
        })}
        <div className="flex rounded-full border border-tk-slate/20 bg-white p-[3px] shadow-sm" role="group" aria-label="Task view">
          {(["list", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-full px-3.5 py-1 text-xs font-semibold capitalize",
                view === v ? "bg-tk-teal text-tk-linen" : "text-tk-slate"
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "list" ? (
        <>
          <TaskSection title="Now" count={now.length} empty="Clear. Nothing urgent.">
            {now.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} />
            ))}
          </TaskSection>
          {scheduled.length > 0 ? (
            <TaskSection title="Scheduled" count={scheduled.length} empty="">
              {scheduled.map((t) => (
                <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} showDue />
              ))}
            </TaskSection>
          ) : null}
          <TaskSection
            title={`Monthly · due ${new Date(eom + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
            count={repeats.length}
            empty="All repeats handled."
          >
            {repeats.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} showCadence />
            ))}
          </TaskSection>
          <TaskSection title="Done today" count={doneToday.length} empty="Nothing yet.">
            {doneToday.map((t) => (
              <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} />
            ))}
          </TaskSection>
        </>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="mt-5 grid gap-2.5 overflow-x-auto pb-2 [grid-template-columns:repeat(6,minmax(160px,1fr))] max-lg:[grid-template-columns:repeat(6,190px)]">
            {days.map((d) => (
              <DayColumn key={d.iso} id={d.iso} title={d.weekday} sub={d.date} today={d.today}>
                {(eventsByDay.get(d.iso) ?? []).map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-lg border border-dashed border-tk-slate/25 bg-tk-linen px-2.5 py-1.5 text-[11.5px] leading-snug text-tk-slate"
                  >
                    <b className="block text-xs font-semibold">
                      {ev.allDay
                        ? ev.title
                        : `${new Date(ev.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · ${ev.title}`}
                    </b>
                    calendar · fixed
                  </li>
                ))}
                {open
                  .filter((t) => dayFor(t) === d.iso)
                  .map((t) => (
                    <WeekCard key={t.id} task={t} dragging={t.id === activeId} onToggle={() => toggle(t)} />
                  ))}
              </DayColumn>
            ))}
            <DayColumn id="later" title="Later" sub="unscheduled" today={false}>
              {open
                .filter((t) => dayFor(t) === "later")
                .map((t) => (
                  <WeekCard key={t.id} task={t} dragging={t.id === activeId} onToggle={() => toggle(t)} />
                ))}
            </DayColumn>
          </div>
          <DragOverlay>
            {activeTask ? (
              <div className="w-44 rotate-2 rounded-xl border border-tk-slate/15 bg-white p-2.5 shadow-xl">
                <p className="text-[13px] font-medium text-tk-onyx">{activeTask.title}</p>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}
    </>
  )
}

function TaskSection({
  title,
  count,
  empty,
  children,
}: {
  title: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-6">
      <h2 className="flex items-baseline gap-2 px-0.5 text-[11px] font-semibold uppercase tracking-widest text-tk-slate/60">
        {title} <span className="font-medium tabular-nums">{count}</span>
      </h2>
      {count === 0 ? (
        <p className="mt-2 px-0.5 text-sm text-tk-slate/60">{empty}</p>
      ) : (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm [&>li]:border-b [&>li]:border-tk-slate/10 last:[&>li]:border-0">
          {children}
        </ul>
      )}
    </div>
  )
}

function TaskRow({
  task,
  onToggle,
  showCadence,
  showDue,
}: {
  task: HubTask
  onToggle: () => void
  showCadence?: boolean
  showDue?: boolean
}) {
  const done = task.status === "done"
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <Checkbox done={done} onToggle={onToggle} label={`Mark ${task.title} ${done ? "open" : "done"}`} />
      <span className="min-w-0 flex-1">
        <Link
          href={`/tasks?peek=task:${task.id}`}
          scroll={false}
          className={cn(
            "block truncate font-medium hover:text-tk-teal",
            done ? "text-tk-slate/50 line-through" : "text-tk-onyx"
          )}
        >
          {task.title}
        </Link>
        {task.notes ? (
          <span className="block truncate text-xs text-tk-slate/60">{task.notes}</span>
        ) : null}
      </span>
      {showDue && task.dueOn ? (
        <span className="shrink-0 text-xs tabular-nums text-tk-slate/60">
          {new Date(task.dueOn + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      ) : null}
      {showCadence && task.cadence !== "none" ? (
        <span className="shrink-0 rounded-full bg-tk-linen px-2 py-0.5 text-[11px] font-semibold text-tk-slate">
          {CADENCE_LABEL[task.cadence]}
        </span>
      ) : null}
      <ClientTag task={task} />
    </li>
  )
}

function DayColumn({
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
        "flex min-h-[220px] flex-col rounded-2xl border bg-[#FAF6EE] transition-colors",
        isOver ? "border-tk-teal bg-tk-teal/5" : today ? "border-tk-teal/40 bg-tk-teal/[0.04]" : "border-tk-slate/15"
      )}
    >
      <div className="flex items-baseline justify-between px-3 pb-1 pt-2.5">
        <h3 className={cn("text-[13px] font-semibold", today ? "text-tk-teal" : "text-tk-onyx")}>{title}</h3>
        <span className="text-[11px] text-tk-slate/60">{sub}</span>
      </div>
      <ul className="flex flex-1 flex-col gap-2 px-2.5 pb-3 pt-1">{children}</ul>
    </div>
  )
}

function WeekCard({
  task,
  dragging,
  onToggle,
}: {
  task: HubTask
  dragging: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: task.id })
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab touch-none rounded-xl border border-tk-slate/15 bg-white p-2.5 shadow-sm active:cursor-grabbing",
        dragging && "opacity-35"
      )}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: task.clientSlug ? clientColor(task.clientSlug) : "rgba(15,22,21,.2)",
      }}
    >
      <div className="flex items-start gap-2">
        <Checkbox done={false} onToggle={onToggle} label={`Mark ${task.title} done`} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-snug text-tk-onyx">{task.title}</p>
          {task.notes ? <p className="mt-0.5 truncate text-[11px] text-tk-slate/60">{task.notes}</p> : null}
          <div className="mt-1 flex items-center gap-1.5">
            {task.cadence !== "none" ? (
              <span className="rounded-full bg-tk-linen px-1.5 py-px text-[10px] font-semibold text-tk-slate">
                {CADENCE_LABEL[task.cadence]}
              </span>
            ) : null}
            <ClientTag task={task} />
          </div>
        </div>
      </div>
    </li>
  )
}
