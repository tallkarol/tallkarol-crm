"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, X } from "lucide-react"
import { ROUTES } from "@/lib/nav"

const SURFACES = [
  { value: "", label: "Every surface" },
  { value: "claude", label: "Claude Code" },
  { value: "cursor", label: "Cursor" },
  { value: "agent", label: "Agent lanes" },
]

const SINCE = [
  { value: "7d", label: "Last 7 days" },
  { value: "14d", label: "Last 14 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "Everything" },
]

/**
 * The same bar as the ledger's, pointed at conversations. Search is a submit
 * rather than a keystroke because it runs a full-text query over every message
 * ever stored — this is a library, not a filter over a page of rows.
 */
export function SessionFilters({
  clients,
  q,
  clientSlug,
  surface,
  since,
  summary,
}: {
  clients: { slug: string; name: string }[]
  q: string
  clientSlug: string
  surface: string
  since: string
  summary: string
}) {
  const router = useRouter()
  const [text, setText] = useState(q)

  useEffect(() => setText(q), [q])

  function push(next: Partial<Record<string, string>>) {
    const search = new URLSearchParams()
    const merged: Record<string, string> = {
      q: text,
      client: clientSlug,
      surface,
      since,
      ...next,
    }
    for (const [key, value] of Object.entries(merged)) {
      if (value && !(key === "since" && value === "7d")) search.set(key, value)
    }
    const query = search.toString()
    router.push(query ? `${ROUTES.timesheetSessions}?${query}` : ROUTES.timesheetSessions)
  }

  const filtered = Boolean(q || clientSlug || surface || (since && since !== "7d"))

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          push({ q: text })
        }}
        className="relative"
      >
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3"
        />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search everything you said…"
          aria-label="Search prompts and replies"
          className="w-72 rounded-lg border border-line bg-card py-1.5 pl-8 pr-3 text-xs text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal"
        />
      </form>

      <select
        value={clientSlug}
        onChange={(event) => push({ client: event.target.value })}
        aria-label="Client"
        className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-slate focus:border-tk-teal"
      >
        <option value="">All clients</option>
        {clients.map((client) => (
          <option key={client.slug} value={client.slug}>
            {client.name}
          </option>
        ))}
      </select>

      <select
        value={surface}
        onChange={(event) => push({ surface: event.target.value })}
        aria-label="Surface"
        className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-slate focus:border-tk-teal"
      >
        {SURFACES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <select
        value={since || "7d"}
        onChange={(event) => push({ since: event.target.value })}
        aria-label="How far back"
        className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-slate focus:border-tk-teal"
      >
        {SINCE.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {filtered ? (
        <button
          type="button"
          onClick={() => router.push(ROUTES.timesheetSessions)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-3 hover:text-tk-onyx"
        >
          <X className="size-3.5" />
          Clear
        </button>
      ) : null}

      <p className="ml-auto font-mono text-xs tabular-nums text-ink-3">{summary}</p>
    </div>
  )
}
