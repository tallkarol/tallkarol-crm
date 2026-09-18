"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Bookmark, Check, Sparkles, Terminal, ThumbsDown, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { decideApprovals, giveFeedback } from "@/lib/chat/actions"
import { modelLabel, modelPool, resultCount, timeLabel } from "@/lib/chat/format"
import { parseCommand } from "@/lib/chat/skills"
import { ApprovalCard } from "@/components/chat/ApprovalCard"
import { LadderTrace } from "@/components/chat/LadderTrace"
import { Prose } from "@/components/chat/Prose"
import { ReplyActions } from "@/components/chat/ReplyActions"
import type { ChatMessageView } from "@/components/chat/types"
import type { ChatToolCall } from "@/db/schema"
import { stripReplyActions, viaReplyAction } from "@/lib/chat/reply-actions"
import { attachmentPath } from "@/lib/chat/attachments"

/**
 * One message.
 *
 * Karol's side is a soft bubble on the right. The assistant's side is prose
 * on the canvas — a mark, a name, the model that answered, and the text —
 * because a reply is something to read, not a speech balloon. What the
 * assistant DID sits between the two: reads as quiet chips, writes as the
 * approval card, and the rungs it climbed as a footnote.
 */
export function Message({ message }: { message: ChatMessageView }) {
  if (message.role === "tool") return null

  if (message.role === "system") {
    return (
      <p className="self-center rounded-full bg-well px-3 py-1 text-center text-[11px] text-ink-3">
        {message.body}
      </p>
    )
  }

  if (message.role === "user") {
    const command = parseCommand(message.body)
    const failedOutright =
      message.chain.length > 0 &&
      message.chain.every((t) => t.status === "failed" || t.status === "cancelled")
    /**
     * A line a desk handed over (route_to's brief) is stored as a user row
     * under the desk's name. It is not Karol speaking, and must not look it.
     */
    const handed = Boolean(message.agent && message.agent !== "Karol")
    // Calls from turns that never produced a reply — a write parked in a rung
    // that then failed — used to render nowhere while lighting "Needs you".
    const orphanReads = message.calls.filter((c) => !c.mutating)
    const orphanWrites = message.calls.filter((c) => c.mutating && !viaReplyAction(c.args))
    return (
      <div className="group flex flex-col items-end gap-1.5">
        {handed ? (
          <span className="pr-1 font-ui text-[10.5px] font-semibold text-ink-3">
            {message.agent} · handed over, not Karol
          </span>
        ) : null}
        <Screenshots attachments={message.attachments} />
        {message.body ? (
          <div
            className={cn(
              "max-w-[72%] whitespace-pre-wrap rounded-[18px] rounded-br-[6px] px-3.5 py-2.5 text-[14.5px] leading-[1.5] text-tk-onyx [overflow-wrap:anywhere]",
              handed ? "border border-line bg-well" : "bg-accent-soft"
            )}
          >
            {command ? (
              <span className="font-mono text-[13px]">
                <span className="text-accent-ink">/{command.name}</span>
                {command.args ? ` ${command.args}` : ""}
              </span>
            ) : (
              message.body
            )}
          </div>
        ) : null}
        <span className="pr-1 font-ui text-[10.5px] text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
          {timeLabel(message.createdAt)}
        </span>
        {orphanReads.length || orphanWrites.length ? (
          <div className="flex w-full flex-col gap-2">
            {orphanReads.length ? (
              <div className="flex flex-wrap gap-1.5 pl-8">
                {orphanReads.map((call) => (
                  <ReadChip key={call.id} call={call} />
                ))}
              </div>
            ) : null}
            {orphanWrites.map((call) => (
              <ApprovalCard key={call.id} call={call} />
            ))}
          </div>
        ) : null}
        {failedOutright ? (
          <div className="w-full">
            <LadderTrace turns={message.chain} />
          </div>
        ) : null}
      </div>
    )
  }

  const turn = message.chain.find((t) => t.id === message.turnId) ?? null
  const reads = message.calls.filter((c) => !c.mutating)
  const writes = message.calls.filter((c) => c.mutating && !viaReplyAction(c.args))
  const skill = message.agent.startsWith("/")
  const prose = stripReplyActions(message.body)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {skill ? (
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft font-ui text-[10px] font-bold uppercase text-accent-ink"
            aria-hidden
          >
            {message.agent.slice(1, 3)}
          </span>
        ) : (
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full bg-rail text-[--rail-active-icon]"
            aria-hidden
          >
            <Sparkles className="size-3" />
          </span>
        )}
        <span className={cn("font-ui text-[12.5px] font-semibold text-tk-onyx", skill && "font-mono")}>
          {message.agent}
        </span>
        {turn ? (
          <span
            className={cn(
              "rounded-md border px-1.5 py-0.5 font-mono text-[10.5px]",
              modelPool(turn.model) === "other"
                ? "border-transparent bg-warn-soft text-warn"
                : "border-line bg-card text-ink-3"
            )}
          >
            {modelLabel(turn.model)}
          </span>
        ) : null}
        <span className="font-ui text-[10.5px] text-ink-3">{timeLabel(message.createdAt)}</span>
      </div>

      {reads.length ? (
        <div className="flex flex-wrap gap-1.5 pl-8">
          {reads.map((call) => (
            <ReadChip key={call.id} call={call} />
          ))}
        </div>
      ) : null}

      {prose ? (
        <div className="max-w-[66ch] pl-8 text-[14.5px] leading-[1.6] text-tk-onyx">
          <Prose text={prose} />
        </div>
      ) : null}

      <ReplyActions
        messageId={message.id}
        body={message.body}
        context={message.actionsContext}
        calls={message.calls}
      />

      {writes.filter((c) => c.status === "pending").length > 1 ? (
        <BulkDecide callIds={writes.filter((c) => c.status === "pending").map((c) => c.id)} />
      ) : null}

      {writes.map((call) => (
        <ApprovalCard key={call.id} call={call} />
      ))}

      {message.chain.length ? <LadderTrace turns={message.chain} /> : null}

      {message.agent !== "Assistant" && !skill ? <Feedback message={message} /> : null}
    </div>
  )
}

