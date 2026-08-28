"use client"

import { useState, useTransition } from "react"
import { Badge } from "@/components/work/Badge"
import type { DomainTriage as Row } from "@/lib/meetings"
import { assignDomainToClient, ignoreDomain } from "@/lib/meetings-actions"

function when(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })
}

export function DomainTriage({
  rows,
  clients,
}: {
  rows: Row[]
  clients: { slug: string; name: string }[]
}) {
  const [resolved, setResolved] = useState<Record<string, string>>({})
  const [openDomain, setOpenDomain] = useState<string | null>(null)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const open = rows.filter((row) => !resolved[row.domain])
  if (open.length === 0) return null

  function assign(domain: string) {
    const slug = choice[domain]
    if (!slug) {
      setError("Pick a client first.")
      return
    }
    setError(null)
    setBusy(domain)
    startTransition(async () => {
      const result = await assignDomainToClient(domain, slug)
      setBusy(null)
      if (result.ok) {
        const name = clients.find((c) => c.slug === slug)?.name ?? slug
        setResolved((r) => ({ ...r, [domain]: name }))
      } else setError(result.error)
    })
  }

  function reject(domain: string) {
    setError(null)
    setBusy(domain)
    startTransition(async () => {
      const result = await ignoreDomain(domain)
      setBusy(null)
      if (result.ok) setResolved((r) => ({ ...r, [domain]: "ignored" }))
      else setError(result.error)
    })
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold text-tk-onyx">
        Meeting time with no client
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-tk-slate/70">
        These domains show up on meetings but match no client. Assign one and its
        meetings become billable straight away.
      </p>

      {error ? (
        <p className="mt-3 rounded-2xl border border-tk-slate/15 bg-white px-4 py-2.5 text-sm text-tk-slate shadow-sm">
          {error}
        </p>
      ) : null}

      <ul className="mt-3 space-y-3">
        {open.map((row) => {
          const expanded = openDomain === row.domain
          return (
            <li
              key={row.domain}
              className="overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-tk-onyx">{row.domain}</p>
                    <Badge tone="neutral">
                      {row.hours} hr · {row.meetingCount} meetings
                    </Badge>
                  </div>
                  {row.people.length ? (
                    <p className="mt-1 truncate text-sm text-tk-slate/70">
                      {row.people.join(", ")}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setOpenDomain(expanded ? null : row.domain)}
                    className="mt-1 text-xs font-semibold text-tk-teal hover:underline"
                  >
                    {expanded ? "Hide meetings" : `Show ${row.meetings.length} meetings`}
                  </button>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <select
                    value={choice[row.domain] ?? ""}
                    onChange={(e) =>
                      setChoice((c) => ({ ...c, [row.domain]: e.target.value }))
                    }
                    className="rounded-xl border border-tk-slate/20 bg-white px-3 py-1.5 text-xs text-tk-onyx outline-none focus:border-tk-teal"
                  >
                    <option value="">Assign to…</option>
                    {clients.map((c) => (
                      <option key={c.slug} value={c.slug}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy === row.domain}
                    onClick={() => assign(row.domain)}
                    className="rounded-full bg-tk-teal px-3 py-1.5 text-xs font-semibold text-tk-linen disabled:opacity-50"
                  >
                    {busy === row.domain ? "Saving…" : "Assign"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === row.domain}
                    onClick={() => reject(row.domain)}
                    className="rounded-full border border-tk-slate/20 px-3 py-1.5 text-xs font-semibold text-tk-slate/70 hover:border-tk-slate/50 disabled:opacity-50"
                  >
                    Not a client
                  </button>
                </div>
              </div>

              {expanded ? (
                <ul className="divide-y divide-tk-slate/10 border-t border-tk-slate/10 bg-tk-linen/30">
                  {row.meetings.map((m) => (
                    <li key={m.id} className="px-5 py-2.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm text-tk-onyx">{m.title}</p>
                        <p className="text-xs tabular-nums text-tk-slate/60">
                          {when(m.startsAt)} · {m.hours.toFixed(2)} hr
                        </p>
                      </div>
                      {m.otherDomains.length ? (
                        <p className="mt-0.5 text-xs text-tk-slate/55">
                          also in the room: {m.otherDomains.join(", ")}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>

      {Object.keys(resolved).length ? (
        <p className="mt-3 text-xs text-tk-slate/60">
          {Object.entries(resolved)
            .map(([d, to]) =>
              to === "ignored" ? `${d} → not a client` : `${d} → ${to}`
            )
            .join(" · ")}
          . Reload to pull their meetings into the inbox.
        </p>
      ) : null}
    </section>
  )
}
