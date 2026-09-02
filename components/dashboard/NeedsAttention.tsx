"use client"

import { useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { cn } from "@/lib/cn"
import { reorderAttentionTasks, setTaskDone } from "@/lib/task-actions"

export type AttentionTone = "bad" | "warn" | "ok" | "neutral"

export type AttentionItem = {
  id: string
  href: string
  color: string
  title: string
  meta?: string
  detail?: string
  amount?: string
  tone: AttentionTone
}

export type AttentionGroup = {
  id: string
  label: string
  total?: string
  reorderable?: boolean
  completable?: boolean
  items: AttentionItem[]
}

const TONE: Record<AttentionTone, string> = {
  bad: "text-[#A62228]",
  warn: "text-amber-800",
  ok: "text-tk-teal",
  neutral: "text-tk-slate/55",
}

type Layout = "rows" | "cards"

const LAYOUT_KEY = "dashboard-needs-attention-layout"

/**
 * Card view is colour-coded by client: a solid top edge in the client colour,
 * and the same colour washed to a tint for the paper and border, so a glance
 * across the board groups cards by who they belong to. Colours are six-digit
 * hex everywhere (`isHexColor` guards the overrides), so an alpha suffix is
 * safe.
 */
function clientTint(color: string) {
  return {
    borderTopColor: color,
    borderColor: `${color}40`,
    backgroundColor: `${color}14`,
  }
}

export function NeedsAttention({
  groups: initialGroups,
}: {
  groups: AttentionGroup[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [groups, setGroups] = useState(initialGroups)
  const [layout, setLayout] = useState<Layout>("rows")
  const [completing, setCompleting] = useState<string[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setGroups(
      initialGroups.map((group) => ({
        ...group,
        items: group.items.filter((item) => !dismissed.includes(item.id)),
      }))
    )
  }, [initialGroups, dismissed])
  useEffect(() => {
    const saved = window.localStorage.getItem(LAYOUT_KEY)
    if (saved === "rows" || saved === "cards") setLayout(saved)
  }, [])

  const visible = groups.filter((group) => group.items.length > 0)
  const count = visible.reduce((sum, group) => sum + group.items.length, 0)

  function chooseLayout(next: Layout) {
    setLayout(next)
    window.localStorage.setItem(LAYOUT_KEY, next)
  }

  function reorder(groupId: string, activeId: string, overId: string) {
    const before = groups
    const group = groups.find((row) => row.id === groupId)
    if (!group || activeId === overId) return
    const from = group.items.findIndex((item) => item.id === activeId)
    const to = group.items.findIndex((item) => item.id === overId)
    if (from < 0 || to < 0) return

    const items = [...group.items]
    const [moved] = items.splice(from, 1)
    items.splice(to, 0, moved)
    setGroups((rows) =>
      rows.map((row) => (row.id === groupId ? { ...row, items } : row))
    )

    startTransition(async () => {
      const result = await reorderAttentionTasks(items.map((item) => item.id))
      if (!result.ok) {
        setGroups(before)
        setError(result.error)
        return
      }
      setError(null)
      router.refresh()
    })
  }

  function complete(groupId: string, itemId: string) {
    setCompleting((ids) => [...ids, itemId])
    setDismissed((ids) => (ids.includes(itemId) ? ids : [...ids, itemId]))
    startTransition(async () => {
      const result = await setTaskDone(itemId, true)
      setCompleting((ids) => ids.filter((id) => id !== itemId))
      if (!result.ok) {
        setDismissed((ids) => ids.filter((id) => id !== itemId))
        setError(result.error)
        return
      }
      setError(null)
      router.refresh()
    })
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">Needs attention</h2>
        <div className="flex items-center gap-2">
          {count > 0 ? (
            <span className="rounded-full bg-tk-linen px-2 py-0.5 text-[11px] font-semibold tabular-nums text-tk-slate/70">
              {count}
            </span>
          ) : null}
          <span className="inline-flex rounded-lg border border-tk-slate/15 bg-tk-linen/40 p-0.5">
            <LayoutButton
              active={layout === "rows"}
              label="Row view"
              onClick={() => chooseLayout("rows")}
              icon="rows"
            />
            <LayoutButton
              active={layout === "cards"}
              label="Card view"
              onClick={() => chooseLayout("cards")}
              icon="cards"
            />
          </span>
        </div>
      </div>

      {error ? (
        <p
          role="status"
          className="border-t border-[#B4322A]/15 bg-[#B4322A]/5 px-5 py-2 text-xs font-semibold text-[#B4322A]"
        >
          {error}
        </p>
      ) : null}

      {count === 0 ? (
        <p className="border-t border-tk-slate/10 px-5 py-8 text-sm text-tk-slate/70">
          All clear — nothing waiting on you.
        </p>
      ) : (
        <div className="border-t border-tk-slate/10">
          {visible.map((group) => (
            <div key={group.id}>
              <div className="flex items-baseline justify-between gap-3 bg-tk-linen/55 px-5 py-2">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/50">
                  {group.label}
                  <span className="ml-1.5 tabular-nums text-tk-slate/35">
                    {group.items.length}
                  </span>
                </p>
                {group.total ? (
                  <p className="text-xs font-semibold tabular-nums text-tk-onyx">
                    {group.total}
                  </p>
                ) : null}
              </div>
              {group.reorderable ? (
                <ReorderableItems
                  group={group}
                  layout={layout}
                  completing={completing}
                  onComplete={complete}
                  onReorder={reorder}
                />
              ) : (
                <ul
                  className={cn(
                    layout === "rows"
                      ? "divide-y divide-tk-slate/10"
                      : "grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3"
                  )}
                >
                  {group.items.map((item) => (
                    <AttentionItemView
                      key={item.id}
                      item={item}
                      layout={layout}
                    />
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ReorderableItems({
  group,
  layout,
  completing,
  onComplete,
  onReorder,
}: {
  group: AttentionGroup
  layout: Layout
  completing: string[]
  onComplete: (groupId: string, itemId: string) => void
  onReorder: (groupId: string, activeId: string, overId: string) => void
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  function dragEnd(event: DragEndEvent) {
    if (!event.over) return
    onReorder(group.id, String(event.active.id), String(event.over.id))
  }

  return (
    <DndContext sensors={sensors} onDragEnd={dragEnd}>
      <ul
        className={cn(
          layout === "rows"
            ? "divide-y divide-tk-slate/10"
            : "grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3"
        )}
      >
        {group.items.map((item) => (
          <SortableAttentionItem
            key={item.id}
            item={item}
            layout={layout}
            completable={group.completable}
            completing={completing.includes(item.id)}
            onComplete={() => onComplete(group.id, item.id)}
          />
        ))}
      </ul>
    </DndContext>
  )
}

function SortableAttentionItem({
  item,
  layout,
  completable,
  completing,
  onComplete,
}: {
  item: AttentionItem
  layout: Layout
  completable?: boolean
  completing: boolean
  onComplete: () => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    transform,
    isDragging,
  } = useDraggable({ id: item.id })
  const { isOver, setNodeRef: setDropRef } = useDroppable({ id: item.id })

  return (
    <AttentionItemView
      item={item}
      layout={layout}
      completable={completable}
      completing={completing}
      onComplete={onComplete}
      dragHandle={
        <button
          type="button"
          className="grid size-8 shrink-0 touch-none cursor-grab place-items-center rounded-lg text-tk-slate/35 transition-colors hover:bg-tk-slate/5 hover:text-tk-slate active:cursor-grabbing"
          aria-label={`Drag to reorder ${item.title}`}
          {...listeners}
          {...attributes}
        >
          <GripIcon />
        </button>
      }
      itemRef={(node) => {
        setDragRef(node)
        setDropRef(node)
      }}
      style={{
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        zIndex: isDragging ? 20 : undefined,
      }}
      className={cn(
        isDragging && "relative opacity-70 shadow-xl",
        isOver && !isDragging && "ring-2 ring-inset ring-tk-teal/45"
      )}
    />
  )
}

function AttentionItemView({
  item,
  layout,
  completable,
  completing,
  onComplete,
  dragHandle,
  itemRef,
  style,
  className,
}: {
  item: AttentionItem
  layout: Layout
  completable?: boolean
  completing?: boolean
  onComplete?: () => void
  dragHandle?: React.ReactNode
  itemRef?: (node: HTMLLIElement | null) => void
  style?: React.CSSProperties
  className?: string
}) {
  const meta = item.meta && item.meta !== item.title ? item.meta : undefined
  const line = [meta, item.detail].filter(Boolean).join(" · ")

  if (layout === "cards") {
    return (
      <li
        ref={itemRef}
        style={{ ...style, ...clientTint(item.color) }}
        className={cn(
          "relative flex min-h-36 flex-col rounded-sm border border-t-4 bg-white shadow-[0_5px_12px_rgba(31,45,42,0.10)] transition-[box-shadow,transform]",
          className
        )}
      >
        <div className="flex items-center justify-between gap-1 px-2.5 pt-2">
          {completable ? (
            <CompleteButton
              title={item.title}
              completing={completing}
              onClick={onComplete}
            />
          ) : (
            <span />
          )}
          {dragHandle}
        </div>
        <Link
          href={item.href}
          scroll={false}
          className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-2 hover:text-tk-teal"
        >
          <span className="text-[15px] font-semibold leading-snug text-tk-onyx">
            {item.title}
          </span>
          {line ? (
            <span className={cn("mt-2 text-xs leading-relaxed", TONE[item.tone])}>
              {line}
            </span>
          ) : null}
          {item.amount ? (
            <span className="mt-auto pt-4 text-right text-sm font-bold tabular-nums text-tk-onyx">
              {item.amount}
            </span>
          ) : null}
        </Link>
      </li>
    )
  }

  return (
    <li
      ref={itemRef}
      style={style}
      className={cn(
        "group flex items-center gap-1 bg-white px-3 py-2 transition-[box-shadow,background-color,transform] hover:bg-tk-linen/50",
        className
      )}
    >
      {dragHandle}
      {completable ? (
        <CompleteButton
          title={item.title}
          completing={completing}
          onClick={onComplete}
        />
      ) : null}
      <Link
        href={item.href}
        scroll={false}
        className="flex min-w-0 flex-1 items-stretch gap-3 py-1"
      >
        <span
          className="w-0.5 shrink-0 self-stretch rounded-full"
          style={{ background: item.color }}
          aria-hidden
        />
        <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5">
          <span className="min-w-0 truncate text-sm font-medium text-tk-onyx">
            {item.title}
          </span>
          {item.amount ? (
            <span className="text-sm font-semibold tabular-nums text-tk-onyx">
              {item.amount}
            </span>
          ) : null}
          {line ? (
            <span
              className={cn(
                "col-span-2 min-w-0 truncate text-xs",
                TONE[item.tone]
              )}
            >
              {line}
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  )
}

function CompleteButton({
  title,
  completing,
  onClick,
}: {
  title: string
  completing?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={completing}
      aria-label={`Mark ${title} done`}
      title="Mark done"
      className={cn(
        "group/check grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] text-transparent transition-all",
        "border-tk-slate/25 hover:border-tk-teal hover:bg-tk-teal hover:text-white hover:shadow-sm",
        "disabled:cursor-wait disabled:border-tk-teal disabled:bg-tk-teal disabled:text-white disabled:opacity-70"
      )}
    >
      {completing ? <Spinner /> : <CheckIcon />}
    </button>
  )
}

function Spinner() {
  return (
    <svg
      className="size-3 animate-spin text-white"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        className="opacity-90"
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

function LayoutButton({
  active,
  label,
  onClick,
  icon,
}: {
  active: boolean
  label: string
  onClick: () => void
  icon: Layout
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-7 place-items-center rounded-md transition-colors",
        active
          ? "bg-white text-tk-onyx shadow-sm"
          : "text-tk-slate/45 hover:text-tk-slate"
      )}
    >
      {icon === "rows" ? <RowsIcon /> : <CardsIcon />}
    </button>
  )
}

function GripIcon() {
  return (
    <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor" aria-hidden>
      <circle cx="4" cy="3" r="1.2" />
      <circle cx="10" cy="3" r="1.2" />
      <circle cx="4" cy="8" r="1.2" />
      <circle cx="10" cy="8" r="1.2" />
      <circle cx="4" cy="13" r="1.2" />
      <circle cx="10" cy="13" r="1.2" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="12" height="10" viewBox="0 0 16 13" fill="none" aria-hidden>
      <path
        d="M1.5 6.5 5.8 11 14.5 1.8"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function RowsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M2 3.25h10M2 7h10M2 10.75h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function CardsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <rect x="1.75" y="1.75" width="4.25" height="4.25" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="1.75" width="4.25" height="4.25" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
      <rect x="1.75" y="8" width="4.25" height="4.25" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
      <rect x="8" y="8" width="4.25" height="4.25" rx="0.75" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
