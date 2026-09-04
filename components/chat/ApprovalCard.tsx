"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, Check, X } from "lucide-react"
import { decideApproval } from "@/lib/chat/actions"
import type { ChatToolCall } from "@/db/schema"
import type { ToolPreview } from "@/lib/chat/tools"

const VERB: Record<string, string> = {
  log_time: "Log this time",
  create_task: "File this task",
  refresh_insights: "Refresh this site",
}

/**
 * The gate. Nothing the chat proposes touches a table until this is clicked.
 *
 * The preview is built by the same tool that performs the write, from the
 * same arguments, so what is shown here is what lands — the card cannot
 * describe one entry and file another.
 */
export function ApprovalCard({ call }: { call: ChatToolCall }) {
  const router = useRouter()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const preview = call.preview as ToolPreview | null
  const settled = call.status !== "pending"

  function decide(approve: boolean) {
    setError(null)
    startTransition(async () => {
      const result = await decideApproval({ callId: call.id, approve })
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-line bg-well shadow-card">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <AlertTriangle className="size-3.5 text-warn" />
        <span className="text-xs font-semibold text-tk-onyx">
          {preview?.title ?? call.name}
        </span>
        <span className="ml-auto font-mono text-[10.5px] uppercase tracking-wide text-ink-3">
          {call.status}
        </span>
      </div>

      <dl className="divide-y divide-line">
        {(preview?.fields ?? []).map((field) => (
          <div key={field.label} className="flex gap-3 px-4 py-2 text-xs">
            <dt className="w-20 shrink-0 text-ink-3">{field.label}</dt>
            <dd className="min-w-0 flex-1 text-tk-slate">{field.value}</dd>
          </div>
        ))}
      </dl>

      {preview?.note ? (
        <p className="border-t border-line px-4 py-2 text-[11px] text-ink-3">
          {preview.note}
        </p>
      ) : null}

      {call.error ? (
        <p className="border-t border-line bg-bad-soft px-4 py-2 text-[11px] text-bad">
          {call.error}
        </p>
      ) : null}

      {error ? (
        <p className="border-t border-line bg-bad-soft px-4 py-2 text-[11px] text-bad">
          {error}
        </p>
      ) : null}

      {!settled ? (
        <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-on-accent outline-accent-ink disabled:opacity-60"
          >
            <Check className="size-3.5" />
            {VERB[call.name] ?? "Confirm"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-tk-slate outline-accent-ink disabled:opacity-60"
          >
            <X className="size-3.5" />
            Discard
          </button>
        </div>
      ) : null}
    </div>
  )
}
