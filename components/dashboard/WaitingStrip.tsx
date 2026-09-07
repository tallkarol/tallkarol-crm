"use client"

import { useId, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FlaskConical,
  Inbox,
  LifeBuoy,
  ListChecks,
  Receipt,
  ServerCrash,
  Sparkles,
  X,
} from "lucide-react"
import { cn } from "@/lib/cn"
import { dismissLeftOffAction, replyLeftOffAction } from "@/lib/leftoff-actions"
import { setTaskDone } from "@/lib/task-actions"
import { Card as TkCard } from "@/components/ui/Card"
import {
  KIND_LABEL,
  WAITING_KINDS,
  type WaitingItem,
  type WaitingKind,
  type WaitingPayload,
  type WaitingSeverity,
  type WaitingVerb,
} from "@/lib/waiting"

/**
 * The decision queue, always on screen.
 *
 * Not a modal — the modal is the problem this replaces. `session_notes` has
 * carried reply, dismiss and convert since the board shipped and in seventy-
 * nine rows none of them was ever used once, because using one meant opening
 * something first. So the verbs come to the page instead: one strip above the
 * fold, one pass left to right, and the row leaves as you deal with it.
 *
 * The component owns no rules. `lib/waiting.ts` decides what qualifies, how
 * it ranks and which verbs a row offers; this reads `item.verbs` and draws
 * the browser's equivalent of each. Two of the five are the CRM's own server
 * actions over the same functions the API routes call; `log` has no browser
 * action (that write only exists as the widget's token-authenticated POST),
 * so it draws as a link into the session peek where the conversion is made by
 * hand. Nothing here invents a write.
 */

type IconType = typeof Sparkles

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

/** Same three maps, same shape, as the lane tones in `LeftOffBoard`. */
const TONE_DOT: Record<WaitingSeverity, string> = {
  hot: "bg-bad",
  warn: "bg-warn",
  quiet: "border border-line bg-card",
}
const TONE_EDGE: Record<WaitingSeverity, string> = {
  hot: "border-l-bad",
  warn: "border-l-warn",
  quiet: "border-l-line",
}
const TONE_CHIP: Record<WaitingSeverity, string> = {
  hot: "bg-bad-soft text-bad",
  warn: "bg-warn-soft text-warn",
  quiet: "bg-well text-tk-slate",
}

const GHOST_BTN =
  "inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-2 font-ui text-[11.5px] font-semibold text-tk-slate hover:bg-well transition-colors duration-[120ms] hover:text-tk-onyx focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tk-teal"
const ICON_BTN =
  "rounded-md p-1.5 text-ink-3 hover:bg-well transition-colors duration-[120ms] hover:text-tk-onyx focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tk-teal"
const REPLY_INPUT =
  "h-8 min-w-0 flex-1 rounded-lg border border-line bg-well px-2.5 text-[12.5px] text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal focus:bg-card"
const SEND_BTN =
  "h-8 shrink-0 rounded-lg bg-accent px-3 font-ui text-xs font-semibold text-tk-linen hover:brightness-95"

export function WaitingStrip({ payload }: { payload: WaitingPayload | null }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [ticked, setTicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const headingId = useId()

  // Ticking is optimistic: the row goes the moment you tap it and comes back
  // only if the write failed. A queue you work top to bottom cannot make you
  // wait for a round trip before the next row moves up.
  function complete(itemId: string, taskId: string) {
    setTicked((ids) => (ids.includes(itemId) ? ids : [...ids, itemId]))
    startTransition(async () => {
      const result = await setTaskDone(taskId, true)
      if (!result.ok) {
        setTicked((ids) => ids.filter((id) => id !== itemId))
        setError(result.error)
        return
      }
      setError(null)
      router.refresh()
    })
  }

  const items = (payload?.items ?? []).filter((item) => !ticked.includes(item.id))
  const total = payload ? payload.total - ticked.length : 0
  const hidden = payload ? Math.max(payload.total - payload.items.length, 0) : 0

  return (
    <TkCard className="mt-6 min-w-0 overflow-hidden" aria-labelledby={headingId}>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-[18px] py-3">
        {total > 0 ? (
          <span
            aria-hidden
            className={cn(
              "size-2.5 shrink-0 rounded-full",
              TONE_DOT[items[0]?.severity ?? "warn"],
              items[0]?.severity === "hot" && "motion-safe:animate-pulse"
            )}
          />
        ) : null}
        <h2 id={headingId} className="font-ui text-[13.5px] font-bold tracking-tight text-tk-onyx">
          Waiting on you
        </h2>
        {total > 0 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full border border-line bg-well px-1.5 font-ui text-[11px] font-bold tabular-nums text-tk-slate">
            {total}
          </span>
        ) : null}

        {payload ? (
          <p className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-3">
            {WAITING_KINDS.filter((kind) => payload.counts[kind] > 0).map((kind) => (
              <span key={kind} className="whitespace-nowrap">
                {KIND_LABEL[kind]} <span className="font-semibold tabular-nums">{payload.counts[kind]}</span>
              </span>
            ))}
            {hidden > 0 ? <span className="whitespace-nowrap">+{hidden} not shown</span> : null}
          </p>
        ) : null}
      </div>

      {error ? (
        <p role="status" className="border-b border-line bg-bad-soft px-[18px] py-2 text-[12px] text-bad">
          {error}
        </p>
      ) : null}

      {!payload ? (
        <p className="px-[18px] py-4 text-[12.5px] text-ink-3">
          The queue could not be read. The rest of the dashboard is unaffected.
        </p>
      ) : items.length === 0 ? (
        <p className="flex items-center gap-2 px-[18px] py-4 text-[12.5px] text-ink-3">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          {/* Ticking the last visible row empties the strip a beat before the
              refresh brings the overflow up, and "nothing is waiting" would be
              a lie for exactly that beat. */}
          {total > 0
            ? `Cleared what was on screen. ${total} more behind it — fetching.`
            : "Nothing is waiting on you. Every chat, ticket, enquiry and punch-list item is somebody else’s turn."}
        </p>
      ) : (
        <ul className="flex min-w-0 snap-x gap-2.5 overflow-x-auto px-[18px] py-3.5">
          {items.map((item) => (
            <Card key={item.id} item={item} onComplete={complete} />
          ))}
        </ul>
      )}
    </TkCard>
  )
}

