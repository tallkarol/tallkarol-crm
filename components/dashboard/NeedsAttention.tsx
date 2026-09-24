"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core"
import { Check, ChevronDown, ChevronUp, CornerDownLeft, ExternalLink, Pin } from "lucide-react"
import { PulseRows } from "@/components/dashboard/PulseRows"
import { NoteButton } from "@/components/focus/FocusNote"
import { useDeskDnd, type FocusPick } from "@/components/focus/GlobalFocus"
import { Card } from "@/components/ui/Card"
import { markColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { PAPER_LABEL, type FocusKind, type Paper } from "@/lib/focus"
import type { Pulse } from "@/lib/pulse"
import { ROUTES } from "@/lib/nav"
import { reorderAttentionTasks, setTaskDone } from "@/lib/task-actions"
import type { UnreadSummary, UnreadTone } from "@/lib/unread"

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
  /** Post-it colour in card view; the kind's own when absent. */
  paper?: Paper
  /** Set when the record can go on the Focus tray (a task, a deliverable); an invoice or a project cannot. */
  focus?: { kind: FocusKind; clientId: string | null; clientSlug: string | null; clientName: string | null }
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

const DOT: Record<AttentionTone, string> = {
  bad: "bg-bad",
  warn: "bg-warn",
  ok: "bg-tk-teal",
  neutral: "bg-ink-3",
}

const UNREAD_TONE: Record<UnreadTone, AttentionTone> = { clear: "neutral", lead: "ok", warn: "warn", bad: "bad" }

type Layout = "rows" | "cards"
type View = "summary" | "full"

const LAYOUT_KEY = "dashboard-needs-attention-layout"
const VIEW_KEY = "dashboard-needs-attention-view"

/** One of the arrivals — the unread chips under the expanded header. */
type Arrival = {
  key: string
  label: string
  count: number
  tone: AttentionTone
  /** The one line under the number — "oldest 22 days", "3 urgent, unanswered · 132d". */
  hint: string | null
  href?: string
  onClick?: () => void
}

/** "3 urgent, unanswered · 132d" — the age alone; "oldest" would not fit the tile. */
function withAge(state: string | null, oldest: string | null): string | null {
  return [state, oldest].filter(Boolean).join(" · ") || null
}

function pickOf(item: AttentionItem): FocusPick | null {
  if (!item.focus) return null
  return {
    refKind: item.focus.kind,
    refId: item.id,
    clientId: item.focus.clientId,
    clientSlug: item.focus.clientSlug,
    clientName: item.focus.clientName,
    title: item.title,
    paper: item.paper ?? (item.focus.kind === "deliverable" ? "deliverable" : "task"),
    project: item.detail ?? null,
    dueLabel: item.when ?? null,
    overdue: item.tone === "bad",
    href: item.href,
  }
}

function paperOf(item: AttentionItem): Paper {
  return item.paper ?? (item.focus?.kind === "deliverable" ? "deliverable" : item.amount ? "money" : item.focus ? "task" : "note")
}

/**
 * The homepage's to-do and its arrivals. Folded (the default, remembered
 * per browser) it is the pulse: four row cards in Karol's order — tickets,
 * mail, tasks, pipeline — each with its stats left to right and its own
 * fold (`PulseRows`); what the Unread card used to say now lives in those
 * rows. Opened, it is the full list, grouped by urgency and capped at what
 * matters this week: the unread chips under the header, filter chips that
 * narrow to one group, a footer naming what was left out, and every task
 * or deliverable draggable up onto the Focus tray, row or card, by itself.
 * Card view draws post-its like the tray's, with the tray's verbs: done,
 * pin, queue, open. A stat in the pulse that names a bucket opens the list
 * filtered to it.
 */
export function NeedsAttention({
  groups: initialGroups,
  more,
  unread,
  pulse,
}: {
  groups: AttentionGroup[]
  more?: AttentionMore | null
  /** The inbox's arrivals; null (or not ready) leaves them off. */
  unread: UnreadSummary | null
  /** The four rows the folded card shows. */
  pulse: Pulse
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const desk = useDeskDnd()
  const [groups, setGroups] = useState(initialGroups)
  const [view, setView] = useState<View>("summary")
  const [layout, setLayout] = useState<Layout>("rows")
  const [filter, setFilter] = useState<string | null>(null)
  const [completing, setCompleting] = useState<string[]>([])
  const [dismissed, setDismissed] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  useEffect(() => {
    setGroups(
      initialGroups.map((group) => ({
        ...group,
        items: group.items.filter((item) => !dismissed.includes(item.id)),
      }))
    )
  }, [initialGroups, dismissed])
  useEffect(() => {
    try {
      const savedLayout = window.localStorage.getItem(LAYOUT_KEY)
      if (savedLayout === "rows" || savedLayout === "cards") setLayout(savedLayout)
      const savedView = window.localStorage.getItem(VIEW_KEY)
      if (savedView === "summary" || savedView === "full") setView(savedView)
    } catch {
      /* private mode: the defaults stand */
    }
  }, [])

  // A drop on another row lands in the desk's DndContext; it hands it back here.
  useEffect(() => {
    if (!desk) return
    desk.setDropHandler("attention", (event: DragEndEvent) => {
      const active = event.active.data.current as { groupId?: string; id?: string } | undefined
      const over = event.over?.data.current as { groupId?: string; id?: string } | undefined
      if (!active?.groupId || !active.id || !over?.id || active.groupId !== over.groupId) return
      const group = groupsRef.current.find((g) => g.id === active.groupId)
      if (!group?.reorderable) return
      reorder(group.id, active.id, over.id)
    })
    return () => desk.setDropHandler("attention", null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desk])

  const count = groups.reduce((sum, group) => sum + group.items.length, 0)
  const visible = groups.filter((group) => group.items.length > 0 && (filter == null || group.id === filter))

  function chooseLayout(next: Layout) {
    setLayout(next)
    try {
      window.localStorage.setItem(LAYOUT_KEY, next)
    } catch {
      /* noop */
    }
  }

  function chooseView(next: View) {
    setView(next)
    if (next === "summary") setFilter(null)
    try {
      window.localStorage.setItem(VIEW_KEY, next)
    } catch {
      /* noop */
    }
  }

  function reorder(groupId: string, activeId: string, overId: string) {
    const before = groupsRef.current
    const group = before.find((row) => row.id === groupId)
    if (!group || activeId === overId) return
    const from = group.items.findIndex((item) => item.id === activeId)
    const to = group.items.findIndex((item) => item.id === overId)
    if (from < 0 || to < 0) return

    const items = [...group.items]
    const [moved] = items.splice(from, 1)
    items.splice(to, 0, moved)
    setGroups((rows) => rows.map((row) => (row.id === groupId ? { ...row, items } : row)))

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

  function complete(itemId: string) {
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

  /* ---- the arrivals, as chips over the expanded list ---- */
  const arrivals: Arrival[] | null =
    unread && unread.ready
      ? [
          {
            key: "tickets",
            label: "Tickets",
            count: unread.tickets.count,
            tone: UNREAD_TONE[unread.tickets.tone],
            hint: withAge(unread.tickets.state, unread.tickets.oldest),
            href: unread.tickets.href,
          },
          {
            key: "leads",
            label: "Leads",
            count: unread.leads.count,
            tone: UNREAD_TONE[unread.leads.tone],
            hint: withAge(unread.leads.state, unread.leads.oldest),
            href: unread.leads.href,
          },
          {
            key: "emails",
            label: "Emails",
            count: unread.otherMail,
            tone: "neutral",
            hint: withAge(unread.otherMail > 0 ? "unread" : null, unread.otherMailOldest),
            href: ROUTES.inbox,
          },
          {
            key: "events",
            label: "Events",
            count: unread.otherEvents,
            tone: "neutral",
            hint: withAge(unread.otherEvents > 0 ? "info only" : null, unread.otherEventsOldest),
            href: ROUTES.inbox,
          },
        ]
      : null

  const full = view === "full"

  const badges = (
    <>
      <h2 className="font-ui text-[13.5px] font-bold tracking-tight text-tk-onyx">Needs attention</h2>
      {count > 0 ? (
        <span className="grid h-5 min-w-5 place-items-center rounded-full border border-line bg-well px-1.5 font-ui text-[11px] font-bold tabular-nums text-tk-slate">
          {count}
        </span>
      ) : null}
      {unread && unread.ready && unread.total > 0 ? (
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-bad/10 px-1.5 font-ui text-[11px] font-bold tabular-nums text-bad" title={`${unread.total} unread`}>
          {unread.total}
        </span>
      ) : null}
    </>
  )
  const viewButton = (
    <button
      type="button"
      data-track="home.attention.view"
      data-track-value={full ? "summary" : "full"}
      aria-expanded={full}
      onClick={() => chooseView(full ? "summary" : "full")}
      className="inline-flex h-7 items-center gap-1 rounded-lg border border-line bg-well px-2 font-ui text-[11px] font-semibold text-tk-slate hover:text-tk-onyx"
    >
      {full ? "Collapse" : "Expand"}
      {full ? <ChevronUp className="size-3" aria-hidden /> : <ChevronDown className="size-3" aria-hidden />}
    </button>
  )
  const errorLine = error ? (
    <p role="status" className="rounded-lg bg-bad/10 px-3 py-2 text-xs font-semibold text-bad">
      {error}
    </p>
  ) : null

  // Folded: the four rows, no card around them — each row is its own.
  if (!full) {
    return (
      <section className="flex flex-col gap-2.5" aria-label="Needs attention">
        <div className="flex items-center gap-2.5 px-0.5">
          {badges}
          <span className="ml-auto">{viewButton}</span>
        </div>
        {errorLine}
        <PulseRows
          pulse={pulse}
          onGroup={(group) => {
            setFilter(group)
            chooseView("full")
          }}
        />
      </section>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line px-[18px] py-3">
        {badges}
        <span className="ml-auto flex items-center gap-1.5">
          <span className="inline-flex rounded-lg border border-line bg-well p-0.5">
            <LayoutButton active={layout === "rows"} label="Row view" onClick={() => chooseLayout("rows")} icon="rows" />
            <LayoutButton active={layout === "cards"} label="Card view" onClick={() => chooseLayout("cards")} icon="cards" />
          </span>
          {viewButton}
        </span>
      </div>

      {error ? <div className="mx-[18px] mt-2">{errorLine}</div> : null}

        <>
          {arrivals ? (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-[18px] py-2 font-ui text-[11px] font-semibold text-ink-3">
              <span className="mr-1 text-[10.5px] font-bold uppercase tracking-[0.12em]">Unread</span>
              {arrivals.map((row) => (
                <Link
                  key={row.key}
                  href={row.href!}
                  className={cn("inline-flex h-6 items-center gap-1.5 rounded-full border border-line bg-card px-2 hover:bg-well", row.count === 0 && "opacity-60")}
                >
                  <span aria-hidden className={cn("size-1.5 rounded-full", row.count ? DOT[row.tone] : "bg-line-strong")} />
                  {row.label}
                  <b className="tabular-nums text-tk-onyx">{row.count}</b>
                  {row.count > 0 && row.tone === "bad" && row.hint ? <span className="text-bad">· {row.hint.split(" · ")[0]}</span> : null}
                </Link>
              ))}
              <Link href={ROUTES.inbox} className="ml-auto font-bold hover:text-tk-onyx hover:underline">
                Inbox →
              </Link>
            </div>
          ) : null}

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

          {count === 0 ? (
            <p className="px-[18px] py-8 text-sm text-ink-3">All clear — nothing waiting on you.</p>
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
                      <span className="ml-auto text-xs font-semibold normal-case tracking-normal tabular-nums text-tk-onyx">{group.total}</span>
                    ) : null}
                  </div>
                  <ul className={cn(layout === "rows" ? "grid gap-0.5 px-2" : "grid gap-3.5 px-4 pb-3 pt-2 sm:grid-cols-2 xl:grid-cols-3")}>
                    {group.items.map((item, i) => (
                      <AttentionEntry
                        key={item.id}
                        item={item}
                        group={group}
                        index={i}
                        layout={layout}
                        completing={completing.includes(item.id)}
                        onComplete={() => complete(item.id)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {more && more.count > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-[18px] py-2.5 text-xs text-ink-3">
              <span className="min-w-0 truncate">
                {more.count} more {more.label}
                {more.byClient.length ? ` — ${more.byClient.map((c) => `${c.count} ${c.name}`).join(", ")}` : ""}
              </span>
              <Link href={more.href} className="shrink-0 font-ui font-bold text-tk-teal hover:underline">
                All tasks →
              </Link>
            </div>
          ) : null}
        </>
    </Card>
  )
}

/* ------------------------------------------------------------ the list */

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
      data-track="home.attention.filter"
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
            count > 0 && tone === "bad" ? "bg-bad/10 text-bad" : count > 0 && tone === "warn" ? "bg-warn/10 text-warn" : "border border-line bg-card text-ink-3"
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  )
}

/**
 * One item, as a row or a post-it. Draggable when it can go on the tray
 * (the desk's DndContext catches the drop); a drop target when its group
 * reorders. Both hooks always run — dnd-kit wants them unconditional —
 * and are switched off by `disabled`.
 */
function AttentionEntry({
  item,
  group,
  index,
  layout,
  completing,
  onComplete,
}: {
  item: AttentionItem
  group: AttentionGroup
  index: number
  layout: Layout
  completing: boolean
  onComplete: () => void
}) {
  const desk = useDeskDnd()
  const pick = pickOf(item)
  const pinned = !!pick && !!desk?.focusedRefIds.has(item.id)
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `pick:${item.id}`,
    data: { kind: "pick", pick, title: item.title, groupId: group.id, id: item.id },
    disabled: !pick,
  })
  const { isOver, setNodeRef: setDropRef } = useDroppable({
    id: `attn:${item.id}`,
    data: { zone: "attention", groupId: group.id, id: item.id },
    disabled: !group.reorderable,
  })
  const setRefs = (node: HTMLLIElement | null) => {
    setDragRef(node)
    setDropRef(node)
  }
  const verbs = {
    pin: pick
      ? () => {
          if (!pinned) desk?.focus(pick, { front: true })
        }
      : null,
    queue: pick && !pinned ? () => desk?.focus(pick, { queue: null }) : null,
  }

  if (layout === "cards") {
    return (
      <AttentionNote
        item={item}
        index={index}
        pick={pick}
        pinned={pinned}
        completable={!!group.completable}
        completing={completing}
        onComplete={onComplete}
        onPin={verbs.pin}
        onQueue={verbs.queue}
        itemRef={setRefs}
        listeners={pick ? { ...listeners, ...attributes } : null}
        className={cn(isDragging && "opacity-40", isOver && !isDragging && "outline outline-2 outline-offset-2 outline-dashed outline-accent-ink")}
      />
    )
  }

  return (
    <AttentionRow
      item={item}
      completable={!!group.completable}
      completing={completing}
      onComplete={onComplete}
      pinned={pinned}
      reorderable={!!group.reorderable}
      itemRef={setRefs}
      listeners={pick ? { ...listeners, ...attributes } : null}
      className={cn(isDragging && "opacity-40", isOver && !isDragging && "ring-2 ring-inset ring-tk-teal/45")}
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

/**
 * Row view: grip, ✓, title with its chip and detail, the date or amount.
 * The whole row is the drag handle when the item can go on the tray — the
 * grip only says so. A plain click on the title still opens it: the sensor
 * needs six pixels of travel before a drag starts, and the link is marked
 * not natively draggable so the browser's own link-drag never steals the
 * pointer.
 */
function AttentionRow({
  item,
  completable,
  completing,
  onComplete,
  pinned,
  reorderable,
  itemRef,
  listeners,
  className,
}: {
  item: AttentionItem
  completable: boolean
  completing: boolean
  onComplete: () => void
  pinned: boolean
  reorderable: boolean
  itemRef: (node: HTMLLIElement | null) => void
  listeners: Record<string, unknown> | null
  className?: string
}) {
  const meta = item.meta && item.meta !== item.title ? item.meta : undefined
  return (
    <li
      ref={itemRef}
      {...(listeners ?? {})}
      className={cn(
        "group grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-card px-1.5 py-1.5 transition-colors duration-[120ms] hover:bg-well sm:grid-cols-[28px_22px_minmax(0,1fr)_auto]",
        listeners && "cursor-grab touch-none active:cursor-grabbing",
        className
      )}
    >
      {/* display:none removes the track entirely on a phone; `contents` hands
          the cell back to the grip itself from sm up. */}
      <span className="hidden sm:contents">
        {listeners ? (
          <span
            aria-hidden
            title={reorderable ? "Drag up to Focus, or to reorder" : "Drag up to Focus"}
            className="grid size-7 shrink-0 place-items-center justify-self-center rounded-md text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
          >
            <GripIcon />
          </span>
        ) : (
          <span />
        )}
      </span>
      {completable ? (
        <CompleteButton title={item.title} completing={completing} onClick={onComplete} />
      ) : (
        <span aria-hidden className="size-[18px] justify-self-center rounded-full border-[1.5px] border-dashed border-line-strong" />
      )}
      <Link href={item.href} scroll={false} draggable={false} className="grid min-w-0 gap-[3px]">
        <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium text-tk-onyx">
          <span className="min-w-0 truncate">{item.title}</span>
          {pinned ? <Pin className="size-3 shrink-0 text-[--pin]" aria-label="On the Focus tray" /> : null}
        </span>
        <span className="flex min-w-0 items-center gap-2 text-[11.5px] text-ink-3">
          {meta ? <ClientChip name={meta} color={item.color} /> : null}
          {item.detail ? (
            <span className={cn("min-w-0 truncate", item.tone === "neutral" ? "" : cn("font-semibold", TONE[item.tone]))}>{item.detail}</span>
          ) : null}
        </span>
      </Link>
      <span className="text-right sm:pr-2">
        {item.amount ? (
          <span className="font-display text-[15px] font-semibold tracking-tight tabular-nums text-tk-onyx">{item.amount}</span>
        ) : item.when ? (
          <span className={cn("whitespace-nowrap font-ui text-[11.5px] font-semibold", item.whenTone ? TONE[item.whenTone] : "text-ink-3")}>{item.when}</span>
        ) : null}
      </span>
    </li>
  )
}

const TILT = [-0.8, 0.6, -0.4, 0.7, -0.5, 0.4]

/**
 * Card view: the same post-it as the tray's, on the kind's paper, the
 * client's name as the flag, and the tray's verbs along the foot — done,
 * pin (straight into the first slot), queue, open. The card itself drags.
 */
function AttentionNote({
  item,
  index,
  pick,
  pinned,
  completable,
  completing,
  onComplete,
  onPin,
  onQueue,
  itemRef,
  listeners,
  className,
}: {
  item: AttentionItem
  index: number
  pick: FocusPick | null
  pinned: boolean
  completable: boolean
  completing: boolean
  onComplete: () => void
  onPin: (() => void) | null
  onQueue: (() => void) | null
  itemRef: (node: HTMLLIElement | null) => void
  listeners: Record<string, unknown> | null
  className?: string
}) {
  const paper = paperOf(item)
  const meta = item.meta && item.meta !== item.title ? item.meta : undefined
  const noteStyle = {
    "--paper": `var(--paper-${paper})`,
    "--c": markColor(item.color),
    transform: `rotate(${TILT[index % TILT.length]}deg)`,
  } as React.CSSProperties
  return (
    <li
      ref={itemRef}
      style={noteStyle}
      {...(listeners ?? {})}
      data-global="true"
      className={cn(
        "tk-note group flex min-h-[150px] flex-col gap-1.5 px-3.5 pb-3 pt-3.5",
        pick && "cursor-grab touch-none active:cursor-grabbing",
        className
      )}
    >
      {pinned ? <span aria-hidden className="tk-pinhead" /> : null}
      <div className="flex items-center gap-1.5 font-ui text-[9px] font-extrabold uppercase tracking-[0.12em] text-[--paper-ink-3]">
        {PAPER_LABEL[paper]}
        {meta ? (
          <span className="ml-auto inline-flex h-4 max-w-[60%] items-center truncate rounded-[3px] bg-[--c] px-1.5 text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-white">
            {meta}
          </span>
        ) : null}
      </div>
      <h3 className="text-[13.5px] font-semibold leading-[1.3] tracking-[-0.005em] text-[--paper-ink]">
        <Link href={item.href} scroll={false} draggable={false} className="hover:underline">
          {item.title}
        </Link>
      </h3>
      <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-[--paper-ink-2]">
        {item.detail ? <span className={cn(item.tone === "bad" && "font-bold text-[--pin]")}>{item.detail}</span> : null}
        {item.when ? <span className={cn(item.whenTone === "bad" && "font-bold text-[--pin]")}>{item.when}</span> : null}
      </p>
      <div className="mt-auto flex items-center gap-2 border-t border-dashed border-[--paper-line] pt-1.5">
        {item.amount ? <span className="font-display text-sm font-bold tabular-nums text-[--paper-ink]">{item.amount}</span> : null}
        <span className="ml-auto inline-flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {completable ? (
            <NoteButton label={completing ? "Marking done…" : "Done"} onClick={onComplete} done>
              <Check className="size-3.5" aria-hidden />
            </NoteButton>
          ) : null}
          {onPin ? (
            <NoteButton label={pinned ? "On the Focus tray" : "Pin to Focus"} onClick={onPin} on={pinned}>
              <Pin className="size-3.5" aria-hidden />
            </NoteButton>
          ) : null}
          {onQueue ? (
            <NoteButton label="Add to the Focus queue" onClick={onQueue}>
              <CornerDownLeft className="size-3.5" aria-hidden />
            </NoteButton>
          ) : null}
          <Link
            href={item.href}
            scroll={false}
            draggable={false}
            aria-label={`Open ${item.title}`}
            title="Open"
            className="grid size-[22px] place-items-center rounded-[5px] text-[--paper-ink-2] hover:bg-[--paper-line] hover:text-[--paper-ink]"
          >
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </span>
      </div>
    </li>
  )
}

function CompleteButton({ title, completing, onClick }: { title: string; completing?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      data-track="home.attention.complete"
      onPointerDown={(e) => e.stopPropagation()}
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
    <svg className="size-3 animate-spin text-white" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function LayoutButton({ active, label, onClick, icon }: { active: boolean; label: string; onClick: () => void; icon: Layout }) {
  return (
    <button
      type="button"
      data-track="home.attention.layout"
      data-track-value={icon}
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn("grid size-7 place-items-center rounded-md transition-colors", active ? "bg-card text-tk-onyx shadow-card" : "text-ink-3 hover:text-tk-slate")}
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
      <path d="M1.5 6.5 5.8 11 14.5 1.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
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
