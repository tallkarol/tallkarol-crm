"use client"

import { useState, useTransition } from "react"
import { saveClientColor } from "@/app/(admin)/settings/colors/actions"
import { clientColor, isHexColor } from "@/lib/client-colors"

type Row = { name: string; slug: string }
type Group = { label: string; rows: Row[] }

export function ColorGrid({
  groups,
  overrides,
  defaults,
}: {
  groups: Group[]
  overrides: Record<string, string>
  defaults: Record<string, string>
}) {
  return (
    <div className="mt-6 space-y-8">
      {groups.map((group) => (
        <section key={group.label}>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">
            {group.label}
          </h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {group.rows.map((row) => (
              <ColorRow
                key={row.slug}
                row={row}
                override={overrides[row.slug] ?? null}
                fallback={defaults[row.slug] ?? clientColor(row.slug)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function ColorRow({
  row,
  override,
  fallback,
}: {
  row: Row
  override: string | null
  fallback: string
}) {
  const [value, setValue] = useState(override ?? fallback)
  const [saved, setSaved] = useState(override)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const dirty = (saved ?? fallback).toLowerCase() !== value.toLowerCase()
  const isDefault = saved === null

  function commit(next: string) {
    setError(null)
    startTransition(async () => {
      const result = await saveClientColor(row.slug, next)
      if (result.ok) setSaved(next.trim() || null)
      else setError(result.error)
    })
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-card px-3 py-2.5 shadow-card">
      {/* The native picker is the whole swatch — no library, and it is the
          control people already know from every other Mac app. */}
      <label className="relative shrink-0 cursor-pointer">
        <span
          className="block h-8 w-8 rounded-lg ring-1 ring-inset ring-line"
          style={{ background: isHexColor(value) ? value : fallback }}
        />
        <input
          type="color"
          value={isHexColor(value) ? value : fallback}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label={`Colour for ${row.name}`}
        />
      </label>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-tk-onyx">{row.name}</div>
        <div className="flex items-center gap-2">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            spellCheck={false}
            className="w-24 bg-transparent font-mono text-xs text-ink-3 outline-none focus:text-tk-onyx"
          />
          {pending && <span className="text-[11px] text-ink-3">saving…</span>}
          {!pending && dirty && <span className="text-[11px] text-ink-3">unsaved</span>}
          {!pending && !dirty && isDefault && (
            <span className="text-[11px] text-ink-3">default</span>
          )}
        </div>
        {error && <div className="text-[11px] text-bad">{error}</div>}
      </div>

      {!isDefault && (
        <button
          type="button"
          onClick={() => {
            setValue(fallback)
            commit("")
          }}
          className="shrink-0 text-[11px] font-medium text-ink-3 hover:text-tk-onyx"
        >
          Reset
        </button>
      )}
    </div>
  )
}
