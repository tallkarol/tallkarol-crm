"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Loader2, Search } from "lucide-react"
import { sendMessage } from "@/lib/chat/actions"
import { cn } from "@/lib/cn"
import { clientColor, markColor } from "@/lib/client-colors"
import { CHROME_NAV, DOCK_NAV, PARKED_NAV, ROUTES, type NavBadge } from "@/lib/nav"
import type { PaletteEntry, PaletteKind, PalettePayload } from "@/lib/palette"
import { startPunch } from "@/lib/punch-actions"
import { announcePunchChange } from "@/lib/punch-signal"
import { Card } from "@/components/ui/Card"

/**
 * Anything can open the palette — the dashboard's search button, the rail's,
 * the phone header's — without holding a reference to it. A window event,
 * the same idiom as the chat's compose bus.
 */
export const PALETTE_OPEN_EVENT = "tk:palette-open"

export function openPalette() {
  window.dispatchEvent(new CustomEvent(PALETTE_OPEN_EVENT))
}

/** Section headings while searching, in the order sections fall back to. */
const SECTIONS: { kind: PaletteKind; heading: string }[] = [
  { kind: "action", heading: "Actions" },
  { kind: "page", heading: "Pages" },
  { kind: "client", heading: "Clients" },
  { kind: "project", heading: "Projects" },
  { kind: "retainer", heading: "Retainers" },
  { kind: "room", heading: "Client rooms" },
  { kind: "task", heading: "Tasks" },
  { kind: "ticket", heading: "Tickets" },
  { kind: "invoice", heading: "Invoices" },
  { kind: "chat", heading: "Chats" },
  { kind: "doc", heading: "Documents" },
  { kind: "punchlist", heading: "Punch lists" },
  { kind: "meeting", heading: "Meeting notes" },
  { kind: "product", heading: "Products" },
  { kind: "board", heading: "Inspiration" },
]

/** Rows per section while searching — a query that hits 30 projects should still show the task below them. */
const PER_SECTION = 8

/**
 * The actions that need nothing from the server. The per-client ones
 * (clock in, check in, website care) arrive with the records.
 */
const STATIC_ACTIONS: PaletteEntry[] = [
  { kind: "action", label: "New chat", href: `${ROUTES.chat}?new` },
  // The launcher types the address, as its own Coach button does.
  { kind: "action", label: "Talk to coach", href: `${ROUTES.chat}?new&to=coach`, sub: "Coach" },
]

/** The shell's badges, said in words. Review counts punches, not mail. */
const BADGE_NOUN: Record<string, string> = {
  [ROUTES.inbox]: "unread",
  [ROUTES.leads]: "unread",
  [ROUTES.support]: "unread",
  [ROUTES.timesheetReview]: "to review",
}

/**
 * Every page, in the rail's own order: the chrome routes, then each dock
 * group's rows, then the parked pages (searchable, never listed empty).
 * Built from lib/nav.ts, so a page added to the dock is in ⌘K with no edit
 * here. First href wins — a page in two places is listed once.
 */
const PAGES: PaletteEntry[] = (() => {
  const seen = new Set<string>()
  const rows: PaletteEntry[] = [
    ...CHROME_NAV.map((l) => ({ kind: "page" as const, label: l.label, href: l.href, group: "Home" })),
    ...DOCK_NAV.flatMap((g) =>
      g.items.map((i) => ({ kind: "page" as const, label: i.label, href: i.href, group: g.label }))
    ),
    ...PARKED_NAV.map((l) => ({ kind: "page" as const, label: l.label, href: l.href, group: "Settings", parked: true })),
  ]
  return rows.filter((r) => {
    const key = r.href ?? r.label
    return seen.has(key) ? false : (seen.add(key), true)
  })
})()

function words(q: string) {
  return q.toLowerCase().split(/\s+/).filter(Boolean)
}

function matches(entry: PaletteEntry, q: string[]) {
  const hay = `${entry.label} ${entry.sub ?? ""} ${entry.group ?? ""} ${entry.keywords ?? ""}`.toLowerCase()
  return q.every((word) => hay.includes(word))
}

/** 0: the name starts with the query; 1: a word in the name does; 2: it only matched somewhere. */
function rank(entry: PaletteEntry, q: string[]) {
  const label = entry.label.toLowerCase()
  if (label.startsWith(q[0])) return 0
  if (label.split(/[\s—-]+/).some((w) => w.startsWith(q[0]))) return 1
  return 2
}

type Row = { entry: PaletteEntry; heading: string }

type Load = { status: "idle" | "loading" | "ready" | "error"; payload: PalettePayload | null }

/**
 * ⌘K, on every page — mounted once by the app shell. Pages are known up
 * front (they come from the rail's menu); clients, projects, retainers and
 * the task and invoice counts are fetched the first time it opens, and again
 * quietly on every later open, so the page load pays for none of it.
 *
 * Spotlight-shaped: a full-screen scrim with one big field in the middle.
 * The dialog is portalled to <body> because a transformed ancestor (the
 * dashboard header rises in with one) becomes the containing block for
 * `position: fixed` — rendered in place, the overlay was a 54px strip.
 */
