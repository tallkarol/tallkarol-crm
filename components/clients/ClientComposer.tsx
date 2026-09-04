"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { ClientStatus } from "@/db/schema"
import { createClient } from "@/lib/client-hub-actions"
import { ROUTES } from "@/lib/nav"
import { CLIENT_STATUS_LABEL, CLIENT_STATUSES } from "@/lib/work"

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
        className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-tk-teal/90"
      >
        New client
      </button>
    )
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card px-3 py-2 shadow-card"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Client name"
        aria-label="Client name"
        className="w-44 rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal focus:outline-none"
      />
      <label className="sr-only" htmlFor="new-client-status">
        Status
      </label>
      <select
        id="new-client-status"
        value={status}
        onChange={(e) => setStatus(e.target.value as ClientStatus)}
        className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-sm text-tk-onyx focus:border-tk-teal focus:outline-none"
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
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-tk-teal/90 disabled:opacity-50"
      >
        {pending ? "Adding…" : "Add"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false)
          setError(null)
        }}
        className="text-sm font-semibold text-ink-3 hover:text-tk-onyx"
      >
        Cancel
      </button>
      {error ? (
        <p role="status" className="w-full text-xs font-semibold text-bad">
          {error}
        </p>
      ) : null}
    </form>
  )
}
