"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Activity,
  ArrowUpRight,
  CheckCheck,
  CheckCircle2,
  CornerDownLeft,
  FolderKanban,
  GitBranch,
  FlaskConical,
  ListChecks,
  LifeBuoy,
  Loader2,
  Monitor,
  NotebookText,
  Clock,
  Pause,
  Pin,
  PinOff,
  Play,
  Inbox,
  Receipt,
  Search,
  ServerCrash,
  SquareCode,
  Sparkles,
  X,
} from "lucide-react"
import { cn } from "@/lib/cn"
import {
  cursorHref,
  resumeHref,
  type LeftOffClient,
  type LeftOffNoteView,
  type LeftOffPayload,
  type NoteState,
} from "@/lib/leftoff"
import { ROUTES } from "@/lib/nav"
import { setTaskDone } from "@/lib/task-actions"
import {
  BAND_HINT,
  BAND_LABEL,
  BAND_OF_KIND,
  KIND_LABEL,
  WAITING_BANDS,
  bandCounts,
  type WaitingBand,
  type WaitingItem,
  type WaitingKind,
  type WaitingPayload,
  type WaitingSeverity,
} from "@/lib/waiting"
import { Card as TkCard } from "@/components/ui/Card"
import { WaitingStrip } from "@/components/dashboard/WaitingStrip"
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
 *
 * Three rules the layout is built on, and none of them survives being bent:
 *
 * 1. **Nothing scrolls sideways.** Three actionable lanes take the width;
 *    Working and Done today are 196px rails, because you cannot act on
 *    either. Every track is `minmax(0,…)` and every box inside is `min-w-0`,
 *    so a long branch name shrinks the card instead of setting a min-content
 *    floor that pushes the last lane off screen.
 * 2. **The card has a fixed anatomy** — chip row, title, one optional
 *    "Wants" line, one meta line. The prompt, the reply, the handoff and the
 *    agents live in the session peek. A card that grows with its content
 *    turns a lane into a wall.
 * 3. **Every noun is a link and every verb is one click.** The title opens
 *    the peek; the client, task and ticket chips go to the thing they name;
 *    Resume hands off to the Mac app; Cursor opens the workspace. Nothing
 *    here ends in "now paste this somewhere else".
 *
 * Three views, keys 1/2/3, because one board was being asked three questions
 * at once:
 *
 * - **Morning** — the whole queue in three bands ordered by what a row costs
 *   you, not where it came from. The one you open at 8am and try to empty.
 * - **Code** — the five lanes, asking what state each conversation is in.
 *   Repos have their own lane here; they are standing facts, and eighteen of
 *   them were drowning the two chats that had actually asked something.
 * - **Admin** — the same five-lane shape over the waiting queue, asking a
 *   different question: who is waiting, and how long have they been waiting.
 *   Deliberately NOT sharing lane names with Code. "Needs a yes" means a
 *   permission prompt for a chat and nothing at all for a support ticket.
 *
 * The admin and morning views add no queries. `loadWaiting()` already runs on
 * the dashboard for the strip below; the board takes its payload as a second
 * prop and re-cuts it. `lib/waiting.ts` owns which band a kind lands in.
 */

export const LEFTOFF_OPEN_EVENT = "tk:leftoff-open"

/**
 * The board's own deep links.
 *
 * Local rather than imported from `components/peek/PeekRouter`: that module
 * pulls in every peek card and, with them, the db — which cannot cross into a
 * client component.
 *
 * No `#leftoff` tail: the board maintains the hash itself (see below), so the
 * hrefs stay the plain thing every other peek link in the app already is.
 */
const sessionPeekHref = (sessionRef: string) => `/?peek=session:${encodeURIComponent(sessionRef)}`
const taskPeekHref = (taskId: string) => `/?peek=task:${encodeURIComponent(taskId)}`

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
  neutral: "border border-line bg-card",
}
const TONE_WELL: Record<LaneTone, string> = {
  bad: "bg-bad-soft border-transparent",
  warn: "bg-warn-soft border-transparent",
  ok: "bg-ok-soft border-transparent",
  neutral: "bg-well border-line",
}
const TONE_BORDER: Record<LaneTone, string> = {
  bad: "border-l-bad",
  warn: "border-l-warn",
  ok: "border-l-ok",
  neutral: "border-l-line-strong",
}

/** Repos are not a chat state; they get a lane of their own all the same. */
type LaneKey = NoteState | "repos"

type LaneConfig = {
  key: LaneKey
  label: string
  hint: string
  tone: LaneTone
  pulseDot?: boolean
  /** Working and Done today: a 196px column, so the card sheds its meta rows. */
  rail?: boolean
  /** Done today: finished. The only verb left is getting it off the board. */
  done?: boolean
  dashedWell?: boolean
  emptyIcon: IconType
  emptyTitle: string
  emptyBody: string
}

const CODE_LANES: LaneConfig[] = [
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
    key: "parked",
    label: "Parked",
    hint: "went quiet without finishing",
    tone: "neutral",
    emptyIcon: Pause,
    emptyTitle: "Nothing parked.",
    emptyBody: "A chat parks itself when it goes quiet without a Stop, or when you pin it for later.",
  },
  {
    // Eighteen of these were sitting in "Waiting on you" pretending to be
    // conversations. `buildPayload` already refuses to count them; now the
    // layout agrees with it.
    key: "repos",
    label: "Repos",
    hint: "uncommitted work, nobody asking",
    tone: "neutral",
    rail: true,
    emptyIcon: CheckCircle2,
    emptyTitle: "Every repo is clean.",
    emptyBody: "A working copy appears here when the sweep finds uncommitted work.",
  },
  {
    key: "working",
    label: "Working",
    hint: "mid-turn right now",
    tone: "ok",
    pulseDot: true,
    rail: true,
    emptyIcon: Loader2,
    emptyTitle: "Nothing running.",
    emptyBody: "A chat lands here the moment it starts a turn.",
  },
  {
    key: "gone",
    label: "Done today",
    hint: "fades after a day",
    tone: "neutral",
    rail: true,
    done: true,
    dashedWell: true,
    emptyIcon: CheckCircle2,
    emptyTitle: "Nothing finished yet.",
    emptyBody: "A chat that ends for good stays here for a day.",
  },
]

