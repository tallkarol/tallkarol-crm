"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  Dropdown,
  MenuHead,
  MenuOption,
  MenuRule,
  MenuSub,
} from "@/components/support/Dropdown"
import type { QueueRow } from "@/components/support/types"
import { cn } from "@/lib/cn"
import {
  PRIORITY_RANK,
  SORT_LABEL,
  STATE_FILTERS,
  DEFAULT_STATE,
  matchesStateFilter,
  TICKET_SORTS,
  priorityTone,
  stateTone,
  type StateFilter,
  type TicketPriority,
  type TicketSort,
} from "@/lib/support"

type View = "all" | "mine" | "urgent" | "waiting" | "code"
type Group = "none" | "client" | "platform" | "priority"
type Menu = "view" | "clients" | "platforms" | "state" | "more"

const VIEWS: { id: View; label: string }[] = [
  { id: "all", label: "All tickets" },
  { id: "mine", label: "Needs me today" },
  { id: "urgent", label: "Urgent & high" },
  { id: "waiting", label: "Waiting on client" },
  { id: "code", label: "Has payload" },
]

const GROUPS: { id: Group; label: string }[] = [
  { id: "none", label: "Flat" },
  { id: "client", label: "By client" },
  { id: "platform", label: "By platform" },
  { id: "priority", label: "By priority" },
]

const DENSITIES: { id: "comfy" | "tight"; label: string }[] = [
  { id: "comfy", label: "Comfortable" },
  { id: "tight", label: "Compact" },
]

export type QueueInitial = {
  q: string
  clients: string[]
  platforms: string[]
  state: StateFilter
  group: Group
  sort: TicketSort
  density: "comfy" | "tight"
  view: View | null
}

const DAY = 24 * 60 * 60 * 1000