export function CommandPalette({ badges = {} }: { badges?: Record<string, NavBadge> }) {
  const [open, setOpen] = useState(false)
  const [load, setLoad] = useState<Load>({ status: "idle", payload: null })

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((o) => !o)
      }
    }
    function onOpen() {
      setOpen(true)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener(PALETTE_OPEN_EVENT, onOpen)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener(PALETTE_OPEN_EVENT, onOpen)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let live = true
    setLoad((l) => (l.payload ? l : { status: "loading", payload: null }))
    fetch("/api/palette", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<PalettePayload>) : Promise.reject(res.status)))
      .then((payload) => live && setLoad({ status: "ready", payload }))
      // A failed refresh keeps the last good list; only a first load shows the error.
      .catch(() => live && setLoad((l) => (l.payload ? l : { status: "error", payload: null })))
    return () => {
      live = false
    }
  }, [open])

  const counts = useMemo(() => {
    const out: Record<string, string> = { ...load.payload?.counts }
    for (const [href, badge] of Object.entries(badges)) {
      if (badge.count > 0) out[href] = `${badge.count} ${BADGE_NOUN[href] ?? ""}`.trim()
    }
    return out
  }, [badges, load.payload])

  return open ? (
    <PaletteDialog
      records={load.payload?.records ?? []}
      status={load.status}
      counts={counts}
      onClose={() => setOpen(false)}
    />
  ) : null
}

