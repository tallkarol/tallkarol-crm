"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"
import { ArrowLeft, ArrowUpRight, ChevronDown, ChevronRight, Globe, MessageSquare, Play, Search, Square } from "lucide-react"
import { useRunningClock } from "@/components/timesheet/RunningClockProvider"
import { clockLabel, useElapsed } from "@/components/timesheet/useElapsed"
import { cn } from "@/lib/cn"
import type { ClientPanelData, ClientShell, PanelMonitor } from "@/lib/client-rooms"
import { markColor } from "@/lib/client-colors"
import { CLIENT_ROOMS, ROUTES, clientRoomOf } from "@/lib/nav"
import { navIcon } from "@/lib/nav-icons"
import { startPunch, stopPunch } from "@/lib/punch-actions"
import { announcePunchChange } from "@/lib/punch-signal"
import { DESK_OPEN_EVENT } from "@/lib/chat/desk-context"

/**
 * The dock panel in client mode: the switcher, the clock card, this client's
 * rooms, a Portal link, the client-manager desk, All clients, and at the very
 * bottom the client's systems as a dot-and-name list.
 */
export function ClientPanel({ client, data }: { client: ClientShell; data: ClientPanelData }) {
  const pathname = usePathname()
  const room = clientRoomOf(pathname)
  return (
    <aside
      aria-label={`${client.name} panel`}
      data-chrome="sidebar"
      className="hidden w-[236px] shrink-0 flex-col gap-2.5 border-r border-rail-line bg-rail-2 px-3 py-4 rail:flex"
    >
      <Switcher client={client} roster={data.roster} />
      <ClockCard client={client} />

      <ul className="flex flex-col gap-0.5">
        {CLIENT_ROOMS.map((r) => {
          const active = r.id === room
          const Icon = navIcon(r.icon)
          const badge =
            r.id === "inbox" && data.badges.inbox > 0
              ? { n: data.badges.inbox, tone: data.badges.inboxHot ? "bad" : "lead" }
              : r.id === "monitors" && data.badges.monitors > 0
                ? { n: data.badges.monitors, tone: "bad" }
                : r.id === "board" && data.badges.board > 0
                  ? { n: data.badges.board, tone: "lead" }
                  : null
          return (
            <li key={r.id}>
              <Link
                href={ROUTES.clientRoom(client.slug, r.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 font-ui text-[13px] leading-[19px] transition-colors",
                  active ? "bg-[--rail-active] font-semibold text-white" : "text-rail-ink-2 hover:bg-rail-hover hover:text-rail-ink"
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon aria-hidden className={cn("size-4 shrink-0", active ? "text-[--rail-active-icon]" : "text-rail-ink/50")} strokeWidth={active ? 2.25 : 2} />
                  <span className="truncate">{r.label}</span>
                </span>
                {badge ? (
                  <span
                    className={cn(
                      "grid h-[18px] min-w-5 place-items-center rounded-full px-1.5 font-ui text-[10.5px] font-bold text-tk-linen",
                      badge.tone === "bad" ? "bg-tk-tomato" : "bg-accent"
                    )}
                  >
                    {badge.n > 99 ? "99+" : badge.n}
                  </span>
                ) : null}
              </Link>
            </li>
          )
        })}
        <li>
          <a
            href={`/api/portal/preview?client=${encodeURIComponent(client.id)}`}
            target="_blank"
            rel="noreferrer"
            title={`Open the client portal as ${client.name} (preview) in a new tab`}
            className="flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-1.5 font-ui text-[13px] leading-[19px] text-rail-ink-2 transition-colors hover:bg-rail-hover hover:text-rail-ink"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <Globe aria-hidden className="size-4 shrink-0 text-rail-ink/50" />
              <span className="truncate">Portal</span>
            </span>
            <ArrowUpRight aria-hidden className="size-3 text-rail-ink/40" />
          </a>
        </li>
      </ul>

      <p className="px-2.5 pt-1.5 font-ui text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-rail-ink-3">Desks</p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent(DESK_OPEN_EVENT))}
        className="flex w-full items-center gap-2.5 rounded-[10px] border border-dashed border-rail-line px-2.5 py-[7px] text-left font-ui text-xs text-rail-ink-2 hover:bg-rail-hover hover:text-rail-ink"
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-full border border-rail-line bg-rail font-ui text-[9px] font-extrabold text-[--rail-active-icon]">CM</span>
        <span className="flex-1">Client manager</span>
        <MessageSquare aria-hidden className="size-3.5 text-rail-ink/50" />
      </button>

      <div className="mt-auto flex flex-col gap-0.5">
        <Link
          href={ROUTES.clients}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 font-ui text-[13px] leading-[19px] text-rail-ink-2 hover:bg-rail-hover hover:text-rail-ink"
        >
          <ArrowLeft aria-hidden className="size-4 text-rail-ink/50" />
          All clients
        </Link>
        <MonitorDots client={client} monitors={data.monitors} />
      </div>
    </aside>
  )
}

