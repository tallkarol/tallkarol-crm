"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bookmark, Check, Terminal, ThumbsDown, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { decideApprovals, giveFeedback } from "@/lib/chat/actions"
import { modelLabel, modelPool, resultCount, timeLabel } from "@/lib/chat/format"
import type { RequestGroup } from "@/lib/chat/requests"
import { parseCommand } from "@/lib/chat/skills"
import { ApprovalCard } from "@/components/chat/ApprovalCard"
import { Mark, speakerFor } from "@/components/chat/Marks"
import { Prose } from "@/components/chat/Prose"
import { Receipt } from "@/components/chat/Receipt"
import { ReplyActions } from "@/components/chat/ReplyActions"
import type { ChatMessageView } from "@/components/chat/types"
import type { ChatToolCall } from "@/db/schema"
import { stripReplyActions, viaReplyAction } from "@/lib/chat/reply-actions"
import { attachmentPath } from "@/lib/chat/attachments"

/**
 * One request, as a section of the ledger.
 *
 * Karol's line is the heading. Under it the receipt: state, rungs, reads,
 * writes, cost. Then the steps the rungs took, then each reply as prose with
 * the model that wrote it, the gate cards for anything it wants to write, and
 * what Karol thought of it. No bubbles — a reply is something to read, and a
 * request is something to track.
 */
export function RequestSection({ group, compact }: { group: RequestGroup; compact?: boolean }) {
  const { ask, replies, notes, reads, writes } = group
  const command = ask ? parseCommand(ask.body) : null
  const handed = Boolean(ask && ask.agent && ask.agent !== "Karol")
  // A write parked by a rung that never replied — failed, or still running —
  // has nowhere else to show; it hangs under the line that asked for it.
  const orphans = replies.length === 0 ? writes : []

  return (
    <article className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-3.5 gap-y-2.5">
      {ask ? (
        <>
          <div className="flex justify-center pt-px">
            <Mark speaker={speakerFor("user", ask.agent)} />
          </div>
          <div className="flex min-w-0 flex-col gap-2.5">
            {handed ? (
              <span className="font-ui text-[10.5px] font-semibold text-ink-3">
                {ask.agent} · handed over, not Karol
              </span>
            ) : null}
            <Screenshots attachments={ask.attachments} />
            {ask.body ? (
              <h2
                className={cn(
                  "m-0 whitespace-pre-wrap font-display font-semibold tracking-[-0.012em] text-tk-onyx [overflow-wrap:anywhere]",
                  compact ? "text-[15px] leading-[1.35]" : "text-[17px] leading-[1.3]"
                )}
              >
                {command ? (
                  <span className="font-mono text-[15px] font-medium tracking-[-0.01em]">
                    <span className="font-semibold text-accent-ink">/{command.name}</span>
                    {command.args ? ` ${command.args}` : ""}
                  </span>
                ) : (
                  ask.body
                )}
              </h2>
            ) : null}
            <Receipt group={group} />
            {reads.length ? <Steps reads={reads} /> : null}
            {orphans.map((call) => (
              <ApprovalCard key={call.id} call={call} />
            ))}
          </div>
        </>
      ) : null}

      {notes.map((note) => (
        <p
          key={note.id}
          className="col-span-2 ml-10 justify-self-start rounded-full bg-well px-3 py-1 text-[11px] text-ink-3"
        >
          {note.body}
        </p>
      ))}

      {replies.map((reply) => (
        <Reply key={reply.id} reply={reply} showReads={!ask} />
      ))}
    </article>
  )
}

