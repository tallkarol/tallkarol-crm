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
import { markColor } from "@/lib/client-colors"

export type AttentionTone = "bad" | "warn" | "ok" | "neutral"

export type AttentionItem = {
  id: string
  href: string
  color: string
  title: string
  /** The client's name — rendered as a coloured chip. */
  meta?: string
  detail?: string
  amount?: string
  tone: AttentionTone
  /** Right-hand label: "1 day", "Tomorrow", "Sat 5". */
  when?: string
  whenTone?: AttentionTone
}

export type AttentionGroup = {
  id: string
  label: string
  total?: string
  tone?: "bad" | "warn" | "neutral"
  reorderable?: boolean
  completable?: boolean
  items: AttentionItem[]
}

/** What the list leaves out, summarised in the footer. */
export type AttentionMore = {
  count: number
  label: string
  byClient: { name: string; count: number }[]
  href: string
}

const TONE: Record<AttentionTone, string> = {
  bad: "text-bad",
  warn: "text-warn",
  ok: "text-tk-teal",
  neutral: "text-ink-3",
}

type Layout = "rows" | "cards"

const LAYOUT_KEY = "dashboard-needs-attention-layout"

/**
 * Card view is colour-coded by client: a solid top edge in the client colour,
 * and the same colour washed to a tint for the paper and border, so a glance
 * across the board groups cards by who they belong to.
 *
 * This used to append an alpha suffix to the hex (`${color}40`), which worked
 * only while every colour was a six-digit literal. It is composed now, for two
 * reasons. The precondition is gone: the no-client fallback is a token, not a
 * hex, and `rgb(var(--ink-3-rgb))40` is invalid CSS that a browser drops
 * silently — every no-client card would have lost its border AND its wash in
 * both themes with nothing to show for it. And the top edge needs the mark
 * lift, or sondry #1F3A4D reads 1.40:1 on the dark card.
 *
 * borderTopColor comes AFTER borderColor: the shorthand clobbers it otherwise,
 * which is how the solid top edge this comment promises had already stopped
 * rendering.
 */
function clientTint(color: string): React.CSSProperties {
  return {
    "--c": color,
    borderColor: "color-mix(in srgb, var(--c) 25%, transparent)",
    borderTopColor: "color-mix(in oklab, var(--c), white var(--lift-mark))",
    backgroundColor: "color-mix(in srgb, var(--c) 8%, transparent)",
  } as React.CSSProperties
}

/**
 * The homepage's to-do, grouped by urgency and capped at what matters this
 * week. Filter chips narrow to one group; the footer names what was left
 * out. Row view keeps drag-to-reorder and one-tap done.
 */
