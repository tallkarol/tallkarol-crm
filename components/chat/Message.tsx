"use client"

import { Check, Sparkles, Terminal, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { modelLabel, modelPool, resultCount, timeLabel } from "@/lib/chat/format"
import { parseCommand } from "@/lib/chat/skills"
import { ApprovalCard } from "@/components/chat/ApprovalCard"
import { LadderTrace } from "@/components/chat/LadderTrace"
import { Prose } from "@/components/chat/Prose"
import type { ChatMessageView } from "@/components/chat/types"
import type { ChatToolCall } from "@/db/schema"

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
    return (
      <div className="group flex flex-col items-end gap-1.5">
        <div className="max-w-[72%] whitespace-pre-wrap rounded-[18px] rounded-br-[6px] bg-accent-soft px-3.5 py-2.5 text-[14.5px] leading-[1.5] text-tk-onyx [overflow-wrap:anywhere]">
          {command ? (
            <span className="font-mono text-[13px]">
              <span className="text-accent-ink">/{command.name}</span>
              {command.args ? ` ${command.args}` : ""}
            </span>
          ) : (
            message.body
          )}
        </div>
        <span className="pr-1 font-ui text-[10.5px] text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
          {timeLabel(message.createdAt)}
        </span>
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
  const writes = message.calls.filter((c) => c.mutating)
  const skill = message.agent.startsWith("/")

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

      {message.body.trim() ? (
        <div className="max-w-[66ch] pl-8 text-[14.5px] leading-[1.6] text-tk-onyx">
          <Prose text={message.body} />
        </div>
      ) : null}

      {writes.map((call) => (
        <ApprovalCard key={call.id} call={call} />
      ))}

      {message.chain.length ? <LadderTrace turns={message.chain} /> : null}
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
