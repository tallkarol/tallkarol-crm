import { CornerDownLeft, ListChecks, LifeBuoy, Pin, PinOff, X } from "lucide-react"
import { cn } from "@/lib/cn"
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
 * you, still working. Every row is the chat's own last exchange, untouched.
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

function headline(n: LeftOffNoteView) {
  if (n.state === "blocked" && n.blockedOn) return `Wants: ${n.blockedOn}`
  if (n.body) return n.body
  if (n.lastReply) return n.lastReply
  return n.lastPrompt
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
  return (
    <li className="group grid grid-cols-[auto_1fr_auto] items-start gap-x-3 px-5 py-3">
      <span
        className={cn(
          "mt-0.5 inline-flex h-5 items-center rounded-full px-2 text-[11px] font-semibold ring-1 ring-inset",
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
          </span>
        </p>
        {headline(note) ? (
          <p className={cn("mt-0.5 line-clamp-2 text-sm", blocked ? "font-medium text-[#A62228]" : "text-tk-slate/80")}>
            {headline(note)}
          </p>
        ) : null}
        {note.body && note.lastPrompt ? (
          <p className="mt-0.5 truncate text-xs text-tk-slate/50">You: {note.lastPrompt}</p>
        ) : null}
        {note.pendingReply ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-tk-teal">
            <CornerDownLeft className="size-3" aria-hidden />
            Reply queued, delivered when the chat next runs: <span className="truncate text-tk-onyx">{note.pendingReply}</span>
          </p>
        ) : note.surface !== "manual" ? (
          <form action={reply} className="mt-1.5 hidden max-w-md items-center gap-1.5 group-hover:flex group-focus-within:flex">
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
        ) : null}
      </div>
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
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
  if (!payload.notes.length && !payload.browser) return null
  const tabs = payload.browser ? payload.browser.windows.reduce((sum, w) => sum + w.tabs.length, 0) : 0
  const byClient = groups(payload.notes)
  const showHeaders = byClient.length > 1 || (byClient.length === 1 && byClient[0].key !== "")
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm md:mt-8">
      <div className="flex items-center justify-between border-b border-tk-slate/10 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">Where I left off</h2>
        <p className="text-xs text-tk-slate/60">{countsLine(payload.counts) || "Nothing parked"}</p>
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
