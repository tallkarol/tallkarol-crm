"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CalendarPlus, Check, ExternalLink, ListPlus } from "lucide-react"
import { cn } from "@/lib/cn"
import { runReplyAction } from "@/lib/chat/actions"
import {
  actionDone,
  suggestedActions,
  type ReplyActionContext,
  type ReplyActionKind,
  type SuggestedAction,
} from "@/lib/chat/reply-actions"
import type { ChatToolCall } from "@/db/schema"

const ICON: Record<ReplyActionKind, typeof Check> = {
  complete_task: Check,
  create_task: ListPlus,
  create_calendar_event: CalendarPlus,
  open_workspace: ExternalLink,
}

/**
 * Buttons for the close of a reply — Mark task done, file a follow-up, put a
 * reminder on the calendar, open the workspace. Only kinds the CRM can do
 * appear. A click is the approval.
 */
export function ReplyActions({
  messageId,
  body,
  context,
  calls,
}: {
  messageId: string
  body: string
  context: ReplyActionContext
  calls: ChatToolCall[]
}) {
  const actions = suggestedActions(body, context)
  if (actions.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5 pl-8">
      {actions.map((action) => (
        <ActionButton
          key={action.key}
          messageId={messageId}
          action={action}
          done={actionDone(action, calls)}
        />
      ))}
    </div>
  )
}

function ActionButton({
  messageId,
  action,
  done,
}: {
  messageId: string
  action: SuggestedAction
  done: boolean
}) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [landed, setLanded] = useState(done)
  const Icon = ICON[action.kind]

  if (action.href) {
    return (
      <a
        href={action.href}
        title={action.detail}
        className={buttonClass(false)}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{action.label}</span>
      </a>
    )
  }

  if (landed) {
    return (
      <span className={buttonClass(true)} title={action.detail}>
        <Check className="size-3.5 shrink-0 text-good" aria-hidden />
        {action.kind === "complete_task" ? "Marked done" : "Done"}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col gap-0.5">
      <button
        type="button"
        disabled={busy}
        title={action.detail}
        onClick={() => {
          setError(null)
          startTransition(async () => {
            const result = await runReplyAction({ messageId, key: action.key })
            if (!result.ok) {
              setError(result.error)
              return
            }
            if (result.href) {
              window.location.href = result.href
              return
            }
            setLanded(true)
            router.refresh()
          })
        }}
        className={buttonClass(false)}
      >
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{action.label}</span>
      </button>
      {error ? (
        <span className="font-ui text-[11px] text-bad" role="status">
          {error}
        </span>
      ) : null}
    </span>
  )
}

function buttonClass(done: boolean) {
  return cn(
    "inline-flex h-[30px] max-w-full items-center gap-1.5 rounded-[9px] border px-3 font-ui text-xs font-semibold outline-accent-ink whitespace-nowrap",
    done
      ? "border-line bg-good-soft text-good"
      : "border-line bg-card text-tk-onyx hover:border-line-strong hover:-translate-y-px transition-[transform,border-color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 disabled:opacity-60"
  )
}
