"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Activity,
  ArrowUpRight,
  CheckCheck,
  CheckCircle2,
  CornerDownLeft,
  FolderKanban,
  GitBranch,
  ListChecks,
  LifeBuoy,
  Loader2,
  Monitor,
  NotebookText,
  Pause,
  Pin,
  PinOff,
  Play,
  Search,
  Sparkles,
  X,
} from "lucide-react"
import { cn } from "@/lib/cn"
import { type LeftOffClient, type LeftOffNoteView, type LeftOffPayload, type NoteState } from "@/lib/leftoff"
import {
  convertLeftOffAction,
  dismissLeftOffAction,
  pinLeftOffAction,
  replyLeftOffAction,
} from "@/lib/leftoff-actions"

/**
 * The full-screen "Where I left off" board — every Claude Code / Cursor
 * chat, plus a Chrome tab snapshot, in five lanes ordered the way you should
 * look at them. Opened from a header button (elsewhere) via the custom event
 * below, or by landing on `#leftoff` directly; both are just ways of saying
 * "show the board," so a bookmark and a click behave the same.
 *
 * The board owns no data of its own — `payload` is the same shape the old
 * dashboard band read, refreshed by the page's own revalidation after a
 * server action runs. This component only opens, filters and lays it out.
 */

export const LEFTOFF_OPEN_EVENT = "tk:leftoff-open"

type LaneTone = "bad" | "warn" | "ok" | "neutral"
type IconType = typeof Sparkles

const SURFACE_ICON: Record<string, IconType> = {
  claude: Sparkles,
  cursor: Monitor,
  manual: NotebookText,
  agent: Activity,
}
const SURFACE_LABEL: Record<string, string> = {
  claude: "Claude",
  cursor: "Cursor",
  manual: "Note",
  agent: "Agent",
}

const TONE_DOT: Record<LaneTone, string> = {
  bad: "bg-bad",
  warn: "bg-warn",
  ok: "bg-ok",
  neutral: "border border-tk-slate/15 bg-white",
}
const TONE_WELL: Record<LaneTone, string> = {
  bad: "bg-bad/10",
  warn: "bg-warn/10",
  ok: "bg-ok/10",
  neutral: "bg-tk-linen",
}
const TONE_BORDER: Record<LaneTone, string> = {
  bad: "border-l-bad",
  warn: "border-l-warn",
  ok: "border-l-ok",
  neutral: "border-l-tk-slate/15",
}

type LaneConfig = {
  key: NoteState
  label: string
  hint: string
  tone: LaneTone
  pulseDot?: boolean
  compact?: boolean
  dashedWell?: boolean
  emptyIcon: IconType
  emptyTitle: string
  emptyBody: string
}

const LANES: LaneConfig[] = [
  {
    key: "blocked",
    label: "Needs a yes",
    hint: "stopped on a permission prompt",
    tone: "bad",
    emptyIcon: CheckCircle2,
    emptyTitle: "Nothing needs a yes.",
    emptyBody: "A chat lands here the moment it hits a permission prompt and stops for you.",
  },
  {
    key: "waiting",
    label: "Waiting on you",
    hint: "finished a turn, asked something",
    tone: "warn",
    emptyIcon: CheckCheck,
    emptyTitle: "Nothing waiting on a reply.",
    emptyBody: "A chat lands here when it stops and asks you something. Notes you leave yourself live here too.",
  },
  {
    key: "working",
    label: "Working",
    hint: "mid-turn right now",
    tone: "ok",
    pulseDot: true,
    emptyIcon: Loader2,
    emptyTitle: "Nothing running right now.",
    emptyBody: "A chat lands here the moment it starts a turn, and leaves the moment it Stops.",
  },
  {
    key: "parked",
    label: "Parked",
    hint: "went quiet without finishing",
    tone: "neutral",
    emptyIcon: Pause,
    emptyTitle: "Nothing parked.",
    emptyBody: "A chat parks itself when it goes quiet without a Stop, or when you pin it for later.",
  },
  {
    key: "gone",
    label: "Done today",
    hint: "fades after a day",
    tone: "neutral",
    compact: true,
    dashedWell: true,
    emptyIcon: CheckCircle2,
    emptyTitle: "Nothing finished yet today.",
    emptyBody: "A chat that ends its turn for good stays here for a day, then fades on its own.",
  },
]

