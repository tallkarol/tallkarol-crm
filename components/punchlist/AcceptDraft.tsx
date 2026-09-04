"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

type ActionResult = { ok: boolean; error?: string }

/** A draft's one primary action: make the tasks and open the list. */
export function AcceptDraftButton({
  count,
  action,
}: {
  count: number
  action: () => Promise<ActionResult>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await action()
            if (!result.ok) {
              setError(result.error ?? "Could not accept the draft.")
              return
            }
            router.refresh()
          })
        }
        className="rounded-full bg-accent px-3.5 py-1.5 text-[12px] font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90 disabled:opacity-50"
      >
        {pending ? "Creating tasks…" : `Accept — create ${count} ${count === 1 ? "task" : "tasks"}`}
      </button>
      {error ? <span className="text-xs font-semibold text-red-700">{error}</span> : null}
    </span>
  )
}