function Reply({ reply, showReads }: { reply: ChatMessageView; showReads: boolean }) {
  const turn = reply.chain.find((t) => t.id === reply.turnId) ?? null
  const reads = reply.calls.filter((c) => !c.mutating)
  const writes = reply.calls.filter((c) => c.mutating && !viaReplyAction(c.args))
  const pending = writes.filter((c) => c.status === "pending")
  const skill = reply.agent.startsWith("/")
  const prose = stripReplyActions(reply.body)

  return (
    <>
      <div className="flex justify-center pt-px">
        <Mark speaker={speakerFor("assistant", reply.agent)} />
      </div>
      <div className="group/fb flex min-w-0 flex-col gap-2.5">
        <div className="flex items-center gap-2 font-ui text-[12px] font-semibold text-tk-onyx">
          <span className={cn("truncate", skill && "font-mono")}>{reply.agent}</span>
          {turn ? (
            <span
              className={cn(
                "shrink-0 rounded-[5px] border px-1.5 py-px font-mono text-[10.5px] font-medium",
                modelPool(turn.model) === "other"
                  ? "border-transparent bg-warn-soft text-warn"
                  : "border-line bg-card text-ink-3"
              )}
            >
              {modelLabel(turn.model)}
            </span>
          ) : null}
          <span className="ml-auto shrink-0 font-mono text-[10.5px] font-medium text-ink-3">
            {timeLabel(reply.createdAt)}
          </span>
        </div>

        {showReads && reads.length ? <Steps reads={reads} /> : null}

        {prose ? (
          <div className="max-w-[62ch] text-[14px] leading-[1.6] text-tk-onyx">
            <Prose text={prose} />
          </div>
        ) : null}

        <ReplyActions
          messageId={reply.id}
          body={reply.body}
          context={reply.actionsContext}
          calls={reply.calls}
        />

        {pending.length > 1 ? <BulkDecide callIds={pending.map((c) => c.id)} /> : null}

        {writes.map((call) => (
          <ApprovalCard key={call.id} call={call} />
        ))}

        {reply.agent !== "Assistant" && !skill ? <Feedback message={reply} /> : null}
      </div>
    </>
  )
}

const STEPS_SHOWN = 8

/**
 * What the rungs read, named and counted — the answer is in the reply. A
 * long search folds after eight; the count on the fold is the receipt's.
 */
function Steps({ reads }: { reads: ChatToolCall[] }) {
  const [all, setAll] = useState(false)
  const shown = all || reads.length <= STEPS_SHOWN + 1 ? reads : reads.slice(0, STEPS_SHOWN)
  const hidden = reads.length - shown.length
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((call) => (
        <ReadChip key={call.id} call={call} />
      ))}
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="inline-flex h-[22px] items-center rounded-md px-2 font-mono text-[11px] font-medium text-accent-ink hover:bg-well"
        >
          +{hidden} more
        </button>
      ) : null}
    </div>
  )
}

/**
 * What Karol pasted, above what he typed. The width and height are the
 * stored image's, so the box is the right shape before a byte arrives;
 * a click opens the full image in a tab.
 */
function Screenshots({ attachments }: { attachments: ChatMessageView["attachments"] }) {
  if (attachments.length === 0) return null
  const one = attachments.length === 1
  return (
    <div className="flex max-w-full flex-wrap gap-1.5">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={attachmentPath(a.id)}
          target="_blank"
          rel="noopener"
          title={a.name}
          className="block max-w-full overflow-hidden rounded-[12px] border border-line bg-well outline-accent-ink"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- auth-gated bytes, no optimiser */}
          <img
            src={attachmentPath(a.id)}
            alt={a.name}
            width={a.width}
            height={a.height}
            loading="lazy"
            decoding="async"
            className={cn("block h-auto w-auto max-w-full", one ? "max-h-[240px]" : "max-h-[132px]")}
          />
        </a>
      ))}
    </div>
  )
}

/**
 * What Karol thought of a desk's reply — the cheapest signal `/train` gets.
 * Quiet until the reply is hovered; once given it stays as a chip so the
 * thread reads as a record. "Not right" asks for one line on why.
 */
