"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { addWorkstreamAction } from "@/app/(admin)/delivery/actions"
import { draftDeliverableInvoice } from "@/app/(admin)/projects/actions"
import { cn } from "@/lib/cn"

/** Add a workstream without leaving the modal. Collapsed until you need it. */
export function AddWorkstream({ projectId }: { projectId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    const value = title.trim()
    if (!value) {
      setOpen(false)
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await addWorkstreamAction(projectId, value)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setTitle("")
      setOpen(false)
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] font-semibold text-tk-teal hover:underline"
      >
        + Add
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        autoFocus
        value={title}
        disabled={pending}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit()
          if (e.key === "Escape") {
            setTitle("")
            setOpen(false)
          }
        }}
        placeholder="Workstream title…"
        aria-label="New workstream title"
        className="w-40 rounded-md border border-line bg-card px-2 py-1 text-[11.5px] outline-none focus:border-tk-teal"
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-full bg-accent px-2.5 py-1 text-[10.5px] font-semibold text-tk-linen disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add"}
      </button>
      {error ? <span className="text-[10.5px] text-bad">{error}</span> : null}
    </span>
  )
}

/**
 * Drafts the invoice for a finished deliverable — the action the ledger's
 * "done, not invoiced" flag exists to prompt.
 */
export function DeliverableInvoiceButton({ deliverableId }: { deliverableId: string }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      title={error ?? "Draft the invoice for this deliverable"}
      onClick={() =>
        startTransition(async () => {
          setError(null)
          try {
            await draftDeliverableInvoice(deliverableId)
            router.refresh()
          } catch {
            setError("Couldn't draft it.")
          }
        })
      }
      className={cn(
        "inline-flex h-[21px] shrink-0 items-center rounded-full px-2 text-[10.5px] font-semibold",
        error
          ? "bg-card text-bad ring-1 ring-transparent"
          : "bg-warn text-canvas hover:brightness-110",
        pending && "opacity-60"
      )}
    >
      {pending ? "Drafting…" : error ? "Failed" : "Draft invoice"}
    </button>
  )
}