export function TicketQueue({
  rows,
  selected,
  initial,
}: {
  rows: QueueRow[]
  selected: string | null
  initial: QueueInitial
}) {
  const router = useRouter()
  const [q, setQ] = useState(initial.q)
  const [clients, setClients] = useState<string[]>(initial.clients)
  const [platforms, setPlatforms] = useState<string[]>(initial.platforms)
  const [state, setState] = useState<StateFilter>(initial.state)
  const [group, setGroup] = useState<Group>(initial.group)
  const [sort, setSort] = useState<TicketSort>(initial.sort)
  const [density, setDensity] = useState<"comfy" | "tight">(initial.density)
  const [view, setView] = useState<View>(initial.view ?? "all")
  const [menu, setMenu] = useState<Menu | null>(null)
  const [cursor, setCursor] = useState(0)
  /* The cursor ring only appears once j/k is actually driving — on a fresh
     load a highlighted first row reads as a band, not as focus. */
  const [keyboard, setKeyboard] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Counts in a menu answer "what would I get if I picked this?", so each one
     honours every other filter but not its own selection. */
  const matcher = useCallback(
    (skip: "clients" | "platforms" | "state" | null) => (r: QueueRow) => {
      if (skip !== "clients" && clients.length && !clients.includes(r.clientSlug)) return false
      if (skip !== "platforms" && platforms.length && !platforms.includes(r.platform)) return false
      if (skip !== "state" && !matchesStateFilter(r.state, state)) return false
      if (!matchesView(r, view)) return false
      const needle = q.trim().toLowerCase()
      if (needle && !r.search.includes(needle)) return false
      return true
    },
    [clients, platforms, state, view, q]
  )

  /* A picked value never drops out of its own menu, even when the other
     filters leave it at zero — otherwise the only way back is the pill. */
  const clientFacets = useMemo(
    () => keepSelected(facets(rows.filter(matcher("clients")), "client"), facets(rows, "client"), clients),
    [rows, matcher, clients]
  )
  const platformFacets = useMemo(
    () =>
      keepSelected(
        facets(rows.filter(matcher("platforms")), "platform"),
        facets(rows, "platform"),
        platforms
      ),
    [rows, matcher, platforms]
  )
  /* Whether the queue has more than one platform at all — the control stays put
     while you filter, rather than vanishing under you. */
  const showPlatform = useMemo(() => facets(rows, "platform").length > 1, [rows])
  const stateCounts = useMemo(() => {
    const scoped = rows.filter(matcher("state"))
    const counts: Record<string, number> = { all: scoped.length }
    for (const row of scoped) counts[row.state] = (counts[row.state] ?? 0) + 1
    return counts
  }, [rows, matcher])

  /* Views and filters compose: the view narrows first, then every filter
     narrows again. Two of them can land you on an empty queue — the strip
     above the list names each one, so undoing it is a single click. */
  const visible = useMemo(() => {
    const list = rows.filter(matcher(null))

    list.sort((a, b) => {
      const ac = a.state === "closed" ? 1 : 0
      const bc = b.state === "closed" ? 1 : 0
      if (ac !== bc) return ac - bc
      if (sort === "newest") return b.openedAt - a.openedAt
      if (sort === "oldest") return a.openedAt - b.openedAt
      if (sort === "due") {
        if (a.late !== b.late) return a.late ? -1 : 1
        if (a.dueAt !== b.dueAt) {
          if (a.dueAt == null) return 1
          if (b.dueAt == null) return -1
          return a.dueAt - b.dueAt
        }
        return a.openedAt - b.openedAt
      }
      const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
      if (rank !== 0) return rank
      if (a.late !== b.late) return a.late ? -1 : 1
      return 0
    })
    return list
  }, [rows, matcher, sort])

  /* The filters ARE the URL — replaceState so a view stays sendable without a
     server round trip on every keystroke. */
  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set("q", q.trim())
    if (clients.length) p.set("client", clients.join(","))
    if (platforms.length) p.set("platform", platforms.join(","))
    if (state !== DEFAULT_STATE) p.set("state", state)
    if (group !== "none") p.set("group", group)
    if (sort !== "priority") p.set("sort", sort)
    if (density !== "comfy") p.set("density", density)
    if (view !== "all") p.set("view", view)
    return p.toString()
  }, [q, clients, platforms, state, group, sort, density, view])

  useEffect(() => {
    const base = window.location.pathname
    const next = query ? `${base}?${query}` : base
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next)
    }
  }, [query])

  const hrefFor = useCallback(
    (row: QueueRow) => (query ? `/support/${row.slug}?${query}` : `/support/${row.slug}`),
    [query]
  )

  /* Keep the cursor on the open ticket, and inside the list when it shrinks. */
  useEffect(() => {
    if (!visible.length) return
    const idx = selected ? visible.findIndex((r) => r.slug === selected) : -1
    setCursor((c) => (idx >= 0 ? idx : Math.min(c, visible.length - 1)))
  }, [selected, visible])

  const move = useCallback(
    (delta: number) => {
      if (!visible.length) return
      setCursor((c) => {
        const next = Math.max(0, Math.min(c + delta, visible.length - 1))
        const row = visible[next]
        listRef.current
          ?.querySelector(`[data-slug="${row.slug}"]`)
          ?.scrollIntoView({ block: "nearest" })
        // Detail follows the cursor once a ticket is open, debounced so a held
        // key doesn't fire a navigation per frame.
        if (selected) {
          if (navTimer.current) clearTimeout(navTimer.current)
          navTimer.current = setTimeout(() => router.push(hrefFor(row), { scroll: false }), 90)
        }
        return next
      })
    },
    [visible, selected, router, hrefFor]
  )

  useEffect(() => () => {
    if (navTimer.current) clearTimeout(navTimer.current)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null
      const typing =
        el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable
      if (e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === "/" && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }
      if (e.key === "Escape") {
        // Esc unwinds one layer at a time: menu, then search, then the ticket.
        if (menu) {
          setMenu(null)
          return
        }
        if (typing) {
          ;(el as HTMLInputElement).blur()
          return
        }
        if (selected) router.push(query ? `/support?${query}` : "/support", { scroll: false })
        return
      }
      if (typing || menu) return
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault()
        setKeyboard(true)
        move(1)
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault()
        setKeyboard(true)
        move(-1)
      } else if (e.key === "Enter") {
        const row = visible[cursor]
        if (row) router.push(hrefFor(row), { scroll: false })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [move, visible, cursor, selected, router, query, hrefFor, menu])

  function clearAll() {
    setQ("")
    setClients([])
    setPlatforms([])
    setState(DEFAULT_STATE)
    setView("all")
    setMenu(null)
  }

  const viewLabel = VIEWS.find((v) => v.id === view)?.label ?? "All tickets"
  const stateLabel =
    state === "all"
      ? "Any state"
      : (STATE_FILTERS.find((s) => s.id === state)?.label ?? "Any state")
  const clientLabel = clients.length
    ? `${clientFacets.find((f) => f.key === clients[0])?.label ?? clients[0]}${
        clients.length > 1 ? ` +${clients.length - 1}` : ""
      }`
    : "Clients"
  const platformLabel = platforms.length
    ? `${platforms[0]}${platforms.length > 1 ? ` +${platforms.length - 1}` : ""}`
    : "Platform"

  const runs = buildRuns(visible, group, sort)
  const hasFilters =
    view !== "all" ||
    clients.length > 0 ||
    platforms.length > 0 ||
    state !== DEFAULT_STATE ||
    Boolean(q.trim())

  return (
    <div data-menu-boundary className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-card px-3 py-2">
        <Dropdown
          open={menu === "view"}
          onOpen={() => setMenu("view")}
          onClose={() => setMenu(null)}
          variant="lens"
          active={view !== "all"}
          label={
            <>
              <span aria-hidden className={view === "all" ? "text-tk-teal" : undefined}>
                ◈
              </span>
              {viewLabel}
            </>
          }
        >
          <MenuHead>Saved views</MenuHead>
          {VIEWS.map((v) => (
            <MenuOption
              key={v.id}
              kind="radio"
              checked={view === v.id}
              onSelect={() => {
                setView(v.id)
                setMenu(null)
              }}
            >
              {v.label}
            </MenuOption>
          ))}
        </Dropdown>

        <label className="flex min-w-[160px] flex-1 items-center gap-2 rounded-lg border border-line bg-well px-2.5 py-1.5">
          <span aria-hidden className="text-xs text-ink-3">
            ⌕
          </span>
          <input
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, client, tag, payload…"
            aria-label="Search tickets"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-tk-onyx outline-none placeholder:text-ink-3"
          />
          <kbd className="rounded border border-line px-1.5 font-mono text-[10px] text-ink-3">
            /
          </kbd>
        </label>

        <Dropdown
          open={menu === "clients"}
          onOpen={() => setMenu("clients")}
          onClose={() => setMenu(null)}
          label={clientLabel}
          count={clients.length}
          active={clients.length > 0}
        >
          <MenuHead onClear={clients.length ? () => setClients([]) : undefined}>Clients</MenuHead>
          {clientFacets.map((f) => (
            <MenuOption
              key={f.key}
              kind="check"
              checked={clients.includes(f.key)}
              onSelect={() => setClients(toggle(clients, f.key))}
              color={f.color}
              count={f.count}
            >
              {f.label}
            </MenuOption>
          ))}
        </Dropdown>

        {showPlatform ? (
          <Dropdown
            open={menu === "platforms"}
            onOpen={() => setMenu("platforms")}
            onClose={() => setMenu(null)}
            label={platformLabel}
            count={platforms.length}
            active={platforms.length > 0}
          >
            <MenuHead onClear={platforms.length ? () => setPlatforms([]) : undefined}>
              Platform
            </MenuHead>
            {platformFacets.map((f) => (
              <MenuOption
                key={f.key}
                kind="check"
                checked={platforms.includes(f.key)}
                onSelect={() => setPlatforms(toggle(platforms, f.key))}
                count={f.count}
              >
                {f.label}
              </MenuOption>
            ))}
          </Dropdown>
        ) : null}

        <Dropdown
          open={menu === "state"}
          onOpen={() => setMenu("state")}
          onClose={() => setMenu(null)}
          label={stateLabel}
          active={state !== DEFAULT_STATE}
        >
          <MenuHead>State</MenuHead>
          {STATE_FILTERS.map((s) => (
            <MenuOption
              key={s.id}
              kind="radio"
              checked={state === s.id}
              onSelect={() => {
                setState(s.id)
                setMenu(null)
              }}
              count={stateCounts[s.id] ?? 0}
            >
              {s.id === "all" ? "Any state" : s.label}
            </MenuOption>
          ))}
        </Dropdown>

        <span aria-hidden className="mx-0.5 h-5 w-px bg-well" />

        <Dropdown
          open={menu === "more"}
          onOpen={() => setMenu("more")}
          onClose={() => setMenu(null)}
          align="right"
          variant="icon"
          title="Group, sort, density"
          label={<span aria-label="View options">⋯</span>}
        >
          <MenuSub>Group</MenuSub>
          {GROUPS.map((g) => (
            <MenuOption
              key={g.id}
              kind="radio"
              checked={group === g.id}
              onSelect={() => setGroup(g.id)}
            >
              {g.label}
            </MenuOption>
          ))}
          <MenuRule />
          <MenuSub>Sort</MenuSub>
          {TICKET_SORTS.map((s) => (
            <MenuOption key={s} kind="radio" checked={sort === s} onSelect={() => setSort(s)}>
              {SORT_LABEL[s]}
            </MenuOption>
          ))}
          <MenuRule />
          <MenuSub>Density</MenuSub>
          {DENSITIES.map((d) => (
            <MenuOption
              key={d.id}
              kind="radio"
              checked={density === d.id}
              onSelect={() => setDensity(d.id)}
            >
              {d.label}
            </MenuOption>
          ))}
        </Dropdown>
      </div>

      {hasFilters ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-well px-3 py-1.5">
          {view !== "all" ? <FilterPill label={viewLabel} onRemove={() => setView("all")} /> : null}
          {clients.map((slug) => (
            <FilterPill
              key={slug}
              label={clientFacets.find((f) => f.key === slug)?.label ?? slug}
              color={clientFacets.find((f) => f.key === slug)?.color}
              onRemove={() => setClients(clients.filter((c) => c !== slug))}
            />
          ))}
          {platforms.map((p) => (
            <FilterPill
              key={p}
              label={p}
              onRemove={() => setPlatforms(platforms.filter((x) => x !== p))}
            />
          ))}
          {state !== DEFAULT_STATE ? (
            <FilterPill label={stateLabel} onRemove={() => setState("all")} />
          ) : null}
          {q.trim() ? <FilterPill label={`“${q.trim()}”`} onRemove={() => setQ("")} /> : null}
          <button
            type="button"
            onClick={clearAll}
            className="text-[11.5px] font-semibold text-tk-teal hover:underline"
          >
            Clear all
          </button>
          <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-3">
            {visible.length} of {rows.length} tickets
          </span>
        </div>
      ) : null}

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto bg-well">
        {visible.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-ink-3">
            No tickets match.{" "}
            <button
              type="button"
              onClick={clearAll}
              className="font-semibold text-tk-teal hover:underline"
            >
              Clear all
            </button>{" "}
            puts the queue back.
          </p>
        ) : (
          runs.map((run, i) => (
            <div key={run.key}>
              {run.label && runs.length > 1 ? (
                run.sticky ? (
                  <div className="sticky top-0 z-[1] flex items-center gap-2 border-b border-line bg-well px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-widest text-ink-3 backdrop-blur">
                    {run.color ? (
                      <span
                        className="size-2 rounded-full"
                        style={{ background: run.color }}
                        aria-hidden
                      />
                    ) : null}
                    {run.label}
                    <span className="ml-auto font-mono tabular-nums text-ink-3">
                      {run.rows.length}
                    </span>
                  </div>
                ) : (
                  /* Band label — deliberately quieter than a group header: it
                     names the run you're looking at without pretending to be a
                     section you could collapse. */
                  <div
                    className={cn(
                      "flex items-center gap-2 px-4 py-[3px] font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-3",
                      i > 0 && "border-t border-line",
                      run.tint ? "bg-well" : "bg-card"
                    )}
                  >
                    {run.label}
                    <span className="ml-auto tabular-nums text-ink-3">{run.rows.length}</span>
                  </div>
                )
              ) : null}
              {run.rows.map((row) => (
                <Row
                  key={row.id}
                  row={row}
                  href={hrefFor(row)}
                  open={selected === row.slug}
                  cursored={keyboard && visible[cursor]?.slug === row.slug}
                  tight={density === "tight"}
                  tint={run.tint}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function Row({
  row,
  href,
  open,
  cursored,
  tight,
  tint,
}: {
  row: QueueRow
  href: string
  open: boolean
  cursored: boolean
  tight: boolean
  tint: boolean
}) {
  return (
    <Link
      href={href}
      scroll={false}
      prefetch
      data-slug={row.slug}
      aria-current={open ? "page" : undefined}
      className={cn(
        "flex border-b border-line transition-colors",
        tint ? "bg-well" : "bg-card",
        open ? "!bg-tk-teal/[0.07]" : "hover:!bg-well",
        cursored && !open && "ring-1 ring-inset ring-tk-teal/30"
      )}
    >
      <span aria-hidden className="w-[3px] shrink-0" style={{ background: row.color }} />
      <span className={cn("min-w-0 flex-1", tight ? "px-3.5 py-1.5" : "px-3.5 py-2.5")}>
        <span className="flex items-baseline gap-2">
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
            {row.number}
          </span>
          <span
            className={cn(
              "truncate text-[13.5px] font-semibold",
              open ? "text-tk-teal" : "text-tk-onyx"
            )}
            title={row.title}
          >
            {row.title || "Untitled"}
          </span>
        </span>
        {tight ? null : (
          <span className="mt-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-[11.5px] text-ink-3">
            <span className="flex shrink-0 items-center gap-1.5 font-semibold text-tk-slate">
              <span
                className="size-[7px] rounded-full"
                style={{ background: row.color }}
                aria-hidden
              />
              {row.clientName}
            </span>
            {row.platform ? (
              <>
                <span className="shrink-0 text-ink-3">·</span>
                <span className="shrink-0">{row.platform}</span>
              </>
            ) : null}
            <span className="shrink-0 text-ink-3">·</span>
            <span className="shrink-0">{row.source}</span>
            {row.payloadCount ? (
              <span className="shrink-0 rounded bg-well px-1.5 font-mono text-[10px] text-ink-3">
                {"{ } "}
                {row.payloadCount}
              </span>
            ) : null}
            {row.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="shrink-0 rounded bg-well px-1.5 font-mono text-[10px] text-ink-3"
              >
                {tag}
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2 px-3 py-2">
        {tight && row.platform ? (
          <span className="hidden rounded bg-well px-1.5 font-mono text-[10px] text-ink-3 sm:inline">
            {row.platform}
          </span>
        ) : null}
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
            priorityTone(row.priority)
          )}
        >
          {row.priority}
        </span>
        <span
          className={cn(
            "hidden rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide sm:inline",
            stateTone(row.state)
          )}
        >
          {row.stateLabel}
        </span>
        <span
          className={cn(
            "w-8 text-right font-mono text-[11px] tabular-nums",
            row.late ? "font-semibold text-bad" : "text-ink-3"
          )}
          title={row.dueLabel || undefined}
        >
          {row.age}
        </span>
      </span>
    </Link>
  )
}

function FilterPill({
  label,
  color,
  onRemove,
}: {
  label: string
  color?: string
  onRemove: () => void
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-0.5 pl-2 pr-1 text-[11.5px] text-tk-slate">
      {color ? (
        <span className="size-[7px] rounded-full" style={{ background: color }} aria-hidden />
      ) : null}
      <b className="font-semibold">{label}</b>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
        className="rounded px-1 leading-none text-ink-3 hover:bg-well transition-colors duration-[120ms] hover:text-bad"
      >
        ✕
      </button>
    </span>
  )
}

/** Re-adds any picked value the other filters have narrowed out, at count 0. */
function keepSelected(scoped: Facet[], all: Facet[], selected: string[]): Facet[] {
  const missing = selected
    .filter((key) => !scoped.some((f) => f.key === key))
    .map((key) => {
      const known = all.find((f) => f.key === key)
      return { key, label: known?.label ?? key, color: known?.color, count: 0 }
    })
  return missing.length ? [...scoped, ...missing] : scoped
}

/** The lens each saved view applies. Filters then narrow whatever it returns. */
function matchesView(r: QueueRow, view: View) {
  if (view === "mine")
    return (
      r.state !== "closed" &&
      (r.late || r.dueSoon || r.priority === "urgent" || r.priority === "high")
    )
  if (view === "urgent")
    return r.state !== "closed" && (r.priority === "urgent" || r.priority === "high")
  if (view === "waiting") return r.state === "waiting"
  if (view === "code") return r.payloadCount > 0
  return true
}

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

type Facet = { key: string; label: string; color?: string; count: number }

function facets(rows: QueueRow[], kind: "client" | "platform"): Facet[] {
  const map = new Map<string, Facet>()
  for (const row of rows) {
    const key = kind === "client" ? row.clientSlug : row.platform
    if (!key) continue
    const existing = map.get(key)
    if (existing) existing.count++
    else
      map.set(key, {
        key,
        label: kind === "client" ? row.clientName : key,
        color: kind === "client" ? row.color : undefined,
        count: 1,
      })
  }
  return Array.from(map.values()).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label)
  )
}

type Run = {
  key: string
  label: string
  color?: string
  tint: boolean
  sticky: boolean
  rows: QueueRow[]
}

const PRIORITY_BAND: Record<TicketPriority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
}

/**
 * A band is a run of whatever the queue is ordered by — the urgent block, then
 * the high block, under the default sort; today / this week / older by age;
 * overdue vs due-this-week by due date. Closed always trails in its own band.
 * The tint alternates per run rather than per row, so a stripe is always a true
 * statement about the rows inside it.
 */
function bandOf(row: QueueRow, sort: TicketSort, now: number): { key: string; label: string } {
  if (row.state === "closed") return { key: "closed", label: "Closed" }
  if (sort === "priority") return { key: row.priority, label: PRIORITY_BAND[row.priority] }
  if (sort === "due") {
    if (row.late) return { key: "overdue", label: "Overdue" }
    if (row.dueAt == null) return { key: "nodue", label: "No due date" }
    return row.dueAt - now <= 7 * DAY
      ? { key: "duesoon", label: "Due this week" }
      : { key: "later", label: "Later" }
  }
  const age = now - row.openedAt
  if (age <= DAY) return { key: "today", label: "Today" }
  if (age <= 7 * DAY) return { key: "week", label: "This week" }
  return { key: "older", label: "Older" }
}

function buildRuns(rows: QueueRow[], group: Group, sort: TicketSort): Run[] {
  if (!rows.length) return []

  // Grouping names its own sections, so it owns the headers and bands stand down.
  if (group !== "none") {
    const map = new Map<string, Run>()
    const order: string[] = []
    for (const row of rows) {
      const key =
        group === "client"
          ? row.clientName
          : group === "platform"
            ? row.platform || "No platform"
            : PRIORITY_BAND[row.priority]
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: key,
          color: group === "client" ? row.color : undefined,
          tint: false,
          sticky: true,
          rows: [],
        })
        order.push(key)
      }
      map.get(key)!.rows.push(row)
    }
    const sections = order.map((k) => map.get(k)!)
    if (group === "priority") {
      sections.sort(
        (a, b) => PRIORITY_RANK[a.rows[0].priority] - PRIORITY_RANK[b.rows[0].priority]
      )
    } else {
      sections.sort((a, b) => b.rows.length - a.rows.length || a.label.localeCompare(b.label))
    }
    return sections.map((run, i) => ({ ...run, tint: i % 2 === 1 }))
  }

  const now = Date.now()
  const runs: Run[] = []
  for (const row of rows) {
    const band = bandOf(row, sort, now)
    const last = runs[runs.length - 1]
    if (last && last.key === band.key) last.rows.push(row)
    else
      runs.push({
        key: band.key,
        label: band.label,
        tint: runs.length % 2 === 1,
        sticky: false,
        rows: [row],
      })
  }
  return runs
}