export function NeedsAttention({
  groups: initialGroups,
  more,
}: {
  groups: AttentionGroup[]
  more?: AttentionMore | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [groups, setGroups] = useState(initialGroups)
  const [layout, setLayout] = useState<Layout>("rows")
  const [filter, setFilter] = useState<string | null>(null)
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

  const count = groups.reduce((sum, group) => sum + group.items.length, 0)
  const visible = groups.filter(
    (group) => group.items.length > 0 && (filter == null || group.id === filter)
  )

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
    <section className="overflow-hidden rounded-2xl border border-line bg-card shadow-card">
      <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-3">
        <h2 className="font-ui text-[13.5px] font-bold tracking-tight text-tk-onyx">Needs attention</h2>
        {count > 0 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full border border-line bg-well px-1.5 font-ui text-[11px] font-bold tabular-nums text-tk-slate">
            {count}
          </span>
        ) : null}
        <span className="ml-auto inline-flex rounded-lg border border-line bg-well p-0.5">
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

      {count > 0 ? (
        <div className="flex flex-wrap gap-1 px-3.5 pt-2.5" role="group" aria-label="Filter">
          <FilterChip active={filter == null} onClick={() => setFilter(null)}>
            Everything
          </FilterChip>
          {groups.map((group) => (
            <FilterChip
              key={group.id}
              active={filter === group.id}
              onClick={() => setFilter(filter === group.id ? null : group.id)}
              count={group.items.length}
              tone={group.tone}
            >
              {group.label}
            </FilterChip>
          ))}
        </div>
      ) : null}

      {error ? (
        <p
          role="status"
          className="mx-[18px] mt-2 rounded-lg bg-bad/10 px-3 py-2 text-xs font-semibold text-bad"
        >
          {error}
        </p>
      ) : null}

      {count === 0 ? (
        <p className="px-[18px] py-8 text-sm text-ink-3">
          All clear — nothing waiting on you.
        </p>
      ) : visible.length === 0 ? (
        <p className="px-[18px] py-6 text-sm text-ink-3">Nothing in that group.</p>
      ) : (
        <div className="pb-1.5">
          {visible.map((group) => (
            <div key={group.id}>
              <div
                className={cn(
                  "flex items-baseline gap-2 px-[18px] pb-1 pt-3 font-ui text-[10.5px] font-bold uppercase tracking-[0.12em]",
                  group.tone === "bad" ? "text-bad" : group.tone === "warn" ? "text-warn" : "text-ink-3"
                )}
              >
                {group.label}
                <span className="tabular-nums opacity-70">{group.items.length}</span>
                {group.total ? (
                  <span className="ml-auto text-xs font-semibold normal-case tracking-normal tabular-nums text-tk-onyx">
                    {group.total}
                  </span>
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
                      ? "grid gap-0.5 px-2"
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

      {more && more.count > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-[18px] py-2.5 text-xs text-ink-3">
          <span className="min-w-0 truncate">
            {more.count} more {more.label}
            {more.byClient.length
              ? ` — ${more.byClient.map((c) => `${c.count} ${c.name}`).join(", ")}`
              : ""}
          </span>
          <Link
            href={more.href}
            className="shrink-0 font-ui font-bold text-tk-teal hover:underline"
          >
            All tasks →
          </Link>
        </div>
      ) : null}
    </section>
  )
}

function FilterChip({
  active,
  onClick,
  count,
  tone,
  children,
}: {
  active: boolean
  onClick: () => void
  count?: number
  tone?: AttentionGroup["tone"]
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 font-ui text-xs font-semibold transition-colors",
        active
          ? "border border-line bg-well text-tk-onyx"
          : "border border-transparent text-tk-slate hover:bg-well transition-colors duration-[120ms] hover:text-tk-onyx"
      )}
    >
      {children}
      {count != null ? (
        <span
          className={cn(
            "grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10.5px] tabular-nums",
            count > 0 && tone === "bad"
              ? "bg-bad/10 text-bad"
              : count > 0 && tone === "warn"
                ? "bg-warn/10 text-warn"
                : "border border-line bg-card text-ink-3"
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
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
            ? "grid gap-0.5 px-2"
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
          className="grid size-7 shrink-0 touch-none cursor-grab place-items-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-well hover:text-tk-slate focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing"
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
        isDragging && "relative opacity-70 shadow-overlay",
        isOver && !isDragging && "ring-2 ring-inset ring-tk-teal/45"
      )}
    />
  )
}

function ClientChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="tk-client-tint tk-client-ink inline-flex h-[18px] max-w-[180px] items-center gap-1 rounded-md px-1.5 font-ui text-[10px] font-bold"
      style={{ "--c": color } as React.CSSProperties}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: markColor(color) }} />
      <span className="truncate">{name}</span>
    </span>
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

  if (layout === "cards") {
    const line = [meta, item.detail].filter(Boolean).join(" · ")
    return (
      <li
        ref={itemRef}
        style={{ ...style, ...clientTint(item.color) }}
        className={cn(
          "relative flex min-h-36 flex-col rounded-lg border border-t-4 bg-card shadow-card transition-[box-shadow,transform]",
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
            <span className="mt-auto pt-4 text-right font-display text-sm font-bold tabular-nums text-tk-onyx">
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
        "group grid grid-cols-[28px_22px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-card px-1.5 py-1.5 transition-[box-shadow,background-color,transform] hover:bg-well transition-colors duration-[120ms]",
        className
      )}
    >
      {dragHandle ?? <span />}
      {completable ? (
        <CompleteButton
          title={item.title}
          completing={completing}
          onClick={onComplete}
        />
      ) : (
        <span
          aria-hidden
          className="size-[18px] justify-self-center rounded-full border-[1.5px] border-dashed border-line-strong"
        />
      )}
      <Link
        href={item.href}
        scroll={false}
        className="grid min-w-0 gap-[3px]"
      >
        <span className="min-w-0 truncate text-[13.5px] font-medium text-tk-onyx">
          {item.title}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-ink-3">
          {meta ? <ClientChip name={meta} color={item.color} /> : null}
          {item.detail ? (
            <span className={cn("min-w-0 truncate", item.tone === "neutral" ? "" : cn("font-semibold", TONE[item.tone]))}>
              {item.detail}
            </span>
          ) : null}
        </span>
      </Link>
      <span className="pr-2 text-right">
        {item.amount ? (
          <span className="font-display text-[15px] font-semibold tracking-tight tabular-nums text-tk-onyx">
            {item.amount}
          </span>
        ) : item.when ? (
          <span
            className={cn(
              "whitespace-nowrap font-ui text-[11.5px] font-semibold",
              item.whenTone ? TONE[item.whenTone] : "text-ink-3"
            )}
          >
            {item.when}
          </span>
        ) : null}
      </span>
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
        "group/check grid size-[20px] shrink-0 place-items-center justify-self-center rounded-full border-[1.5px] text-transparent transition-all",
        "border-line-strong hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:bg-accent hover:text-white hover:shadow-hover",
        "disabled:cursor-wait disabled:border-tk-teal disabled:bg-accent disabled:text-white disabled:opacity-70"
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
          ? "bg-card text-tk-onyx shadow-card"
          : "text-ink-3 hover:text-tk-slate"
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