function PaletteDialog({
  records,
  status,
  counts,
  onClose,
}: {
  records: PaletteEntry[]
  status: Load["status"]
  counts: Record<string, string>
  onClose: () => void
}) {
  const router = useRouter()
  const listId = useId()
  const [q, setQ] = useState("")
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const rows = useMemo<Row[]>(() => {
    const query = words(q)
    // Empty, it is the two quick actions and the rail's menu under the
    // rail's headings — a launcher. Records wait for a query: a few hundred
    // names is a wall, not a menu.
    if (!query.length) {
      return [
        ...STATIC_ACTIONS.map((entry) => ({ entry, heading: "Actions" })),
        ...PAGES.filter((p) => !p.parked).map((entry) => ({ entry, heading: entry.group ?? "Pages" })),
      ]
    }
    const pool = [...STATIC_ACTIONS, ...PAGES, ...records]
    // Sections keep their order unless one has the better hit: "min" puts
    // Mineralife (a name that starts with it) above HiveMind (one that only
    // contains it), even though pages usually lead.
    return SECTIONS.map(({ kind, heading }, order) => {
      const hits = pool
        .filter((e) => e.kind === kind && matches(e, query))
        .map((entry, i) => ({ entry, i, r: rank(entry, query) }))
        .sort((a, b) => a.r - b.r || a.i - b.i)
        .slice(0, PER_SECTION)
      return { heading, order, best: hits[0]?.r ?? 3, hits }
    })
      .filter((sec) => sec.hits.length > 0)
      .sort((a, b) => a.best - b.best || a.order - b.order)
      .flatMap((sec) => sec.hits.map(({ entry }) => ({ entry, heading: sec.heading })))
  }, [q, records])

  useEffect(() => {
    // Back to the button that opened it, so the keyboard path survives a close.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    input.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
      opener?.focus()
    }
  }, [])

  useEffect(() => {
    setCursor(0)
  }, [q])

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [cursor])

  const [running, setRunning] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  async function go(row: Row | undefined) {
    if (!row || running) return
    const { entry } = row
    const action = entry.action
    if (!action) {
      if (!entry.href) return
      onClose()
      if (entry.external) window.open(entry.href, "_blank", "noopener")
      else router.push(entry.href)
      return
    }
    setFailed(null)
    if (action.type === "clock-in") {
      setRunning(`Clocking in for ${entry.label.replace(/^Clock in for /, "")}…`)
      const result = await startPunch({ clientId: action.clientId })
      setRunning(null)
      if (!result.ok) return setFailed(result.error)
      announcePunchChange()
      onClose()
      router.refresh()
      return
    }
    // A chat action is the message you would have typed on /chat: it starts
    // the thread there and opens it, so the turn runs where you can watch it.
    setRunning(action.busy)
    const result = await sendMessage({ text: action.text })
    setRunning(null)
    if (!result.ok) return setFailed(result.error)
    onClose()
    router.push(ROUTES.chatThread(result.threadId))
  }

  function onKey(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      setCursor((c) => Math.min(rows.length - 1, c + 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (event.key === "Enter") {
      event.preventDefault()
      void go(rows[cursor])
    } else if (event.key === "Tab") {
      // The field is the only stop; arrows move the cursor, Tab stays put.
      event.preventDefault()
    }
  }

  const optionId = (index: number) => `${listId}-${index}`
  const searching = q.trim().length > 0
  let lastHeading: string | null = null

  // z-90: over the rail, the dock and a peek (75), under the floating clock (100).
  // The top padding centres a full panel (~520px) and then stays put, so the
  // field does not jump as the list shrinks under a query.
  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[max(8dvh,calc(50dvh_-_260px))]"
      role="dialog"
      aria-modal="true"
      aria-label="Search or jump to"
      data-nav="palette"
    >
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-scrim backdrop-blur-[6px] motion-safe:animate-[tk-fade-in_.15s_ease-out]"
      />
      <Card
        elevation="overlay"
        className="relative w-full max-w-[680px] overflow-hidden text-tk-onyx motion-safe:animate-[tk-modal-in_.18s_ease-out]"
        onKeyDown={onKey}
      >
        {/* The global ring would box the field inside its own panel; focus
            cannot leave it (Tab is held), so the teal icon is the indicator. */}
        <div className="group flex h-16 items-center gap-3 border-b border-line px-5">
          <Search className="size-[22px] shrink-0 text-ink-3 group-focus-within:text-accent-ink" aria-hidden />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={rows.length ? optionId(cursor) : undefined}
            aria-autocomplete="list"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setFailed(null)
            }}
            placeholder="Search or jump to…"
            aria-label="Search"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[21px] tracking-[-0.01em] text-tk-onyx placeholder:text-ink-3 focus-visible:outline-none"
          />
        </div>
        {running || failed ? (
          <p
            role="status"
            className={cn(
              "flex items-center gap-2 border-b border-line px-5 py-2.5 font-ui text-[12.5px]",
              failed ? "text-bad" : "text-ink-2"
            )}
          >
            {running ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {running ?? failed}
          </p>
        ) : null}
        <div ref={list} id={listId} className="max-h-[min(420px,56dvh)] overflow-y-auto p-2" role="listbox" aria-label="Results">
          {rows.length === 0 && status !== "loading" ? (
            <p className="px-3 py-10 text-center text-sm text-ink-3">
              Nothing matches “{q}”.
            </p>
          ) : null}
          {rows.map((row, index) => {
            const { entry } = row
            const heading = row.heading !== lastHeading ? row.heading : null
            lastHeading = row.heading
            // A page shows its live count; while searching, a page with none
            // shows its dock group, so "Review" says which Review it is.
            const sub =
              entry.kind === "page" && entry.href ? (counts[entry.href] ?? (searching ? entry.group : undefined)) : entry.sub
            return (
              <div key={`${entry.kind}:${entry.href ?? entry.label}`}>
                {heading ? (
                  <p className="px-3 pb-1 pt-2.5 font-ui text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
                    {heading}
                  </p>
                ) : null}
                <button
                  type="button"
                  role="option"
                  id={optionId(index)}
                  tabIndex={-1}
                  aria-selected={index === cursor}
                  aria-disabled={running !== null}
                  data-index={index}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => void go(row)}
                  className={cn(
                    "flex h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] text-tk-onyx",
                    index === cursor && "bg-well"
                  )}
                >
                  {entry.slug ? (
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: markColor(clientColor(entry.slug)) }}
                    />
                  ) : null}
                  <span className="truncate font-medium">{entry.label}</span>
                  {sub ? (
                    <span className="ml-auto shrink-0 font-ui text-[12px] text-ink-3">
                      {sub}
                    </span>
                  ) : null}
                  {entry.external ? (
                    <ArrowUpRight className={cn("size-3.5 shrink-0 text-ink-3", !sub && "ml-auto")} aria-label="Opens in a new tab" />
                  ) : null}
                </button>
              </div>
            )
          })}
          {searching && status === "loading" ? (
            <p className="px-3 py-3 font-ui text-[12px] text-ink-3" role="status">
              Loading clients, tasks, invoices and the rest…
            </p>
          ) : null}
          {searching && status === "error" ? (
            <p className="px-3 py-3 font-ui text-[12px] text-ink-3" role="status">
              Records and client actions could not be loaded — pages still work. Close and reopen to retry.
            </p>
          ) : null}
        </div>
        <div className="hidden h-10 items-center gap-4 border-t border-line px-5 font-ui text-[11px] font-semibold text-ink-3 sm:flex" aria-hidden>
          <span className="flex items-center gap-1.5"><Key>↑</Key><Key>↓</Key> move</span>
          <span className="flex items-center gap-1.5"><Key>↵</Key> open</span>
          <span className="ml-auto flex items-center gap-1.5"><Key>esc</Key> close</span>
        </div>
      </Card>
    </div>,
    document.body
  )
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="grid h-5 min-w-5 place-items-center rounded-md border border-line px-1 font-ui text-[10.5px] font-semibold text-ink-3">
      {children}
    </kbd>
  )
}