function Switcher({ client, roster }: { client: ClientShell; roster: ClientPanelData["roster"] }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    document.addEventListener("mousedown", onClick)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onClick)
    }
  }, [])

  const rows = roster.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()))
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2.5 rounded-xl border border-rail-line bg-rail-ink/[0.05] px-2 py-2 text-left hover:bg-rail-ink/[0.09]"
      >
        <span className="grid size-[30px] shrink-0 place-items-center rounded-[9px] font-ui text-[11px] font-extrabold text-white" style={{ backgroundColor: markColor(client.color) }}>
          {client.short}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[13.5px] font-bold leading-tight text-rail-ink">{client.name}</span>
          <span className="block truncate text-[10.5px] text-rail-ink-3">{client.statusLabel} · ⌘⇧C to switch</span>
        </span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-rail-ink-3" />
      </button>
      {open ? (
        <div role="listbox" className="absolute inset-x-0 top-[calc(100%+6px)] z-30 rounded-xl border border-line bg-card p-1.5 text-tk-onyx shadow-overlay">
          <label className="mb-1 flex items-center gap-1.5 border-b border-line px-2 py-1.5 text-xs text-ink-3">
            <Search className="size-3.5" aria-hidden />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Jump to a client…"
              aria-label="Jump to a client"
              className="min-w-0 flex-1 bg-transparent font-ui text-xs text-tk-onyx placeholder:text-ink-3 focus:outline-none"
            />
          </label>
          <ul className="max-h-72 overflow-y-auto">
            {rows.map((r) => (
              <li key={r.slug}>
                <Link
                  href={ROUTES.client(r.slug)}
                  role="option"
                  aria-selected={r.slug === client.slug}
                  onClick={() => setOpen(false)}
                  className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 font-ui text-xs font-semibold hover:bg-well", r.slug === client.slug && "bg-well")}
                >
                  <span className="grid size-[22px] shrink-0 place-items-center rounded-md font-ui text-[9px] font-extrabold text-white" style={{ backgroundColor: markColor(r.color) }}>
                    {r.short}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="flex gap-1">
                    {r.hot ? <span aria-label="tickets waiting" className="size-1.5 rounded-full bg-bad" /> : null}
                    {r.warn ? <span aria-label="overdue tasks" className="size-1.5 rounded-full bg-warn" /> : null}
                  </span>
                </Link>
              </li>
            ))}
            {rows.length === 0 ? <li className="px-2 py-2 text-xs text-ink-3">No client matches</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Clock in on this client, or the running punch. Reads the same context the
 * floating clock and the Time panel do — no poll of its own.
 */
function ClockCard({ client }: { client: ClientShell }) {
  const { running } = useRunningClock()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const punch = running.find((p) => p.clientId === client.id) ?? null
  const elsewhere = !punch && running.length > 0 ? running[0] : null

  return (
    <div className={cn("flex items-center gap-2.5 rounded-xl px-3 py-2.5 ring-1 ring-inset", punch ? "bg-[--rail-active] ring-rail-line" : "bg-rail-ink/[0.04] ring-rail-line")}>
      <div className="min-w-0 flex-1">
        <div className="font-display text-xl font-bold leading-none tabular-nums text-rail-ink">{punch ? <Elapsed punch={punch} /> : "—"}</div>
        <div className="mt-1 truncate text-[10.5px] text-rail-ink-3">
          {punch ? `Clock running · ${client.name}` : elsewhere ? `Running on ${elsewhere.clientName} · switch here` : `Clock in on ${client.name}`}
        </div>
        {error ? <p role="status" className="mt-1 text-[10.5px] font-medium text-rail-ink/85">{error}</p> : null}
      </div>
      <button
        type="button"
        disabled={busy}
        aria-label={punch ? `Clock out of ${client.name}` : `Clock in on ${client.name}`}
        onClick={() => {
          setError(null)
          start(async () => {
            const result = punch
              ? await stopPunch({ punchId: punch.id })
              : await startPunch({ clientId: client.id, switchRunning: true })
            if (!result.ok) setError(result.error)
            else announcePunchChange()
          })
        }}
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-lg disabled:opacity-50",
          punch ? "bg-rail-ink/10 text-rail-ink hover:bg-rail-ink/[0.15]" : "bg-accent text-tk-linen hover:brightness-110"
        )}
      >
        {punch ? <Square className="size-3" aria-hidden /> : <Play className="size-3" aria-hidden />}
      </button>
    </div>
  )
}

function Elapsed({ punch }: { punch: { startedAt: string; minutes: number } }) {
  const seconds = useElapsed(punch.startedAt, punch.minutes)
  return <>{clockLabel(seconds)}</>
}

const DOT: Record<PanelMonitor["tone"], string> = {
  good: "bg-[--rail-active-icon]",
  warn: "bg-[--rail-warn]",
  bad: "bg-tk-tomato shadow-[0_0_0_3px_rgb(183_42_15_/_0.25)]",
  mute: "bg-rail-ink/25",
}

function MonitorDots({ client, monitors }: { client: ClientShell; monitors: PanelMonitor[] }) {
  if (monitors.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-col border-t border-rail-line pt-2">
      <Link
        href={ROUTES.clientRoom(client.slug, "monitors")}
        className="flex items-center gap-1 px-2.5 pb-1.5 pt-1 font-ui text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-rail-ink-3 hover:text-rail-ink-2"
      >
        Monitors
        <ChevronRight aria-hidden className="size-3" />
      </Link>
      {monitors.map((m) => (
        <Link
          key={m.id}
          href={m.href}
          title="Open in Monitors"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-[5px] font-ui text-[12.5px] font-medium text-rail-ink-2 hover:bg-rail-hover hover:text-rail-ink"
        >
          <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", DOT[m.tone])} />
          <span className="truncate">{m.label}</span>
        </Link>
      ))}
    </div>
  )
}
