"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus } from "lucide-react"
import type { ClientStatus } from "@/db/schema"
import { createClient } from "@/lib/client-hub-actions"
import { ROUTES } from "@/lib/nav"
import { CLIENT_STATUS_LABEL, CLIENT_STATUSES } from "@/lib/work"

/**
 * "New client" — a 30px control, sized to sit in the Focus row beside the
 * 3 | 1 switch on the roster. Opens into an inline name + status form.
 */
export function ClientComposer() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [status, setStatus] = useState<ClientStatus>("new")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createClient({ name, status })
      if (!result.ok || !result.slug) {
        setError(result.error ?? "Could not add the client.")
        return
      }
      setName("")
      setStatus("new")
      setOpen(false)
      router.push(ROUTES.client(result.slug))
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-card px-2.5 font-ui text-[11px] font-semibold text-tk-onyx hover:bg-well"
      >
        <Plus className="size-3" aria-hidden />
        New client
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line bg-card p-0.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Client name"
        aria-label="Client name"
        className="h-6 w-40 rounded-md border border-line bg-card px-2 font-ui text-[11px] text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal"
      />
      <label className="sr-only" htmlFor="new-client-status">
        Status
      </label>
      <select
        id="new-client-status"
        value={status}
        onChange={(e) => setStatus(e.target.value as ClientStatus)}
        className="h-6 rounded-md border border-line bg-card px-1.5 font-ui text-[11px] text-tk-onyx focus:border-tk-teal"
      >
        {CLIENT_STATUSES.map((id) => (
          <option key={id} value={id}>
            {CLIENT_STATUS_LABEL[id]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending || !name.trim()}
        className="inline-flex h-6 items-center rounded-md bg-tk-onyx px-2 font-ui text-[11px] font-semibold text-tk-linen disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false)
          setError(null)
        }}
        className="inline-flex h-6 items-center rounded-md px-2 font-ui text-[11px] font-semibold text-ink-3 hover:text-tk-onyx"
      >
        Cancel
      </button>
      {error ? (
        <p role="status" className="w-full px-1.5 pb-0.5 text-[11px] font-semibold text-bad">
          {error}
        </p>
      ) : null}
    </form>
  )
}