/**
 * The admin view's lanes.
 *
 * Not the same names as CODE_LANES, and that is the point of splitting them.
 * Every one of the eight waiting kinds appears in exactly one lane except
 * `blocked_chat`, which belongs to Code and would be counted twice here.
 */
type AdminLaneConfig = {
  label: string
  hint: string
  tone: LaneTone
  kinds: WaitingKind[]
  rail?: boolean
  emptyIcon: IconType
  emptyTitle: string
  emptyBody: string
}

const ADMIN_LANES: AdminLaneConfig[] = [
  {
    label: "Unanswered",
    hint: "a ticket nobody has replied to",
    tone: "bad",
    kinds: ["ticket_no_reply"],
    emptyIcon: CheckCheck,
    emptyTitle: "Every ticket has had a first reply.",
    emptyBody: "A ticket lands here when it has been open past its priority's reply window.",
  },
  {
    label: "Overdue",
    hint: "past a date you set",
    tone: "warn",
    kinds: ["overdue_task"],
    emptyIcon: CheckCircle2,
    emptyTitle: "Nothing is overdue.",
    emptyBody: "An open task appears here the day after its due date.",
  },
  {
    label: "Punch lists",
    hint: "filed work, and work whose test never ran",
    tone: "warn",
    kinds: ["punchlist_item", "untested_item"],
    emptyIcon: CheckCircle2,
    emptyTitle: "Every punch-list item is done and tested.",
    emptyBody: "Items appear here while they are open, and again if they ship untested.",
  },
  {
    label: "New",
    hint: "nobody has answered",
    tone: "warn",
    kinds: ["new_inquiry"],
    rail: true,
    emptyIcon: Inbox,
    emptyTitle: "No new enquiries.",
    emptyBody: "An enquiry sits here until somebody answers it.",
  },
  {
    label: "Uptime",
    hint: "a site a client pays for",
    tone: "ok",
    kinds: ["monitor_failing"],
    rail: true,
    emptyIcon: CheckCircle2,
    emptyTitle: "All monitors green.",
    emptyBody: "A monitor appears here on its first failed run.",
  },
  {
    label: "Unbilled",
    hint: "earned, not yet on a sheet",
    tone: "neutral",
    kinds: ["unbilled_session"],
    rail: true,
    emptyIcon: Receipt,
    emptyTitle: "Every session is billed.",
    emptyBody: "An agent session appears here once it has metered real hours.",
  },
]

const KIND_ICON: Record<WaitingKind, IconType> = {
  blocked_chat: Sparkles,
  monitor_failing: ServerCrash,
  ticket_no_reply: LifeBuoy,
  new_inquiry: Inbox,
  overdue_task: Clock,
  punchlist_item: ListChecks,
  untested_item: FlaskConical,
  unbilled_session: Receipt,
}

/** The queue's three words, mapped onto the board's four lane tones. */
const SEVERITY_TONE: Record<WaitingSeverity, LaneTone> = {
  hot: "bad",
  warn: "warn",
  quiet: "neutral",
}

type ViewKey = "morning" | "code" | "admin" | "queue"
/**
 * Queue sits last on purpose. It is the decision queue's own card strip,
 * moved off the dashboard — the same rows Morning bands, drawn the way the
 * strip drew them, with each row's verbs inline. Last position so the keys
 * for Code and Admin do not move under anyone's fingers.
 */
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: "morning", label: "Morning" },
  { key: "code", label: "Code" },
  { key: "admin", label: "Admin" },
  { key: "queue", label: "Queue" },
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

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tk-teal"
const GHOST_BTN =
  "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 font-ui text-[11px] font-bold text-tk-slate transition-colors duration-[120ms] hover:bg-well hover:text-tk-onyx " +
  FOCUS
const ICON_BTN =
  "grid size-[22px] shrink-0 place-items-center rounded-md text-ink-3 transition-colors duration-[120ms] hover:bg-well hover:text-tk-onyx " +
  FOCUS
const CHIP =
  "inline-flex h-[18px] shrink-0 items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-1.5 font-ui text-[10.5px] font-bold"
const REPLY_INPUT =
  "h-7 min-w-0 flex-1 rounded-lg border border-line bg-well px-2 text-[12px] text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal focus:bg-card"
const SEND_BTN =
  "h-7 shrink-0 rounded-lg bg-accent px-2.5 font-ui text-[11px] font-bold text-tk-linen hover:brightness-95"