/**
 * What Karol thought of a desk's reply — the cheapest signal `/train` gets.
 * Quiet until hovered, like the timestamp; once given it stays as a chip so
 * the thread reads as a record. "Not right" asks for one line on why.
 */
/**
 * What Karol pasted, above what he typed. The width and height are the
 * stored image's, so the box is the right shape before a byte arrives;
 * a click opens the full image in a tab.
 */
function Screenshots({ attachments }: { attachments: ChatMessageView["attachments"] }) {
  if (attachments.length === 0) return null
  const one = attachments.length === 1
  return (
    <div className="flex max-w-[72%] flex-wrap justify-end gap-1.5">
      {attachments.map((a) => (
        <a
          key={a.id}
          href={attachmentPath(a.id)}
          target="_blank"
          rel="noopener"
          title={a.name}
          className="block max-w-full overflow-hidden rounded-[14px] border border-line bg-well outline-accent-ink"
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
    <div className="group/fb flex flex-wrap items-center gap-1.5 pl-8">
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
    <div className="ml-8 flex max-w-[36rem] flex-wrap items-center gap-2 rounded-xl border border-line bg-well px-3 py-2">
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
        "inline-flex h-6 items-center gap-1.5 rounded-lg border border-line bg-card pl-[7px] pr-[9px] font-mono text-[11px] tracking-[-0.01em]",
        failed ? "text-bad" : "text-ink-2"
      )}
      title={failed ? call.error : undefined}
    >
      {failed ? (
        <X className="size-3" aria-hidden />
      ) : call.status === "ran" ? (
        <Check className="size-3 text-good" aria-hidden />
      ) : (
        <Terminal className="size-3 text-ink-3" aria-hidden />
      )}
      {call.name}
      {count != null ? <span className="text-ink-3">· {count}</span> : null}
      {failed ? <span>· failed</span> : null}
    </span>
  )
}