function Feedback({ message }: { message: ChatMessageView }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)

  const given = message.feedback
  const down = given.find((f) => f.kind === "down")
  const example = given.find((f) => f.kind === "example")

  function give(kind: "down" | "example", text = "") {
    setError(null)
    startTransition(async () => {
      const result = await giveFeedback({ messageId: message.id, kind, note: text })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setAsking(false)
      setNote("")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {down ? (
        <span
          className="inline-flex h-6 items-center gap-1.5 rounded-lg border border-line bg-bad-soft px-2 font-ui text-[11px] text-bad"
          title={down.note || undefined}
        >
          <ThumbsDown className="size-3" aria-hidden />
          Not right{down.note ? ` · ${down.note.slice(0, 80)}${down.note.length > 80 ? "…" : ""}` : ""}
        </span>
      ) : null}
      {example ? (
        <span className="inline-flex h-6 items-center gap-1.5 rounded-lg border border-line bg-good-soft px-2 font-ui text-[11px] text-good">
          <Bookmark className="size-3" aria-hidden />
          Kept as example
        </span>
      ) : null}

      {asking ? (
        <form
          className="flex w-full max-w-[36rem] items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            give("down", note)
          }}
        >
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What was wrong? One line."
            aria-label="What was wrong"
            maxLength={2000}
            className="h-7 min-w-0 flex-1 rounded-md border border-line bg-card px-2 text-[12px] text-tk-onyx outline-none focus:border-line-strong"
          />
          <button
            type="submit"
            disabled={busy}
            className="h-7 rounded-md bg-accent px-2.5 font-ui text-[11px] font-semibold text-on-accent disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="h-7 rounded-md px-2 font-ui text-[11px] text-ink-3 hover:text-tk-onyx"
          >
            Cancel
          </button>
        </form>
      ) : (
        <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover/fb:opacity-100 group-focus-within/fb:opacity-100 motion-reduce:transition-none">
          {!down ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => setAsking(true)}
              className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-ui text-[11px] text-ink-3 hover:bg-well hover:text-tk-onyx"
            >
              <ThumbsDown className="size-3" aria-hidden />
              Not right
            </button>
          ) : null}
          {!example ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => give("example")}
              className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 font-ui text-[11px] text-ink-3 hover:bg-well hover:text-tk-onyx"
            >
              <Bookmark className="size-3" aria-hidden />
              Keep as example
            </button>
          ) : null}
        </span>
      )}
      {error ? <span className="font-ui text-[11px] text-bad">{error}</span> : null}
    </div>
  )
}

/**
 * One reply, several cards. Eight create_task cards from one message used to
 * be eight clicks; this decides them together, each still through its own
 * compare-and-swap and idempotency key.
 */
function BulkDecide({ callIds }: { callIds: string[] }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function decide(approve: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await decideApprovals({ callIds, approve })
      if (!result.ok) setError(result.error)
      else {
        if (result.failed.length) setError(`${result.failed.length} could not be decided: ${result.failed[0].error}`)
        router.refresh()
      }
    })
  }

  return (
    <div className="flex max-w-[36rem] flex-wrap items-center gap-2 rounded-xl border border-line bg-well px-3 py-2">
      <span className="font-ui text-[11.5px] font-semibold text-tk-onyx">{callIds.length} previews waiting</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => decide(true)}
        className="inline-flex h-7 items-center gap-1.5 rounded-[8px] bg-accent px-2.5 font-ui text-[11px] font-semibold text-on-accent outline-accent-ink disabled:opacity-60"
      >
        <Check className="size-3" aria-hidden />
        Confirm all {callIds.length}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => decide(false)}
        className="inline-flex h-7 items-center gap-1.5 rounded-[8px] border border-line px-2.5 font-ui text-[11px] font-semibold text-ink-2 outline-accent-ink hover:border-line-strong hover:text-tk-onyx disabled:opacity-60"
      >
        <X className="size-3" aria-hidden />
        Discard all
      </button>
      {error ? <span className="basis-full font-ui text-[11px] text-bad">{error}</span> : null}
    </div>
  )
}

/** A read that already ran. Named and counted, not dumped — the answer is in the reply. */
function ReadChip({ call }: { call: ChatToolCall }) {
  const failed = call.status === "failed"
  const count = failed ? null : resultCount(call.result)
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-md border border-line bg-card pl-1.5 pr-2 font-mono text-[11px] font-medium tracking-[-0.01em]",
        failed ? "text-bad" : "text-ink-2"
      )}
      title={failed ? call.error : undefined}
    >
      {failed ? (
        <X className="size-[11px]" aria-hidden />
      ) : call.status === "ran" ? (
        <Check className="size-[11px] text-good" aria-hidden />
      ) : (
        <Terminal className="size-[11px] text-ink-3" aria-hidden />
      )}
      {call.name}
      {count != null ? <span className="text-ink-3">· {count}</span> : null}
      {failed ? <span>· failed</span> : null}
    </span>
  )
}