export function LeftOffBoard({
  payload,
  waiting,
}: {
  payload: LeftOffPayload | null
  /** The strip's own payload, handed down rather than fetched again. */
  waiting: WaitingPayload | null
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ViewKey>("morning")
  const [query, setQuery] = useState("")
  const [clientFilter, setClientFilter] = useState<string>("all")
  const [selected, setSelected] = useState<string | null>(null)
  const [replyingRef, setReplyingRef] = useState<string | null>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const filterRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
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

  /**
   * `#leftoff` is re-asserted after every render rather than once on open,
   * because navigating to a peek drops it and this component never unmounts to
   * notice. Cheap: a string compare, and a write only when it differs.
   *
   * `history.state` is passed through rather than the `null` this shipped with:
   * the App Router keeps its own router tree in the history entry's state, and
   * handing it null throws that away. Defensive, not a fix for anything
   * observed — navigation was measured working either way.
   */
  useEffect(() => {
    if (!open || window.location.hash === "#leftoff") return
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}#leftoff`
    )
  })

  // Open-state side effects, undone together on close: the scroll lock and
  // where focus returns to. (Esc lives with the rest of the keyboard map
  // below — it has to lose to an open reply field and a focused filter.)
  useEffect(() => {
    if (!open) return
    const previouslyFocused = openerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const raf = requestAnimationFrame(() => closeBtnRef.current?.focus())
    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = previousOverflow
      if (window.location.hash === "#leftoff") {
        // Router state preserved here too — same reason as the effect above.
        window.history.replaceState(
          window.history.state,
          "",
          window.location.pathname + window.location.search
        )
      }
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [open])

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
    const map: Record<LaneKey, LeftOffNoteView[]> = {
      blocked: [], waiting: [], working: [], parked: [], gone: [], repos: [],
    }
    // A repo row is stored `waiting` because the sweep has nothing better to
    // say, but nothing is waiting on you — it goes to its own lane.
    for (const n of filtered) {
      if (n.surface === "repo") map.repos.push(n)
      else map[n.state]?.push(n)
    }
    return map
  }, [filtered])

  /* ------------------------------------------------------- the other half */

  const adminItems = useMemo(
    () => (waiting?.items ?? []).filter((i) => BAND_OF_KIND[i.kind] !== "standing" && i.kind !== "blocked_chat"),
    [waiting]
  )

  /** The queue split by band, and the leftoff rows that are standing facts. */
  const bands = useMemo(() => {
    const map: Record<WaitingBand, WaitingItem[]> = { answer: [], decide: [], standing: [] }
    for (const item of waiting?.items ?? []) map[BAND_OF_KIND[item.kind]].push(item)
    return map
  }, [waiting])

  const standing = useMemo(() => {
    const repos = byLane.repos
    const parked = byLane.parked.filter((n) => n.surface !== "repo")
    const working = byLane.working
    return { repos, parked, working, total: repos.length + parked.length + working.length }
  }, [byLane])

  const counts = useMemo(() => (waiting ? bandCounts(waiting.counts) : null), [waiting])

  /** Everything admin that qualified — not the capped list the queue hands out. */
  const adminTotal = useMemo(
    () =>
      waiting
        ? ADMIN_LANES.reduce((n, lane) => n + lane.kinds.reduce((m, k) => m + waiting.counts[k], 0), 0)
        : 0,
    [waiting]
  )

  /* ------------------------------------------------------------- keyboard */

  // One ref per lane, in lane order, so ←/→ can hold your row position and
  // skip the lanes a filter emptied. Morning is one column, so ←/→ is a
  // no-op there rather than a special case further down.
  const lanesOf = useMemo(() => {
    if (view === "code") return CODE_LANES.map((lane) => byLane[lane.key].map((n) => n.sessionRef))
    if (view === "admin") {
      return ADMIN_LANES.map((lane) =>
        adminItems.filter((i) => lane.kinds.includes(i.kind)).map((i) => i.id)
      )
    }
    if (view === "morning") return [[...bands.answer, ...bands.decide].map((i) => i.id)]
    return []
  }, [view, byLane, adminItems, bands])
  const order = useMemo(() => lanesOf.flat(), [lanesOf])

  const select = useCallback((ref: string | null) => {
    setSelected(ref)
    if (!ref) return
    requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>(`[data-ref="${CSS.escape(ref)}"]`)
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: "nearest" })
    })
  }, [])

  // Where the cursor was, so a dismiss lands on the row that moved up rather
  // than throwing you back to the top of the board.
  const lastIndex = useRef(0)
  useEffect(() => {
    if (!selected) return
    const i = order.indexOf(selected)
    if (i >= 0) {
      lastIndex.current = i
      return
    }
    setSelected(order[Math.min(lastIndex.current, order.length - 1)] ?? null)
  }, [order, selected])

  useEffect(() => {
    if (!open) return

    /** Fire a control inside the selected card by its `data-act` name. */
    const act = (name: string) => {
      if (!selected) return
      const card = bodyRef.current?.querySelector<HTMLElement>(`[data-ref="${CSS.escape(selected)}"]`)
      const node = card?.querySelector<HTMLElement>(`[data-act="${name}"]`)
      if (node instanceof HTMLFormElement) node.requestSubmit()
      else node?.click()
    }

    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)

      // Esc unwinds one layer at a time: the reply field, then the filter,
      // then the board. Closing the board out from under a half-typed reply
      // is how you lose the reply.
      if (event.key === "Escape") {
        event.preventDefault()
        if (replyingRef) {
          const ref = replyingRef
          setReplyingRef(null)
          select(ref)
          return
        }
        if (typing) {
          target?.blur()
          return
        }
        closeBoard()
        return
      }

      if (typing || event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === "/") {
        event.preventDefault()
        filterRef.current?.focus()
        filterRef.current?.select()
        return
      }

      const lane = selected ? lanesOf.findIndex((l) => l.includes(selected)) : -1
      const row = lane >= 0 ? lanesOf[lane].indexOf(selected as string) : -1

      const step = (delta: number) => {
        if (lane < 0) return select(order[0] ?? null)
        const column = lanesOf[lane]
        select(column[Math.min(Math.max(row + delta, 0), column.length - 1)] ?? null)
      }
      const laneStep = (delta: number) => {
        if (lane < 0) return select(order[0] ?? null)
        for (let i = lane + delta; i >= 0 && i < lanesOf.length; i += delta) {
          if (lanesOf[i].length) return select(lanesOf[i][Math.min(row, lanesOf[i].length - 1)])
        }
      }

      switch (event.key) {
        case "j":
        case "ArrowDown":
          event.preventDefault()
          return step(1)
        case "k":
        case "ArrowUp":
          event.preventDefault()
          return step(-1)
        case "h":
        case "ArrowLeft":
          event.preventDefault()
          return laneStep(-1)
        case "l":
        case "ArrowRight":
          event.preventDefault()
          return laneStep(1)
        case "Enter":
          if (!selected) return
          event.preventDefault()
          return act("peek")
        case "o":
          return act("resume")
        case "c":
          return act("cursor")
        case "t":
          return act("task")
        case "i":
          return act("ticket")
        case "p":
          return act("pin")
        case "x":
          return act("dismiss")
        case "r": {
          if (!selected) return
          event.preventDefault()
          setReplyingRef(selected)
          return
        }
        default:
          if (/^[1-4]$/.test(event.key)) {
            event.preventDefault()
            setView(VIEWS[Number(event.key) - 1].key)
            setSelected(null)
          }
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, selected, replyingRef, lanesOf, order, select, closeBoard])

  if (!open) return null

  const tabCount = payload?.browser ? payload.browser.windows.reduce((sum, w) => sum + w.tabs.length, 0) : 0

  return (
    <div className="fixed inset-0 z-[70]">
      <div
        aria-hidden
        onClick={closeBoard}
        className="absolute inset-0 bg-scrim backdrop-blur-sm motion-safe:animate-[tk-fade-in_.18s_ease-out]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Content-sized rather than inset-stretched, and `grid-cols-[minmax(0,1fr)]`
        // so the single implicit column cannot size to the header's min-content
        // and push the last lane past the right edge.
        className="absolute left-1/2 top-1/2 grid max-h-[calc(100%-1rem)] w-[min(1360px,calc(100%-1rem))] -translate-x-1/2 -translate-y-1/2 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[14px] border border-line bg-canvas shadow-overlay motion-safe:animate-[tk-modal-in_.2s_ease-out] sm:max-h-[calc(100%-2rem)] sm:w-[min(1360px,calc(100%-2rem))] sm:rounded-[18px]"
      >
        {/* -------------------------------------------------------- header */}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-card px-3 py-2.5 md:min-w-0 md:flex-nowrap md:overflow-hidden md:px-5 md:py-3 md:[&>*]:shrink-0">
          {payload && payload.counts.blocked > 0 ? (
            <span aria-hidden className="order-1 size-2.5 rounded-full bg-bad motion-safe:animate-pulse md:order-none" />
          ) : null}
          <div className="order-2 flex min-w-0 flex-1 items-baseline gap-2 md:order-none md:flex-none">
            <h2
              id={titleId}
              className="whitespace-nowrap font-display text-[17px] font-semibold leading-tight tracking-tight text-tk-onyx"
            >
              Where I left off
            </h2>
            <p className="hidden truncate text-[11.5px] text-ink-3 2xl:block">
              Claude Code · Cursor · Chrome — snapshot {payload ? agoFrom(payload.generatedAt) : "unavailable"}
            </p>
          </div>

          <div
            role="group"
            aria-label="View"
            className="order-4 flex w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-line bg-well p-0.5 [scrollbar-width:none] md:order-none md:ml-3 md:w-auto md:overflow-visible [&::-webkit-scrollbar]:hidden"
          >
            {VIEWS.map((v, i) => {
              const n =
                v.key === "code"
                  ? byLane.waiting.length
                  : v.key === "admin"
                    ? adminTotal
                    : v.key === "queue"
                      ? (waiting?.total ?? 0)
                      : (counts?.answer ?? 0) + (counts?.decide ?? 0)
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  aria-pressed={view === v.key}
                  className={cn(
                    "flex h-6 items-center gap-1.5 whitespace-nowrap rounded-md px-2 font-ui text-[11px] font-bold transition-colors",
                    view === v.key ? "bg-card text-tk-onyx shadow-card" : "text-ink-3 hover:text-tk-onyx",
                    FOCUS
                  )}
                >
                  <span className="text-[8.5px] opacity-50">{i + 1}</span>
                  {v.label}
                  {/* The badge counts what is YOUR TURN, which is why Code
                      reads 2 and not 22 — the repo lane is not your turn. */}
                  {n > 0 ? (
                    <span
                      className={cn(
                        "grid h-[15px] min-w-[15px] place-items-center rounded-full px-1 text-[9px] font-extrabold tabular-nums",
                        v.key === "code" ? "bg-well text-tk-slate" : "bg-bad-soft text-bad"
                      )}
                    >
                      {n}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="hidden md:ml-auto md:block" />

          <label className="relative order-5 flex h-7 flex-1 items-center md:order-none md:w-40 md:flex-none xl:w-52">
            <Search aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3" />
            <input
              ref={filterRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter…"
              aria-label="Filter the board"
              className={cn(
                "h-7 w-full rounded-lg border border-line bg-well py-0 pl-8 pr-2 text-[12px] text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal focus:bg-card",
                FOCUS
              )}
            />
          </label>

          {clients.list.length > 0 ? (
            <TkCard
              surface="well"
              radius="lg"
              elevation="none"
              // Shrinkable and scrollable: seven clients must not be able to
              // widen the header past the dialog.
              className="hidden min-w-0 shrink items-center gap-0.5 overflow-x-auto p-0.5 [scrollbar-width:none] md:flex [&::-webkit-scrollbar]:hidden"
              role="group"
              aria-label="Filter by client"
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
            </TkCard>
          ) : null}

          <p className="hidden items-center gap-1 whitespace-nowrap text-[10.5px] text-ink-3 2xl:flex">
            <Key>j</Key>
            <Key>k</Key> move · <Key>↵</Key> peek · <Key>o</Key> resume · <Key>x</Key> dismiss
          </p>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={closeBoard}
            aria-label="Close the board"
            className={cn(
              "order-3 flex h-7 items-center gap-1.5 rounded-lg border border-line bg-card pl-2 pr-1.5 text-ink-3 transition-colors duration-[120ms] hover:bg-well hover:text-tk-onyx md:order-none",
              FOCUS
            )}
          >
            <X className="size-3.5" aria-hidden />
            <Key>esc</Key>
          </button>
        </header>

        {/* ---------------------------------------------------------- body */}
        {view === "queue" ? (
          <div ref={bodyRef} className="min-h-0 overflow-y-auto px-3 pb-3 md:px-5 md:pb-4">
            <WaitingStrip payload={waiting} />
          </div>
        ) : view === "morning" ? (
          <div ref={bodyRef} className="min-h-0 overflow-y-auto">
            <Bands
              bands={bands}
              counts={counts}
              standing={standing}
              browser={payload?.browser ?? null}
              selected={selected}
              onSelect={select}
              missing={!waiting}
            />
          </div>
        ) : view === "admin" ? (
          <div
            ref={bodyRef}
            className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 py-3 md:grid md:grid-cols-[repeat(3,minmax(0,1fr))_repeat(3,minmax(0,164px))] md:overflow-hidden md:px-5 md:py-4"
          >
            {ADMIN_LANES.map((lane) => (
              <AdminLane
                key={lane.label}
                lane={lane}
                items={adminItems.filter((i) => lane.kinds.includes(i.kind))}
                total={waiting ? lane.kinds.reduce((n, k) => n + waiting.counts[k], 0) : 0}
                selected={selected}
                onSelect={select}
              />
            ))}
          </div>
        ) : payload ? (
          <div
            ref={bodyRef}
            // Three lanes take the width; the three read-only ones are rails.
            // Every track is minmax(0,…) so the grid shrinks instead of
            // scrolling — the whole point of the layout.
            className="flex min-h-0 flex-col gap-3 overflow-y-auto px-3 py-3 md:grid md:grid-cols-[repeat(3,minmax(0,1fr))_repeat(3,minmax(0,164px))] md:overflow-hidden md:px-5 md:py-4"
          >
            {CODE_LANES.map((lane) => (
              <Lane
                key={lane.key}
                lane={lane}
                notes={byLane[lane.key]}
                selected={selected}
                onSelect={select}
                replyingRef={replyingRef}
                onReplyToggle={setReplyingRef}
              />
            ))}
          </div>
        ) : (
          <div className="grid min-h-0 place-items-center px-5 py-10">
            <p className="max-w-sm text-center text-[13px] text-ink-3">
              Nothing reported yet — chats appear here as they report in.
            </p>
          </div>
        )}

        {/* -------------------------------------------------------- footer */}
        <footer className="flex items-center gap-2 border-t border-line bg-card px-5 py-2">
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold text-tk-onyx">
            <Monitor className="size-3.5 text-ink-3" aria-hidden />
            Chrome
          </span>
          {payload?.browser ? (
            <>
              <p className="shrink-0 whitespace-nowrap text-[11px] text-ink-3">
                {payload.browser.windows.length} {payload.browser.windows.length === 1 ? "window" : "windows"} ·{" "}
                {tabCount} {tabCount === 1 ? "tab" : "tabs"} · {agoFrom(payload.browser.capturedAt)}
              </p>
              <div className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {payload.browser.windows.flatMap((w, i) =>
                  w.tabs.map((t, ti) =>
                    // The url was always on the tab; it was rendered into a
                    // title attribute and thrown away.
                    t.url ? (
                      <a
                        key={`${i}-${ti}`}
                        href={t.url}
                        target="_blank"
                        rel="noreferrer"
                        title={t.title || t.url}
                        className={cn(
                          "inline-flex h-[22px] max-w-[190px] shrink-0 items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-md border bg-well px-2 text-[11px] transition-colors hover:text-tk-onyx",
                          t.active ? "border-tk-teal text-tk-onyx" : "border-line text-ink-3 hover:border-line-strong",
                          FOCUS
                        )}
                      >
                        {t.title || t.url}
                      </a>
                    ) : null
                  )
                )}
              </div>
            </>
          ) : (
            <p className="text-[11px] text-ink-3">No Chrome snapshot yet.</p>
          )}
        </footer>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- header parts */

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line px-1 font-ui text-[9.5px] font-bold leading-[1.5] text-ink-3">
      {children}
    </kbd>
  )
}

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
        "h-6 shrink-0 whitespace-nowrap rounded-md px-2 font-ui text-[11px] font-semibold transition-colors",
        active ? "bg-card text-tk-onyx shadow-card" : color ? "tk-client-ink" : "text-ink-3 hover:text-tk-onyx",
        FOCUS
      )}
    >
      {children}
    </button>
  )
}

/* -------------------------------------------------------------------- lane */

function Lane({
  lane,
  notes,
  selected,
  onSelect,
  replyingRef,
  onReplyToggle,
}: {
  lane: LaneConfig
  notes: LeftOffNoteView[]
  selected: string | null
  onSelect: (ref: string) => void
  replyingRef: string | null
  onReplyToggle: (ref: string | null) => void
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className="grid min-w-0 shrink-0 grid-rows-[auto_auto] gap-2 md:min-h-0 md:grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex min-w-0 items-center gap-2 px-0.5">
        <span
          aria-hidden
          className={cn(
            "size-[7px] shrink-0 rounded-full",
            TONE_DOT[lane.tone],
            lane.pulseDot && "motion-safe:animate-pulse"
          )}
        />
        <h3 id={headingId} className="truncate font-ui text-[12px] font-extrabold tracking-tight text-tk-onyx">
          {lane.label}
        </h3>
        <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full border border-line bg-well px-1.5 font-ui text-[10.5px] font-extrabold tabular-nums text-tk-onyx">
          {notes.length}
        </span>
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-2 rounded-[14px] border p-2 md:min-h-[132px] md:overflow-y-auto [&>*]:min-w-0",
          notes.length === 0 && "hidden md:flex",
          TONE_WELL[lane.tone],
          lane.dashedWell && "border-dashed bg-transparent"
        )}
      >
        {notes.length === 0 ? (
          <LaneEmpty lane={lane} />
        ) : (
          notes.map((n) => (
            <NoteCard
              key={n.sessionRef}
              note={n}
              lane={lane}
              selected={selected === n.sessionRef}
              onSelect={onSelect}
              replying={replyingRef === n.sessionRef}
              onReplyToggle={onReplyToggle}
            />
          ))
        )}
      </div>
    </section>
  )
}

