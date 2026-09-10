"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { decideApproval } from "@/lib/chat/actions"
import { timeLabel } from "@/lib/chat/format"
import type { ChatToolCall } from "@/db/schema"
import type { ToolPreview } from "@/lib/chat/tools"
import { Card } from "@/components/ui/Card"

const VERB: Record<string, string> = {
  log_time: "Log this time",
  create_task: "File this task",
  refresh_insights: "Refresh this site",
  create_calendar_event: "Add to calendar",
  pin_inspiration: "Pin it",
  sync_inbox: "Sync the inbox",
  archive_inbox_item: "Archive it",
  snooze_inbox_item: "Snooze it",
  assign_inbox_item: "Assign it",
  inbox_to_ticket: "Make a ticket",
  inbox_to_task: "Make a task",
  dismiss_leftoff: "Dismiss it",
  complete_task: "Complete the task",
  reschedule_task: "Reschedule it",
  propose_pack_line: "Write it to the pack",
}

const TAG: Record<ChatToolCall["status"], { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-warn-soft text-warn" },
  approved: { label: "Approved", className: "bg-good-soft text-good" },
  ran: { label: "Confirmed", className: "bg-good-soft text-good" },
  rejected: { label: "Discarded", className: "bg-well text-ink-3" },
  failed: { label: "Failed", className: "bg-bad-soft text-bad" },
  skipped: { label: "Skipped", className: "bg-well text-ink-3" },
}

/**
 * The gate. Nothing the chat proposes touches a table until this is clicked.
 *
 * The preview is built by the same tool that performs the write, from the
 * same arguments, so what is shown here is what lands — the card cannot
 * describe one entry and file another. Once decided the card stays, with
 * its buttons replaced by what happened, so the thread reads as a record.
 */
export function ApprovalCard({ call }: { call: ChatToolCall }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const preview = call.preview as ToolPreview | null
  const pending = call.status === "pending"
  const tag = TAG[call.status]

  function decide(approve: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await decideApproval({ callId: call.id, approve })
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <Card radius="xl" className="ml-8 max-w-[36rem] overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
        <span
          className={cn(
            "size-2 shrink-0 rounded-full",
            pending
              ? "bg-warn"
              : call.status === "ran"
                ? "bg-good"
                : call.status === "failed"
                  ? "bg-bad"
                  : "bg-ink-3"
          )}
          aria-hidden
        />
        <span className="font-ui text-[12.5px] font-bold text-tk-onyx">
          {preview?.title ?? call.name}
        </span>
        <span className="font-mono text-[11px] text-ink-3">{call.name}</span>
        <span
          className={cn(
            "ml-auto rounded-full px-2 py-[3px] font-ui text-[10px] font-bold uppercase tracking-[0.06em]",
            tag.className
          )}
        >
          {tag.label}
        </span>
      </div>

      <dl
        className={cn(
          "grid grid-cols-[5.25rem_minmax(0,1fr)] gap-x-3 gap-y-[7px] px-3.5 py-[11px] text-[12.5px]",
          call.status === "rejected" && "opacity-55"
        )}
      >
        {(preview?.fields ?? []).map((field) => (
          <FieldRow key={field.label} label={field.label} value={field.value} />
        ))}
      </dl>

      {preview?.note ? (
        <p className="border-t border-line px-3.5 py-2 text-[11px] leading-[1.45] text-ink-3">
          {preview.note}
        </p>
      ) : null}

      {call.error ? (
        <p className="border-t border-line bg-bad-soft px-3.5 py-2 text-[11px] text-bad">
          {call.error}
        </p>
      ) : null}

      {error ? (
        <p className="border-t border-line bg-bad-soft px-3.5 py-2 text-[11px] text-bad">
          {error}
        </p>
      ) : null}

      {pending ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line bg-well px-3.5 py-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-[9px] bg-accent px-3 font-ui text-xs font-semibold text-on-accent outline-accent-ink disabled:opacity-60"
          >
            <Check className="size-3.5" aria-hidden />
            {VERB[call.name] ?? "Confirm"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            className="inline-flex h-[30px] items-center gap-1.5 rounded-[9px] border border-line px-3 font-ui text-xs font-semibold text-ink-2 outline-accent-ink hover:border-line-strong hover:text-tk-onyx disabled:opacity-60"
          >
            <X className="size-3.5" aria-hidden />
            Discard
          </button>
          <span className="ml-auto font-ui text-[11px] text-ink-3">
            Same preview the write uses
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-line px-3.5 py-2.5 font-ui text-xs font-medium text-ink-2">
          {call.status === "ran" || call.status === "approved" ? (
            <Check className="size-3.5 text-good" aria-hidden />
          ) : (
            <X className="size-3.5 text-ink-3" aria-hidden />
          )}
          <span>
            {call.status === "ran"
              ? landedLabel(call)
              : call.status === "approved"
                ? approvedLabel(call)
                : call.status === "rejected"
                  ? "Discarded. Nothing was written."
                  : call.status === "failed"
                    ? "The write failed. Nothing landed."
                    : tag.label}
          </span>
        </div>
      )}
    </Card>
  )
}

/** An approved pack line is either waiting for a Mac or held by one — say which, so a hung claim is visible. */
function approvedLabel(call: ChatToolCall): string {
  const claim =
    call.result && typeof call.result === "object"
      ? (call.result as { claimedBy?: string; claimedAt?: string })
      : null
  if (claim?.claimedBy) {
    return `Claimed by ${claim.claimedBy}${claim.claimedAt ? ` · ${timeLabel(new Date(claim.claimedAt))}` : ""} — writing it`
  }
  return "Approved — waiting for the Mac to write it"
}

/** A pack line reports the file and the commit it landed in; every other write just says done. */
function landedLabel(call: ChatToolCall): string {
  const landed =
    call.result && typeof call.result === "object"
      ? (call.result as { file?: string; commit?: string; changed?: boolean })
      : null
  if (landed?.file) {
    if (landed.changed === false) return `Already in ${landed.file}`
    return `Landed in ${landed.file}${landed.commit ? ` · ${landed.commit}` : ""}`
  }
  return `Done${call.decidedAt ? ` · ${timeLabel(call.decidedAt)}` : ""}`
}

function FieldRow({ label, value }: { label: string; value: string }) {
  const short = value.length <= 6 && /^[\d.,]+$/.test(value)
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd
        className={cn(
          "m-0 min-w-0 text-tk-onyx [overflow-wrap:anywhere]",
          short && "font-display text-[15px] font-semibold tabular-nums tracking-[-0.01em]"
        )}
      >
        {value}
      </dd>
    </>
  )
}
