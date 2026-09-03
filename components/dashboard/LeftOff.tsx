import Link from "next/link"
import { CornerDownLeft, ListChecks, LifeBuoy, Pin, PinOff, Search, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { STATE_LABEL, type LeftOffNoteView, type LeftOffPayload, type NoteState } from "@/lib/leftoff"
import {
  convertLeftOffAction,
  dismissLeftOffAction,
  pinLeftOffAction,
  replyLeftOffAction,
} from "@/lib/leftoff-actions"

/**
 * "Where did I leave things?" — one band under the dashboard header, grouped
 * by client because that is how the day gets switched between, and inside a
 * client in the order you should look: blocked on a yes, parked, waiting on
 * you, still working. Every row is the chat's own last exchange, untouched —
 * or, when the chat ended its turn with a Done / Blocked on / Next post-it,
 * that post-it. A row from an agent lane (purser, caretaker…) is the agent's
 * own report, waiting on a pick.
 *
 * The row acts: a reply typed here is delivered by that chat's own hooks at
 * its next turn; a parked thread you will not get back to becomes a task or
 * a ticket carrying its resume command. The band is absent when there is
 * nothing to show — it is a reminder, not a fixture.
 */

const CHIP: Record<NoteState, string> = {
  blocked: "text-[#A62228] bg-[#A62228]/[0.07] ring-[#A62228]/25",
  parked: "text-[#8A5A05] bg-[#8A5A05]/[0.07] ring-[#8A5A05]/25",
  waiting: "text-tk-teal bg-tk-teal/[0.06] ring-tk-teal/25",
  working: "text-tk-slate bg-tk-linen ring-tk-slate/15",
  gone: "text-tk-slate/50 bg-transparent ring-tk-slate/15",
}

const SURFACE_LABEL: Record<string, string> = {
  claude: "Claude",
  cursor: "Cursor",
  manual: "Note",
  agent: "Agent",
}

const ICON_BTN =
  "rounded-md p-1 text-tk-slate/60 hover:bg-tk-linen hover:text-tk-onyx focus-visible:outline focus-visible:outline-2 focus-visible:outline-tk-teal"

function countsLine(counts: LeftOffPayload["counts"]) {
  const parts: string[] = []
  if (counts.blocked) parts.push(`${counts.blocked} blocked`)
  if (counts.parked) parts.push(`${counts.parked} parked`)
  if (counts.waiting) parts.push(`${counts.waiting} waiting`)
  if (counts.working) parts.push(`${counts.working} working`)
  return parts.join(" · ")
}

/** The handoff's lead line: what it is blocked on, else what comes next. */
function handoffLead(n: LeftOffNoteView) {
  const h = n.handoff
  if (!h) return null
  if (h.blocked) return { label: "Blocked on", text: h.blocked, warn: true }
  if (h.next) return { label: "Next", text: h.next, warn: false }
  return { label: "Done", text: h.done, warn: false }
}

function headline(n: LeftOffNoteView) {
  if (n.state === "blocked" && n.blockedOn) return `Wants: ${n.blockedOn}`
  if (n.body) return n.body
  const lead = handoffLead(n)
  if (lead) return `${lead.label}: ${lead.text}`
  if (n.lastReply) return n.lastReply
  return n.lastPrompt
}

/** "3 agents running (Explore, qa)" under a working chat; "2 still running" under one that stopped. */
function agentsLine(n: LeftOffNoteView) {
  if (!n.agents) return ""
  const count = `${n.agents.running} ${n.agents.running === 1 ? "agent" : "agents"}`
  if (n.state === "working") {
    return ` · ${count} running${n.agents.types.length ? ` (${n.agents.types.join(", ")})` : ""}`
  }
  return ` · ${count} still running`
}

function Row({ note }: { note: LeftOffNoteView }) {
  const where = [note.project, note.branch && note.branch !== "main" ? note.branch : ""]
    .filter(Boolean)
    .join(" · ")
  const dismiss = dismissLeftOffAction.bind(null, note.sessionRef)
  const pin = pinLeftOffAction.bind(null, note.sessionRef, !note.pinned)
  const reply = replyLeftOffAction.bind(null, note.sessionRef)
  const toTask = convertLeftOffAction.bind(null, note.sessionRef, "task")
  const toTicket = convertLeftOffAction.bind(null, note.sessionRef, "ticket")
  const blocked = note.state === "blocked" && !!note.blockedOn
  const lead = handoffLead(note)
  const handoffWarn = !blocked && !note.body && !!lead?.warn
  // The Done line rides under the headline unless it already is the headline.
  const doneLine = note.handoff?.done && (note.body || lead?.label !== "Done") ? note.handoff.done : ""
  return (
    // The state column is a fixed width, not `auto`: each row is its own grid,
    // so an auto column sizes to that row's own label and "Parked" and
    // "Waiting on you" start their titles in different places. The one thing
    // this band is for is running your eye down the titles.
    <li className="group grid grid-cols-[112px_1fr_auto] items-start gap-x-3 px-5 py-3">
      <span
        className={cn(
          "mt-0.5 inline-flex h-5 items-center justify-self-start rounded-full px-2 text-[11px] font-semibold ring-1 ring-inset",
          CHIP[note.state]
        )}
      >
        {STATE_LABEL[note.state]}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-tk-onyx">
          {note.pinned ? <Pin aria-label="Pinned" className="mr-1 inline size-3 text-tk-teal" /> : null}
          {note.title}
          <span className="ml-2 text-xs font-normal text-tk-slate/60">
            {SURFACE_LABEL[note.surface] ?? note.surface}
            {where ? ` · ${where}` : ""}
            {` · ${note.ago}`}
            {agentsLine(note)}
          </span>
        </p>
        {headline(note) ? (
          <p
            className={cn(
              "mt-0.5 line-clamp-2 text-sm",
              blocked ? "font-medium text-[#A62228]" : handoffWarn ? "font-medium text-[#8A5A05]" : "text-tk-slate/80"
            )}
          >
            {headline(note)}
          </p>
        ) : null}
        {doneLine ? <p className="mt-0.5 truncate text-xs text-tk-slate/50">Done: {doneLine}</p> : null}
        {note.body && note.lastPrompt && !doneLine ? (
          <p className="mt-0.5 truncate text-xs text-tk-slate/50">You: {note.lastPrompt}</p>
        ) : null}
        {note.pendingReply ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-tk-teal">
            <CornerDownLeft className="size-3" aria-hidden />
            Reply queued, delivered when the chat next runs: <span className="truncate text-tk-onyx">{note.pendingReply}</span>
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 has-[details[open]]:opacity-100">
        {!note.pendingReply && note.surface !== "manual" && note.surface !== "agent" ? (
          // Opened by a click, not by hover: a field that unfolds under the
          // cursor grows the row and pushes every row below it down, so
          // reading down the list made it walk. As a popover it never moves
          // anything, and it stays open when the pointer leaves.
          <details className="relative">
            <summary
              aria-label={`Reply to ${note.title}`}
              title="Reply"
              className={cn(ICON_BTN, "flex cursor-pointer list-none [&::-webkit-details-marker]:hidden")}
            >
              <CornerDownLeft className="size-4" />
            </summary>
            <form
              action={reply}
              className="absolute right-0 top-7 z-20 flex w-72 items-center gap-1.5 rounded-lg border border-tk-slate/15 bg-white p-1.5 shadow-lg"
            >
              <input
                name="text"
                type="text"
                placeholder="Reply to this chat…"
                aria-label={`Reply to ${note.title}`}
                className="h-7 min-w-0 flex-1 rounded-md border border-tk-slate/20 bg-white px-2 text-xs text-tk-onyx placeholder:text-tk-slate/40 focus:border-tk-teal focus:outline-none"
              />
              <button type="submit" className="h-7 rounded-md bg-tk-teal px-2.5 text-xs font-semibold text-white hover:brightness-95">
                Send
              </button>
            </form>
          </details>
        ) : null}
        <form action={toTask}>
          <button type="submit" aria-label="Turn into a task" title="Turn into a task" className={ICON_BTN}>
            <ListChecks className="size-4" />
          </button>
        </form>
        <form action={toTicket}>
          <button type="submit" aria-label="Turn into a ticket" title="Turn into a ticket" className={ICON_BTN}>
            <LifeBuoy className="size-4" />
          </button>
        </form>
        <form action={pin}>
          <button type="submit" aria-label={note.pinned ? "Unpin" : "Pin"} title={note.pinned ? "Unpin" : "Pin"} className={ICON_BTN}>
            {note.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </button>
        </form>
        <form action={dismiss}>
          <button type="submit" aria-label="Dismiss" title="Dismiss" className={ICON_BTN}>
            <X className="size-4" />
          </button>
        </form>
      </div>
    </li>
  )
}

type Group = { key: string; name: string; color: string | null; notes: LeftOffNoteView[] }

/** Notes arrive already sorted by client; this only cuts the list where the client changes. */
function groups(notes: LeftOffNoteView[]): Group[] {
  const out: Group[] = []
  for (const n of notes) {
    const key = n.client?.slug ?? ""
    const last = out[out.length - 1]
    if (last && last.key === key) last.notes.push(n)
    else out.push({ key, name: n.client?.name ?? "House", color: n.client?.color ?? null, notes: [n] })
  }
  return out
}

export function LeftOff({ payload }: { payload: LeftOffPayload }) {
  // The tab snapshot is context for the threads, not a row of its own: a lone
  // Chrome line under an empty board reads as a bug rather than a reminder.
  if (!payload.notes.length) return null
  const tabs = payload.browser ? payload.browser.windows.reduce((sum, w) => sum + w.tabs.length, 0) : 0
  const byClient = groups(payload.notes)
  const showHeaders = byClient.length > 1 || (byClient.length === 1 && byClient[0].key !== "")
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm md:mt-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-tk-slate/10 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">Where I left off</h2>
        <p className="text-xs text-tk-slate/60">{countsLine(payload.counts) || "Nothing parked"}</p>
        {/* A plain GET form: no action function, so nothing crosses into a
            client component. It hands the query to the history page, which is
            where every conversation ever had still lives. */}
        <form method="get" action={ROUTES.timesheetSessions} className="relative ml-auto">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-tk-slate/40"
          />
          <input
            type="search"
            name="q"
            placeholder="Search every session…"
            aria-label="Search every session"
            className="w-52 rounded-lg border border-tk-slate/20 bg-white py-1.5 pl-8 pr-3 text-xs text-tk-onyx outline-none placeholder:text-tk-slate/40 focus:border-tk-teal"
          />
        </form>
        <Link
          href={ROUTES.timesheetSessions}
          className="text-xs font-semibold text-tk-teal hover:underline"
        >
          History
        </Link>
      </div>
      {byClient.map((g) => (
        <div key={g.key || "house"}>
          {showHeaders ? (
            <p className="flex items-center gap-2 border-b border-tk-slate/10 bg-tk-linen/40 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-tk-slate/70">
              <span
                aria-hidden
                className="inline-block size-2 rounded-full"
                style={{ background: g.color ?? "#71807D" }}
              />
              {g.name}
              <span className="font-normal normal-case tracking-normal text-tk-slate/50">
                {g.notes.length}
              </span>
            </p>
          ) : null}
          <ul className="divide-y divide-tk-slate/10">
            {g.notes.map((n) => (
              <Row key={n.sessionRef} note={n} />
            ))}
          </ul>
        </div>
      ))}
      {payload.browser ? (
        <div className="border-t border-tk-slate/10 px-5 py-2.5 text-xs text-tk-slate/60">
          Chrome · {tabs} {tabs === 1 ? "tab" : "tabs"} in {payload.browser.windows.length}{" "}
          {payload.browser.windows.length === 1 ? "window" : "windows"}
          {payload.browser.windows.length
            ? ` — ${payload.browser.windows.map((w) => w.title).filter(Boolean).slice(0, 4).join(", ")}`
            : ""}
        </div>
      ) : null}
    </section>
  )
}