function LaneEmpty({ lane }: { lane: Pick<LaneConfig, "emptyIcon" | "emptyTitle" | "emptyBody"> }) {
  const Icon = lane.emptyIcon
  return (
    <div className="m-auto hidden justify-items-center gap-1 px-3 py-6 text-center md:grid">
      <Icon className="mb-0.5 size-4 text-ink-3" aria-hidden />
      <p className="font-ui text-[12px] font-bold text-tk-onyx">{lane.emptyTitle}</p>
      <p className="max-w-[30ch] text-[11px] leading-relaxed text-ink-3">{lane.emptyBody}</p>
    </div>
  )
}

/* -------------------------------------------------------------------- card */

function NoteCard({
  note,
  lane,
  selected,
  onSelect,
  replying,
  onReplyToggle,
}: {
  note: LeftOffNoteView
  lane: LaneConfig
  selected: boolean
  onSelect: (ref: string) => void
  replying: boolean
  onReplyToggle: (ref: string | null) => void
}) {
  const SurfaceIcon = SURFACE_ICON[note.surface] ?? NotebookText
  const surfaceLabel = SURFACE_LABEL[note.surface] ?? note.surface
  const showBranch = note.branch && note.branch !== "main"
  const rail = !!lane.rail
  const done = !!lane.done

  const dismiss = dismissLeftOffAction.bind(null, note.sessionRef)
  const pin = pinLeftOffAction.bind(null, note.sessionRef, !note.pinned)
  const reply = replyLeftOffAction.bind(null, note.sessionRef)
  const toTask = convertLeftOffAction.bind(null, note.sessionRef, "task")
  const toTicket = convertLeftOffAction.bind(null, note.sessionRef, "ticket")

  const resume = note.resumeCommand ? resumeHref(note.sessionRef) : ""
  const cursor = note.cwd ? cursorHref(note.cwd) : ""
  const canReply = !done && note.surface !== "manual"

  const meta = !rail && (note.project || showBranch || note.agents || note.taskId || note.ticketNumber)

  return (
    <TkCard
      as="article"
      radius="xl"
      elevation="card"
      interactive
      data-ref={note.sessionRef}
      tabIndex={-1}
      onFocus={() => onSelect(note.sessionRef)}
      onClick={() => onSelect(note.sessionRef)}
      className={cn(
        "group relative grid min-w-0 shrink-0 gap-1 overflow-hidden border-l-[3px] px-3 py-2 outline-none",
        TONE_BORDER[lane.tone],
        selected && "border-tk-teal ring-2 ring-accent-soft"
      )}
    >
      {/* 1 — chips. `min-w-0` on every child or a long client name sets a floor. */}
      <div className="flex min-w-0 items-center gap-1.5 font-ui text-[10.5px] font-semibold text-ink-3 [&>*]:min-w-0">
        {note.client ? (
          <Link
            href={ROUTES.client(note.client.slug)}
            style={{ "--c": note.client.color } as React.CSSProperties}
            className={cn(CHIP, "tk-client-tint tk-client-ink hover:underline", FOCUS)}
          >
            {note.client.name}
          </Link>
        ) : (
          <span className={cn(CHIP, "bg-well text-tk-onyx")}>House</span>
        )}
        {rail ? null : (
          <span className="inline-flex shrink-0 items-center gap-1">
            <SurfaceIcon className="size-3" aria-hidden />
            {surfaceLabel}
          </span>
        )}
        {note.pinned ? <Pin aria-label="Pinned" className="size-3 shrink-0 text-tk-teal" /> : null}
        <span className="ml-auto shrink-0 tabular-nums">{note.ago}</span>
      </div>

      {/* 2 — the title, and the one link the whole card is about. */}
      <Link
        href={sessionPeekHref(note.sessionRef)}
        data-act="peek"
        className={cn(
          "line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-tk-onyx [overflow-wrap:anywhere] hover:underline hover:underline-offset-2",
          rail && "text-[11.5px]",
          FOCUS
        )}
      >
        {note.title}
      </Link>

      {/* 3 — what a blocked chat is stuck on. One line; the peek has the rest. */}
      {!rail && note.state === "blocked" && note.blockedOn ? (
        <p className="min-w-0 truncate text-[11.5px] font-medium text-bad">Wants: {note.blockedOn}</p>
      ) : null}

      {/* 4 — one meta line. Everything in it shrinks; the chips go last. */}
      {meta ? (
        <div className="flex min-h-[15px] min-w-0 items-center gap-2 text-[10.5px] text-ink-3 [&>*]:min-w-0 [&>*]:shrink">
          {note.project ? (
            <span className="inline-flex items-center gap-1 truncate">
              <FolderKanban className="size-3 shrink-0" aria-hidden />
              {note.project}
            </span>
          ) : null}
          {showBranch ? (
            <span className="inline-flex items-center gap-1 truncate">
              <GitBranch className="size-3 shrink-0" aria-hidden />
              {note.branch}
            </span>
          ) : null}
          {note.agents ? (
            <span className="inline-flex items-center gap-1 truncate">
              <Activity className="size-3 shrink-0" aria-hidden />
              {note.agents.running} {note.agents.running === 1 ? "agent" : "agents"}
            </span>
          ) : null}
          {note.taskId ? (
            <Link href={taskPeekHref(note.taskId)} className={cn(CHIP, "bg-well text-tk-onyx hover:underline", FOCUS)}>
              → task
            </Link>
          ) : null}
          {note.ticketNumber ? (
            <Link
              href={`${ROUTES.support}/${encodeURIComponent(note.ticketNumber)}`}
              className={cn(CHIP, "bg-well text-tk-onyx hover:underline", FOCUS)}
            >
              → {note.ticketNumber}
            </Link>
          ) : null}
        </div>
      ) : null}

      {note.pendingReply && !rail ? (
        <p className="flex min-w-0 items-center gap-1 text-[11px] text-tk-teal">
          <CornerDownLeft className="size-3 shrink-0" aria-hidden />
          <span className="shrink-0">Queued:</span>
          <span className="truncate text-tk-onyx">{note.pendingReply}</span>
        </p>
      ) : null}

      {/* The reply field is collapsed by default — it was the single biggest
          contributor to a card's height, on every card, whether or not you
          were replying. `r` and the rail's reply button open it. */}
      {replying && canReply ? (
        <form action={reply} className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <input
            name="text"
            type="text"
            autoFocus
            placeholder={note.state === "working" ? "Queue for its next turn…" : "Reply…"}
            aria-label={`Reply to ${note.title}`}
            className={REPLY_INPUT}
          />
          <button type="submit" className={SEND_BTN}>
            Send
          </button>
        </form>
      ) : null}

      {/* The verbs. Laid over the card's bottom-right on hover, focus or
          selection, so a lane at rest is titles and nothing else. Bottom
          rather than top: it covers the tail of the meta line, which
          truncates anyway, instead of the client chip and the age. */}
      <div
        className={cn(
          "absolute bottom-1.5 right-1.5 flex items-center gap-px rounded-md bg-card p-0.5 opacity-0 shadow-[0_0_0_1px_var(--line)] transition-opacity duration-[120ms]",
          "pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
          selected && "pointer-events-auto opacity-100",
          rail && "bottom-auto top-1.5"
        )}
      >
        {resume && !done ? (
          <a href={resume} data-act="resume" title="Resume — Terminal and Cursor (o)" className={ICON_BTN}>
            <Play className="size-3" aria-hidden />
            <span className="sr-only">Resume {note.title}</span>
          </a>
        ) : null}
        {cursor && !done ? (
          <a href={cursor} data-act="cursor" title="Open the workspace in Cursor (c)" className={ICON_BTN}>
            <SquareCode className="size-3" aria-hidden />
            <span className="sr-only">Open {note.title} in Cursor</span>
          </a>
        ) : null}
        {canReply ? (
          <button
            type="button"
            data-act="reply"
            onClick={() => onReplyToggle(replying ? null : note.sessionRef)}
            title="Reply (r)"
            className={cn(ICON_BTN, replying && "text-tk-teal")}
          >
            <CornerDownLeft className="size-3" aria-hidden />
            <span className="sr-only">Reply to {note.title}</span>
          </button>
        ) : null}
        {!done && !note.taskId ? (
          <form action={toTask} data-act="task">
            <button type="submit" title="Turn into a task (t)" className={ICON_BTN}>
              <ListChecks className="size-3" aria-hidden />
              <span className="sr-only">Turn {note.title} into a task</span>
            </button>
          </form>
        ) : null}
        {!done && !note.ticketId ? (
          <form action={toTicket} data-act="ticket">
            <button type="submit" title="Turn into a ticket (i)" className={ICON_BTN}>
              <LifeBuoy className="size-3" aria-hidden />
              <span className="sr-only">Turn {note.title} into a ticket</span>
            </button>
          </form>
        ) : null}
        {!done ? (
          <form action={pin} data-act="pin">
            <button type="submit" title={note.pinned ? "Unpin (p)" : "Pin (p)"} className={ICON_BTN}>
              {note.pinned ? <PinOff className="size-3" /> : <Pin className="size-3" />}
              <span className="sr-only">{note.pinned ? "Unpin" : "Pin"} {note.title}</span>
            </button>
          </form>
        ) : null}
        <form action={dismiss} data-act="dismiss">
          <button type="submit" title="Dismiss (x)" className={ICON_BTN}>
            <X className="size-3" />
            <span className="sr-only">Dismiss {note.title}</span>
          </button>
        </form>
      </div>
    </TkCard>
  )
}

