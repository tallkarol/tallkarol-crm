import { Pin, PinOff, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { STATE_LABEL, type LeftOffNoteView, type LeftOffPayload, type NoteState } from "@/lib/leftoff"
import { dismissLeftOffAction, pinLeftOffAction } from "@/lib/leftoff-actions"

/**
 * "Where did I leave things?" — one band under the dashboard header, one row
 * per chat you have open or walked away from, in the order you should look
 * at them: blocked on a yes, parked, waiting on you, still working. Every
 * row is the chat's own last exchange, untouched: the title Claude gave it,
 * what you asked, what it said. The band is absent when there is nothing to
 * show — it is a reminder, not a fixture.
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

function countsLine(counts: LeftOffPayload["counts"]) {
  const parts: string[] = []
  if (counts.blocked) parts.push(`${counts.blocked} blocked`)
  if (counts.parked) parts.push(`${counts.parked} parked`)
  if (counts.waiting) parts.push(`${counts.waiting} waiting`)
  if (counts.working) parts.push(`${counts.working} working`)
  return parts.join(" · ")
}

function headline(n: LeftOffNoteView) {
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
          <p className="mt-0.5 line-clamp-2 text-sm text-tk-slate/80">{headline(note)}</p>
        ) : null}
        {note.body && note.lastPrompt ? (
          <p className="mt-0.5 truncate text-xs text-tk-slate/50">You: {note.lastPrompt}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <form action={pin}>
          <button
            type="submit"
            aria-label={note.pinned ? "Unpin" : "Pin"}
            title={note.pinned ? "Unpin" : "Pin"}
            className="rounded-md p-1 text-tk-slate/60 hover:bg-tk-linen hover:text-tk-onyx"
          >
            {note.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
          </button>
        </form>
        <form action={dismiss}>
          <button
            type="submit"
            aria-label="Dismiss"
            title="Dismiss"
            className="rounded-md p-1 text-tk-slate/60 hover:bg-tk-linen hover:text-tk-onyx"
          >
            <X className="size-4" />
          </button>
        </form>
      </div>
    </li>
  )
}

export function LeftOff({ payload }: { payload: LeftOffPayload }) {
  if (!payload.notes.length && !payload.browser) return null
  const tabs = payload.browser
    ? payload.browser.windows.reduce((sum, w) => sum + w.tabs.length, 0)
    : 0
  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm md:mt-8">
      <div className="flex items-center justify-between border-b border-tk-slate/10 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-tk-onyx">Where I left off</h2>
        <p className="text-xs text-tk-slate/60">{countsLine(payload.counts) || "Nothing parked"}</p>
      </div>
      {payload.notes.length ? (
        <ul className="divide-y divide-tk-slate/10">
          {payload.notes.map((n) => (
            <Row key={n.sessionRef} note={n} />
          ))}
        </ul>
      ) : null}
      {payload.browser ? (
        <div className="border-t border-tk-slate/10 px-5 py-2.5 text-xs text-tk-slate/60">
          Chrome · {tabs} {tabs === 1 ? "tab" : "tabs"} in {payload.browser.windows.length}{" "}
          {payload.browser.windows.length === 1 ? "window" : "windows"}
          {payload.browser.windows.length ? ` — ${payload.browser.windows.map((w) => w.title).filter(Boolean).slice(0, 4).join(", ")}` : ""}
        </div>
      ) : null}
    </section>
  )
}