/* ------------------------------------------------------------------- card */

function Card({
  item,
  onComplete,
}: {
  item: WaitingItem
  onComplete: (itemId: string, taskId: string) => void
}) {
  const Icon = KIND_ICON[item.kind]
  const verb = (id: WaitingVerb["id"]) => item.verbs.find((v) => v.id === id)
  const reply = verb("reply")
  const dismiss = verb("dismiss")
  const complete = verb("complete")
  const open = verb("open")
  // `log` is the widget's POST; the browser has no server action over
  // `logAgentTime`, so the row links to the session peek and the conversion
  // is made there. Named so the card still shows what the verb is for.
  const log = verb("log")

  return (
    <li
      className={cn(
        "flex w-[290px] shrink-0 snap-start flex-col gap-1.5 rounded-xl border border-l-[3px] border-line bg-card p-3 shadow-card",
        TONE_EDGE[item.severity]
      )}
    >
      <div className="flex items-center gap-1.5 font-ui text-[11px] font-semibold">
        <span
          className={cn("inline-flex h-5 items-center gap-1 rounded-md px-1.5", TONE_CHIP[item.severity])}
        >
          <Icon className="size-3" aria-hidden />
          {KIND_LABEL[item.kind]}
        </span>
        <span
          style={item.color ? ({ "--c": item.color } as React.CSSProperties) : undefined}
          className={cn(
            "inline-flex h-5 items-center truncate rounded-md px-1.5",
            item.client ? "tk-client-tint tk-client-ink" : "bg-well text-tk-onyx"
          )}
        >
          {item.client || "House"}
        </span>
        <span className="ml-auto shrink-0 tabular-nums text-ink-3">{item.ageLabel}</span>
      </div>

      <Link
        href={item.href}
        className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-tk-onyx hover:underline"
      >
        {item.title}
      </Link>

      {item.subtitle ? (
        <p className="line-clamp-2 text-[11.5px] leading-snug text-ink-3">{item.subtitle}</p>
      ) : null}

      {reply ? (
        <form action={replyLeftOffAction.bind(null, reply.ref)} className="mt-0.5 flex items-center gap-1.5">
          <input
            name="text"
            type="text"
            placeholder="Reply — delivered on its next turn…"
            aria-label={`Reply to ${item.title}`}
            className={REPLY_INPUT}
          />
          <button type="submit" className={SEND_BTN}>
            Send
          </button>
        </form>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-1 pt-0.5">
        {complete ? (
          <button
            type="button"
            onClick={() => onComplete(item.id, complete.ref)}
            className={GHOST_BTN}
          >
            <CheckCircle2 className="size-3" aria-hidden />
            {complete.label}
          </button>
        ) : null}

        {log ? (
          <Link href={item.href} className={GHOST_BTN}>
            <Receipt className="size-3" aria-hidden />
            {log.label}
          </Link>
        ) : null}

        {open ? (
          <Link href={open.href} className={GHOST_BTN}>
            <ArrowUpRight className="size-3" aria-hidden />
            {open.label}
          </Link>
        ) : null}

        <span className="grow" />

        {dismiss ? (
          <form action={dismissLeftOffAction.bind(null, dismiss.ref)}>
            <button type="submit" aria-label={`Dismiss ${item.title}`} title="Dismiss" className={ICON_BTN}>
              <X className="size-3.5" />
            </button>
          </form>
        ) : null}
      </div>
    </li>
  )
}