/* ------------------------------------------------------------- admin lane */

function AdminLane({
  lane,
  items,
  total,
  selected,
  onSelect,
}: {
  lane: AdminLaneConfig
  items: WaitingItem[]
  /** Everything that qualified, cap or no cap — `items` is only what fitted. */
  total: number
  selected: string | null
  onSelect: (ref: string) => void
}) {
  const headingId = useId()
  const hidden = Math.max(total - items.length, 0)
  return (
    <section aria-labelledby={headingId} className="grid min-w-0 shrink-0 grid-rows-[auto_auto] gap-2 md:min-h-0 md:grid-rows-[auto_minmax(0,1fr)]">
      <div className="flex min-w-0 items-center gap-2 px-0.5">
        <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full", TONE_DOT[lane.tone])} />
        <h3 id={headingId} className="truncate font-ui text-[12px] font-extrabold tracking-tight text-tk-onyx">
          {lane.label}
        </h3>
        <span className="grid h-[18px] min-w-[18px] shrink-0 place-items-center rounded-full border border-line bg-well px-1.5 font-ui text-[10.5px] font-extrabold tabular-nums text-tk-onyx">
          {total}
        </span>
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-col gap-2 rounded-[14px] border p-2 md:min-h-[132px] md:overflow-y-auto [&>*]:min-w-0",
          items.length === 0 && "hidden md:flex",
          TONE_WELL[lane.tone]
        )}
      >
        {items.length === 0 && total > 0 ? (
          // The lane qualified rows but the queue's 24-row cap was spent on
          // higher-ranked kinds. Drawing "all clear" here would be a lie.
          <p className="m-auto max-w-[26ch] px-3 text-center text-[11.5px] leading-relaxed text-ink-3">
            {total} waiting, none shown — the queue hands out 24 rows at a time and they went to hotter lanes.
          </p>
        ) : items.length === 0 ? (
          <LaneEmpty lane={lane} />
        ) : (
          <>
            {items.map((item) => (
              <WaitingCard
                key={item.id}
                item={item}
                rail={!!lane.rail}
                selected={selected === item.id}
                onSelect={onSelect}
              />
            ))}
            {/* The queue hands out 24 rows and reports the truth separately,
                so a lane can say "+9 more" instead of believing the cap. */}
            {hidden > 0 ? <p className="px-1 pt-0.5 text-[10.5px] text-ink-3">+{hidden} not shown</p> : null}
          </>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------- admin card */

function WaitingCard({
  item,
  rail,
  selected,
  onSelect,
}: {
  item: WaitingItem
  rail: boolean
  selected: boolean
  onSelect: (ref: string) => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const Icon = KIND_ICON[item.kind]
  const tone = SEVERITY_TONE[item.severity]
  const complete = item.verbs.find((v) => v.id === "complete")

  // Optimistic, the same bargain the strip makes: a queue you work top to
  // bottom cannot make you wait for a round trip before the next row moves up.
  function tick() {
    if (!complete) return
    setDone(true)
    startTransition(async () => {
      const result = await setTaskDone(complete.ref, true)
      if (!result.ok) setDone(false)
      else router.refresh()
    })
  }
  if (done) return null

  return (
    <TkCard
      as="article"
      radius="xl"
      elevation="card"
      interactive
      data-ref={item.id}
      tabIndex={-1}
      onFocus={() => onSelect(item.id)}
      onClick={() => onSelect(item.id)}
      className={cn(
        "group relative grid min-w-0 shrink-0 gap-1 overflow-hidden border-l-[3px] px-3 py-2 outline-none",
        TONE_BORDER[tone],
        selected && "border-tk-teal ring-2 ring-accent-soft"
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 font-ui text-[10.5px] font-semibold text-ink-3 [&>*]:min-w-0">
        <span
          style={item.color ? ({ "--c": item.color } as React.CSSProperties) : undefined}
          className={cn(CHIP, item.client ? "tk-client-tint tk-client-ink" : "bg-well text-tk-onyx")}
        >
          {item.client || "House"}
        </span>
        {rail ? null : (
          <span className="inline-flex shrink-0 items-center gap-1">
            <Icon className="size-3" aria-hidden />
            {KIND_LABEL[item.kind]}
          </span>
        )}
        <span className="ml-auto shrink-0 tabular-nums">{item.ageLabel}</span>
      </div>

      <Link
        href={item.href}
        data-act="peek"
        className={cn(
          "line-clamp-2 text-[13px] font-semibold leading-snug tracking-tight text-tk-onyx [overflow-wrap:anywhere] hover:underline hover:underline-offset-2",
          rail && "text-[11.5px]",
          FOCUS
        )}
      >
        {item.title}
      </Link>

      {!rail && item.subtitle ? (
        <p className="line-clamp-2 text-[10.5px] leading-snug text-ink-3">{item.subtitle}</p>
      ) : null}

      {complete ? (
        <div
          className={cn(
            "absolute bottom-1.5 right-1.5 flex items-center gap-px rounded-md bg-card p-0.5 opacity-0 shadow-[0_0_0_1px_var(--line)] transition-opacity duration-[120ms]",
            "pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
            selected && "pointer-events-auto opacity-100"
          )}
        >
          <button type="button" data-act="complete" onClick={tick} title="Mark done (x)" className={ICON_BTN}>
            <CheckCircle2 className="size-3" aria-hidden />
            <span className="sr-only">Mark {item.title} done</span>
          </button>
        </div>
      ) : null}
    </TkCard>
  )
}

/* ----------------------------------------------------------------- bands */

function Bands({
  bands,
  counts,
  standing,
  browser,
  selected,
  onSelect,
  missing,
}: {
  bands: Record<WaitingBand, WaitingItem[]>
  counts: Record<WaitingBand, number> | null
  standing: { repos: LeftOffNoteView[]; parked: LeftOffNoteView[]; working: LeftOffNoteView[]; total: number }
  browser: LeftOffPayload["browser"]
  selected: string | null
  onSelect: (ref: string) => void
  missing: boolean
}) {
  if (missing) {
    return (
      <p className="px-5 py-10 text-center text-[13px] text-ink-3">
        The waiting queue could not be read. Code and Admin are unaffected.
      </p>
    )
  }
  return (
    <div>
      {(["answer", "decide"] as const).map((band) => (
        <section key={band}>
          <BandHead band={band} n={counts?.[band] ?? bands[band].length} />
          {bands[band].length === 0 ? (
            <p className="border-b border-line bg-card px-5 py-4 text-[12.5px] text-ink-3">
              Nothing to {band === "answer" ? "answer" : "decide"}.
            </p>
          ) : (
            <>
              {bands[band].map((item) => (
                <BandRow key={item.id} item={item} selected={selected === item.id} onSelect={onSelect} />
              ))}
              {(counts?.[band] ?? 0) > bands[band].length ? (
                <p className="border-b border-line bg-card px-5 py-2 text-[11px] text-ink-3">
                  +{(counts?.[band] ?? 0) - bands[band].length} more — the queue hands out 24 rows at a time
                </p>
              ) : null}
            </>
          )}
        </section>
      ))}

      <section>
        <BandHead band="standing" n={standing.total} />
        <Fold label={`${standing.repos.length} repos with uncommitted work`} detail={standing.repos.slice(0, 4).map((r) => r.title).join(" · ")} />
        <Fold label={`${standing.parked.length} chats parked`} detail="went quiet without finishing" />
        <Fold label={`${standing.working.length} chats working`} detail={standing.working[0]?.title ?? "nothing mid-turn"} />
        {browser ? (
          <Fold
            label={`${browser.windows.length} ${browser.windows.length === 1 ? "window" : "windows"}`}
            detail={`${browser.windows.reduce((n, w) => n + w.tabs.length, 0)} tabs · captured ${agoFrom(browser.capturedAt)}`}
          />
        ) : null}
      </section>
    </div>
  )
}

function BandHead({ band, n }: { band: WaitingBand; n: number }) {
  return (
    <div className="flex items-baseline gap-2.5 border-b border-line bg-canvas px-5 py-2">
      <h3 className="font-ui text-[12px] font-extrabold tracking-tight text-tk-onyx">{BAND_LABEL[band]}</h3>
      <p className="min-w-0 truncate text-[11px] text-ink-3">{BAND_HINT[band]}</p>
      <span className="ml-auto shrink-0 font-ui text-[10.5px] font-extrabold tabular-nums text-ink-3">{n}</span>
    </div>
  )
}

function BandRow({
  item,
  selected,
  onSelect,
}: {
  item: WaitingItem
  selected: boolean
  onSelect: (ref: string) => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const tone = SEVERITY_TONE[item.severity]
  const complete = item.verbs.find((v) => v.id === "complete")
  const Icon = KIND_ICON[item.kind]

  function tick() {
    if (!complete) return
    setDone(true)
    startTransition(async () => {
      const result = await setTaskDone(complete.ref, true)
      if (!result.ok) setDone(false)
      else router.refresh()
    })
  }
  if (done) return null

  return (
    <div
      data-ref={item.id}
      tabIndex={-1}
      onFocus={() => onSelect(item.id)}
      onClick={() => onSelect(item.id)}
      className={cn(
        "grid min-w-0 grid-cols-[3px_auto_minmax(0,1fr)_auto_auto] items-center gap-2.5 border-b border-line bg-card pr-5 outline-none",
        selected && "bg-well"
      )}
    >
      <span
        aria-hidden
        className={cn("h-full", tone === "bad" ? "bg-bad" : tone === "warn" ? "bg-warn" : "bg-transparent")}
      />
      <span
        style={item.color ? ({ "--c": item.color } as React.CSSProperties) : undefined}
        className={cn(CHIP, "my-1.5", item.client ? "tk-client-tint tk-client-ink" : "bg-well text-tk-onyx")}
      >
        <Icon className="size-3" aria-hidden />
        {item.client || KIND_LABEL[item.kind]}
      </span>
      <Link
        href={item.href}
        data-act="peek"
        className={cn("min-w-0 truncate py-1.5 text-[12.5px] text-tk-onyx hover:underline", FOCUS)}
      >
        {item.title}
        {item.subtitle ? <span className="ml-1.5 text-ink-3">· {item.subtitle}</span> : null}
      </Link>
      <span className="shrink-0 whitespace-nowrap text-[10.5px] tabular-nums text-ink-3">{item.ageLabel}</span>
      {complete ? (
        <button type="button" data-act="complete" onClick={tick} className={cn(GHOST_BTN, "my-1")}>
          <CheckCircle2 className="size-3" aria-hidden />
          Done
        </button>
      ) : (
        <Link href={item.href} data-act="open" className={cn(GHOST_BTN, "my-1")}>
          <ArrowUpRight className="size-3" aria-hidden />
          Open
        </Link>
      )}
    </div>
  )
}

function Fold({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-2.5 border-b border-line bg-card px-5 py-2.5 text-[12px]">
      <span className="shrink-0 font-semibold text-tk-onyx">{label}</span>
      <span className="min-w-0 truncate text-ink-3">{detail}</span>
    </div>
  )
}
