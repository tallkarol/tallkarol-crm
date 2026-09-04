"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"

const SOURCES = [
  { value: "", label: "Any source" },
  { value: "manual", label: "Typed by hand" },
  { value: "clock", label: "From a clock-in" },
  { value: "meeting", label: "From a meeting" },
  { value: "agent", label: "Agent hours" },
]

export function LedgerFilters({
  clients,
  q,
  clientSlug,
  from,
  to,
  source,
  missingSummary,
  summary,
}: {
  clients: { slug: string; name: string }[]
  q: string
  clientSlug: string
  from: string
  to: string
  source: string
  missingSummary: boolean
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
      from,
      to,
      source,
      missing: missingSummary ? "summary" : "",
      ...next,
    }
    for (const [key, value] of Object.entries(merged)) {
      if (value) search.set(key, value)
    }
    const query = search.toString()
    router.push(query ? `${ROUTES.timesheetEntries}?${query}` : ROUTES.timesheetEntries)
  }

  const filtered = Boolean(q || clientSlug || from || to || source || missingSummary)

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
          placeholder="Search summaries…"
          aria-label="Search session highlights"
          className="w-56 rounded-lg border border-line bg-card py-1.5 pl-8 pr-3 text-xs text-tk-onyx outline-none placeholder:text-ink-3 focus:border-tk-teal"
        />
      </form>

      <select
        value={clientSlug}
        onChange={(event) => push({ client: event.target.value })}
        aria-label="Client"
        className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-slate outline-none focus:border-tk-teal"
      >
        <option value="">All clients</option>
        {clients.map((client) => (
          <option key={client.slug} value={client.slug}>
            {client.name}
          </option>
        ))}
      </select>

      <select
        value={source}
        onChange={(event) => push({ source: event.target.value })}
        aria-label="Source"
        className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-semibold text-tk-slate outline-none focus:border-tk-teal"
      >
        {SOURCES.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={from}
          onChange={(event) => push({ from: event.target.value })}
          aria-label="From date"
          className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-tk-slate outline-none focus:border-tk-teal"
        />
        <span className="text-xs text-ink-3">→</span>
        <input
          type="date"
          value={to}
          onChange={(event) => push({ to: event.target.value })}
          aria-label="To date"
          className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs text-tk-slate outline-none focus:border-tk-teal"
        />
      </div>

      <button
        type="button"
        onClick={() => push({ missing: missingSummary ? "" : "summary" })}
        className={cn(
          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
          missingSummary
            ? "border-transparent bg-warn-soft text-warn"
            : "border-line bg-card text-ink-3 hover:text-tk-onyx"
        )}
      >
        No summary
      </button>

      {filtered ? (
        <button
          type="button"
          onClick={() => router.push(ROUTES.timesheetEntries)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-ink-3 hover:text-tk-onyx"
        >
          <X className="size-3.5" />
          Clear
        </button>
      ) : null}

      <p className="ml-auto font-mono text-xs tabular-nums text-ink-3">
        {summary}
      </p>
    </div>
  )
}