/** "2m ago" / "3h ago" / "1d ago" from an ISO timestamp — display only, no live tick. */
function agoFrom(iso: string) {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.max(0, Math.round(ms / 60_000))
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const ICON_BTN =
  "rounded-md p-1.5 text-tk-slate/70 hover:bg-tk-linen hover:text-tk-onyx focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tk-teal"
const GHOST_BTN =
  "h-7 whitespace-nowrap rounded-md px-2 font-ui text-[11.5px] font-semibold text-tk-slate hover:bg-tk-linen hover:text-tk-onyx focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tk-teal"
const REPLY_INPUT =
  "h-8 min-w-0 flex-1 rounded-lg border border-tk-slate/15 bg-tk-linen px-2.5 text-[12.5px] text-tk-onyx placeholder:text-tk-slate focus:border-tk-teal focus:bg-white focus:outline-none"
const SEND_BTN = "h-8 shrink-0 rounded-lg bg-tk-teal px-3 font-ui text-xs font-semibold text-tk-linen hover:brightness-95"

export function LeftOffBoard({ payload }: { payload: LeftOffPayload | null }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [clientFilter, setClientFilter] = useState<string>("all")
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const openerRef = useRef<Element | null>(null)
  const titleId = useId()

  const openBoard = useCallback(() => {
    openerRef.current = document.activeElement
    setOpen(true)
  }, [])
  const closeBoard = useCallback(() => setOpen(false), [])

  // Three ways in: already on #leftoff at mount, a same-page hash change to
  // it (e.g. a Link elsewhere on the page), or the custom event a header
  // button dispatches instead of importing this component directly.
  useEffect(() => {
    if (window.location.hash === "#leftoff") openBoard()
    const onCustom = () => openBoard()
    const onHash = () => {
      if (window.location.hash === "#leftoff") openBoard()
    }
    window.addEventListener(LEFTOFF_OPEN_EVENT, onCustom)
    window.addEventListener("hashchange", onHash)
    return () => {
      window.removeEventListener(LEFTOFF_OPEN_EVENT, onCustom)
      window.removeEventListener("hashchange", onHash)
    }
  }, [openBoard])

  // Open-state side effects, undone together on close: the hash, the scroll
  // lock, the Esc key and where focus returns to.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = openerRef.current
    if (window.location.hash !== "#leftoff") {
      window.history.replaceState(null, "", "#leftoff")
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const raf = requestAnimationFrame(() => closeBtnRef.current?.focus())
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") closeBoard()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = previousOverflow
      if (window.location.hash === "#leftoff") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search)
      }
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [open, closeBoard])

  const notes = useMemo(() => payload?.notes ?? [], [payload])

  const clients = useMemo(() => {
    const seen = new Map<string, LeftOffClient>()
    let hasHouse = false
    for (const n of notes) {
      if (n.client) {
        if (!seen.has(n.client.slug)) seen.set(n.client.slug, n.client)
      } else {
        hasHouse = true
      }
    }
    return { list: Array.from(seen.values()), hasHouse }
  }, [notes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return notes.filter((n) => {
      if (clientFilter === "house" && n.client) return false
      if (clientFilter !== "all" && clientFilter !== "house" && n.client?.slug !== clientFilter) return false
      if (!q) return true
      const hay = `${n.title} ${n.project} ${n.client?.name ?? ""}`.toLowerCase()
      return hay.includes(q)
    })
  }, [notes, query, clientFilter])

  const byLane = useMemo(() => {
    const map: Record<NoteState, LeftOffNoteView[]> = {
      blocked: [],
      waiting: [],
      working: [],
      parked: [],
      gone: [],
    }
    for (const n of filtered) map[n.state]?.push(n)
    return map
  }, [filtered])

  if (!open) return null

  const tabCount = payload?.browser ? payload.browser.windows.reduce((sum, w) => sum + w.tabs.length, 0) : 0

  return (
    <div className="fixed inset-0 z-[70]">
      <div
        aria-hidden
        onClick={closeBoard}
        className="absolute inset-0 bg-tk-onyx/55 backdrop-blur-sm motion-safe:animate-[tk-fade-in_.18s_ease-out]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-[18px] grid grid-rows-[auto_1fr_auto] overflow-hidden rounded-[20px] border border-tk-slate/15 bg-canvas shadow-2xl motion-safe:animate-[tk-modal-in_.2s_ease-out]"
      >
        {/* -------------------------------------------------------- header */}
        <header className="flex flex-wrap items-center gap-4 border-b border-tk-slate/10 bg-white px-6 py-4">
          <div className="flex items-center gap-3">
            {payload && payload.counts.blocked > 0 ? (
              <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-bad motion-safe:animate-pulse" />
            ) : null}
            <div>
              <h2 id={titleId} className="font-display text-[21px] font-semibold leading-tight tracking-tight text-tk-onyx">
                Where I left off
              </h2>
              <p className="mt-0.5 text-[12.5px] text-tk-slate/70">
                Every Claude Code and Cursor chat, plus Chrome · snapshot{" "}
                {payload ? agoFrom(payload.generatedAt) : "unavailable"}
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="relative flex h-8 w-64 max-w-full items-center">
              <Search aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-tk-slate/70" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by title, project, client…"
                aria-label="Filter the board"
                className="h-8 w-full rounded-lg border border-tk-slate/15 bg-tk-linen py-0 pl-8 pr-2.5 text-[12.5px] text-tk-onyx placeholder:text-tk-slate focus:border-tk-teal focus:bg-white focus:outline-none"
              />
            </label>

            {clients.list.length > 0 ? (
              <div
                role="group"
                aria-label="Filter by client"
                className="flex items-center gap-0.5 rounded-lg border border-tk-slate/15 bg-tk-linen p-0.5"
              >
                <ClientFilterButton active={clientFilter === "all"} onClick={() => setClientFilter("all")}>
                  All
                </ClientFilterButton>
                {clients.hasHouse ? (
                  <ClientFilterButton active={clientFilter === "house"} onClick={() => setClientFilter("house")}>
                    House
                  </ClientFilterButton>
                ) : null}
                {clients.list.map((c) => (
                  <ClientFilterButton
                    key={c.slug}
                    active={clientFilter === c.slug}
                    color={c.color}
                    onClick={() => setClientFilter(c.slug)}
                  >
                    {c.name}
                  </ClientFilterButton>
                ))}
              </div>
            ) : null}

            <button
              ref={closeBtnRef}
              type="button"
              onClick={closeBoard}
              aria-label="Close the board"
              className="flex h-8 items-center gap-2 rounded-lg border border-tk-slate/15 bg-white pl-2.5 pr-2 text-tk-slate/70 hover:bg-tk-linen hover:text-tk-onyx focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tk-teal"
            >
              <X className="size-4" aria-hidden />
              <kbd className="rounded border border-tk-slate/15 px-1 font-ui text-[10px] font-semibold text-tk-slate/70">
                esc
              </kbd>
            </button>
          </div>
        </header>

        {/* ---------------------------------------------------------- body */}
        {payload ? (
          <div className="grid min-h-0 auto-cols-[minmax(300px,1fr)] grid-flow-col gap-3.5 overflow-x-auto px-6 py-4">
            {LANES.map((lane) => (
              <Lane key={lane.key} lane={lane} notes={byLane[lane.key]} />
            ))}
          </div>
        ) : (
          <div className="grid min-h-0 place-items-center px-6 py-4">
            <p className="max-w-sm text-center text-[13px] text-tk-slate/70">
              Nothing reported yet — chats appear here as they report in.
            </p>
          </div>
        )}

        {/* -------------------------------------------------------- footer */}
        <footer className="flex flex-wrap items-center gap-3 border-t border-tk-slate/10 bg-white px-6 py-3">
          <div className="flex items-center gap-2 text-[12px] font-semibold text-tk-onyx">
            <Monitor className="size-4 text-tk-slate/70" aria-hidden />
            Chrome
          </div>
          {payload?.browser ? (
            <>
              <p className="text-[12px] text-tk-slate/70">
                {payload.browser.windows.length} {payload.browser.windows.length === 1 ? "window" : "windows"} ·{" "}
                {tabCount} {tabCount === 1 ? "tab" : "tabs"} · captured {agoFrom(payload.browser.capturedAt)}
              </p>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {payload.browser.windows.map((w, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-1.5 rounded-lg border border-tk-slate/15 bg-tk-linen px-2.5 py-1.5"
                  >
                    <span className="mr-0.5 font-ui text-[10px] font-bold uppercase tracking-[0.06em] text-tk-slate/70">
                      {w.title || `Window ${i + 1}`}
                    </span>
                    {w.tabs.slice(0, 4).map((t, ti) => (
                      <span
                        key={ti}
                        title={t.title || t.url}
                        className={cn(
                          "max-w-[220px] truncate rounded-md border bg-white px-2 py-0.5 text-[11px]",
                          t.active ? "border-tk-teal text-tk-onyx" : "border-tk-slate/15 text-tk-slate/70"
                        )}
                      >
                        {t.title || t.url}
                      </span>
                    ))}
                    {w.tabs.length > 4 ? (
                      <span className="text-[11px] text-tk-slate/70">+{w.tabs.length - 4}</span>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[12px] text-tk-slate/70">No Chrome snapshot yet.</p>
          )}
        </footer>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- header parts */

function ClientFilterButton({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean
  color?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={color ? ({ "--c": color } as React.CSSProperties) : undefined}
      className={cn(
        "h-7 whitespace-nowrap rounded-md px-2.5 font-ui text-[11.5px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tk-teal",
        active ? "bg-white text-tk-onyx shadow-card" : color ? "tk-client-ink" : "text-tk-slate/70 hover:text-tk-onyx"
      )}
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------- lane */

function Lane({ lane, notes }: { lane: LaneConfig; notes: LeftOffNoteView[] }) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="grid min-h-0 grid-rows-[auto_1fr] gap-2">
      <div className="px-0.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className={cn(
              "size-2.5 shrink-0 rounded-full",
              TONE_DOT[lane.tone],
              lane.pulseDot && "motion-safe:animate-pulse"
            )}
          />
          <h3 id={headingId} className="font-ui text-[13px] font-bold text-tk-onyx">
            {lane.label}
          </h3>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-tk-linen px-1.5 font-ui text-[11px] font-bold tabular-nums text-tk-onyx">
            {notes.length}
          </span>
        </div>
        <p className="mt-0.5 truncate pl-[18px] text-[11px] text-tk-slate/70">{lane.hint}</p>
      </div>
      <div
        className={cn(
          "grid min-h-[180px] content-start gap-2.5 overflow-y-auto rounded-2xl border p-2.5",
          TONE_WELL[lane.tone],
          lane.dashedWell ? "border-dashed border-tk-slate/15" : "border-transparent"
        )}
      >
        {notes.length === 0 ? <LaneEmpty lane={lane} /> : notes.map((n) => <Card key={n.sessionRef} note={n} tone={lane.tone} compact={!!lane.compact} />)}
      </div>
    </section>
  )
}

function LaneEmpty({ lane }: { lane: LaneConfig }) {
  const Icon = lane.emptyIcon
  return (
    <div className="grid justify-items-center gap-1.5 self-center px-4 py-8 text-center">
      <Icon className="mb-1 size-[18px] text-tk-slate/70" aria-hidden />
      <p className="font-ui text-[13px] font-bold text-tk-onyx">{lane.emptyTitle}</p>
      <p className="max-w-[32ch] text-[12px] leading-relaxed text-tk-slate/70">{lane.emptyBody}</p>
    </div>
  )
}

/* -------------------------------------------------------------------- card */

function Card({ note, tone, compact }: { note: LeftOffNoteView; tone: LaneTone; compact: boolean }) {
  const [copied, setCopied] = useState<"resume" | "open" | null>(null)
  const SurfaceIcon = SURFACE_ICON[note.surface] ?? NotebookText
  const surfaceLabel = SURFACE_LABEL[note.surface] ?? note.surface
  const showBranch = note.branch && note.branch !== "main"

  const dismiss = dismissLeftOffAction.bind(null, note.sessionRef)
  const pin = pinLeftOffAction.bind(null, note.sessionRef, !note.pinned)
  const reply = replyLeftOffAction.bind(null, note.sessionRef)
  const toTask = convertLeftOffAction.bind(null, note.sessionRef, "task")
  const toTicket = convertLeftOffAction.bind(null, note.sessionRef, "ticket")

  async function copy(text: string, which: "resume" | "open") {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(which)
      window.setTimeout(() => setCopied((c) => (c === which ? null : c)), 1500)
    } catch {
      // Clipboard permission denied — there is nothing useful to fall back to.
    }
  }

  const canReply = !compact && note.surface !== "manual" && note.state !== "gone"

  return (
    <article
      className={cn(
        "grid gap-1.5 rounded-xl border border-l-[3px] border-tk-slate/15 bg-white p-3 shadow-card",
        TONE_BORDER[tone],
        compact && "opacity-80"
      )}
    >
      <div className="flex items-center gap-1.5 font-ui text-[11px] font-semibold text-tk-slate/70">
        <span
          style={note.client ? ({ "--c": note.client.color } as React.CSSProperties) : undefined}
          className={cn(
            "inline-flex h-5 items-center rounded-md px-1.5",
            note.client ? "tk-client-tint tk-client-ink" : "bg-tk-linen text-tk-onyx"
          )}
        >
          {note.client ? note.client.name : "House"}
        </span>
        <span className="inline-flex items-center gap-1">
          <SurfaceIcon className="size-3" aria-hidden />
          {surfaceLabel}
        </span>
        <span className="ml-auto shrink-0 tabular-nums">{note.ago}</span>
      </div>

      <p className="flex items-start gap-1 text-[13.5px] font-semibold leading-snug text-tk-onyx">
        {note.pinned ? <Pin aria-label="Pinned" className="mt-0.5 size-3 shrink-0 text-tk-teal" /> : null}
        <span>{note.title}</span>
      </p>

      {note.project || showBranch ? (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-tk-slate/70">
          {note.project ? (
            <span className="inline-flex items-center gap-1">
              <FolderKanban className="size-3" aria-hidden />
              {note.project}
            </span>
          ) : null}
          {showBranch ? (
            <span className="inline-flex items-center gap-1">
              <GitBranch className="size-3" aria-hidden />
              {note.branch}
            </span>
          ) : null}
        </p>
      ) : null}

      {!compact && note.state === "blocked" && note.blockedOn ? (
        <p className="text-[12.5px] font-medium text-bad">Wants: {note.blockedOn}</p>
      ) : null}

      {!compact && note.lastPrompt ? (
        <p className="line-clamp-2 text-[12.5px] leading-snug text-tk-onyx">
          <span className="mr-1 font-ui text-[10px] font-bold uppercase tracking-[0.06em] text-tk-slate/70">You</span>
          {note.lastPrompt}
        </p>
      ) : null}

      {!compact && note.state === "working" && note.lastReply ? (
        <p className="line-clamp-2 text-[12.5px] leading-snug text-tk-onyx">
          <span className="mr-1 font-ui text-[10px] font-bold uppercase tracking-[0.06em] text-tk-slate/70">Claude</span>
          {note.lastReply}
        </p>
      ) : null}

      {!compact && note.agents ? (
        <p className="flex flex-wrap items-center gap-1 text-[11px] font-semibold text-tk-slate/70">
          <Activity className="size-3" aria-hidden />
          {note.agents.running} {note.agents.running === 1 ? "agent" : "agents"}
          {note.agents.types.length ? ` (${note.agents.types.join(", ")})` : ""}
        </p>
      ) : null}

      {!compact && note.pendingReply ? (
        <p className="flex min-w-0 items-center gap-1.5 text-[12px] text-tk-teal">
          <CornerDownLeft className="size-3 shrink-0" aria-hidden />
          <span className="shrink-0">Reply queued:</span>
          <span className="truncate text-tk-onyx">{note.pendingReply}</span>
        </p>
      ) : null}

      {canReply ? (
        <form action={reply} className="mt-0.5 flex items-center gap-1.5">
          <input
            name="text"
            type="text"
            placeholder={note.state === "working" ? "Queue a reply for its next turn…" : "Reply — delivered on its next turn…"}
            aria-label={`Reply to ${note.title}`}
            className={REPLY_INPUT}
          />
          <button type="submit" className={SEND_BTN}>
            Send
          </button>
        </form>
      ) : null}

      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {note.resumeCommand ? (
          <button type="button" onClick={() => copy(note.resumeCommand, "resume")} className={GHOST_BTN}>
            <span className="inline-flex items-center gap-1">
              <Play className="size-3" aria-hidden />
              {copied === "resume" ? "Copied" : "Resume"}
            </span>
          </button>
        ) : note.surface === "cursor" && note.openPath ? (
          <button type="button" onClick={() => copy(note.openPath, "open")} className={GHOST_BTN}>
            <span className="inline-flex items-center gap-1">
              <ArrowUpRight className="size-3" aria-hidden />
              {copied === "open" ? "Copied" : "Open workspace"}
            </span>
          </button>
        ) : null}

        {!compact ? (
          note.taskId ? (
            <span className="inline-flex h-6 items-center rounded-md bg-tk-linen px-2 font-ui text-[11px] font-semibold text-tk-onyx">
              → task
            </span>
          ) : (
            <form action={toTask}>
              <button type="submit" className={GHOST_BTN}>
                <span className="inline-flex items-center gap-1">
                  <ListChecks className="size-3" aria-hidden />
                  Task
                </span>
              </button>
            </form>
          )
        ) : null}

        {!compact ? (
          note.ticketId ? (
            <span className="inline-flex h-6 items-center rounded-md bg-tk-linen px-2 font-ui text-[11px] font-semibold text-tk-onyx">
              → ticket
            </span>
          ) : (
            <form action={toTicket}>
              <button type="submit" className={GHOST_BTN}>
                <span className="inline-flex items-center gap-1">
                  <LifeBuoy className="size-3" aria-hidden />
                  Ticket
                </span>
              </button>
            </form>
          )
        ) : null}

        <span className="grow" />

        {!compact ? (
          <form action={pin}>
            <button type="submit" aria-label={note.pinned ? "Unpin" : "Pin"} title={note.pinned ? "Unpin" : "Pin"} className={ICON_BTN}>
              {note.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            </button>
          </form>
        ) : null}
        <form action={dismiss}>
          <button type="submit" aria-label="Dismiss" title="Dismiss" className={ICON_BTN}>
            <X className="size-3.5" />
          </button>
        </form>
      </div>
    </article>
  )
}
