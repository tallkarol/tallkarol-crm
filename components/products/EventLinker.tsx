"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card } from "@/components/ui/Card"
import { setEventProductAction } from "@/lib/product-hub-actions"

/**
 * `when` arrives formatted from the server, in the workspace's time zone:
 * formatting here would use the browser's zone while the server rendered in
 * UTC, and the two texts would not hydrate (React #425 on production).
 */
export type LinkerRow = { id: string; title: string; when: string; client?: string | null }

/**
 * Filing the week's events onto the product. Calendar events arrive from
 * Google with no product; this is where one joins it (or leaves it). A
 * product's own events are drawn in its colour on the grid above.
 */
export function EventLinker({
  productId,
  productName,
  mine,
  linkable,
}: {
  productId: string
  productName: string
  mine: LinkerRow[]
  linkable: LinkerRow[]
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function file(eventId: string, next: string | null) {
    setError(null)
    start(async () => {
      const result = await setEventProductAction(eventId, next)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-ui text-[13px] font-bold text-tk-onyx">Events this week</h2>
        {error ? <p className="font-ui text-xs text-bad" role="alert">{error}</p> : null}
      </div>
      <div className="mt-2 grid gap-4 md:grid-cols-2">
        <section aria-label={`On ${productName}`}>
          <p className="font-ui text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">On {productName}</p>
          {mine.length === 0 ? (
            <p className="mt-1.5 text-sm text-ink-3">None yet — add one from the list beside.</p>
          ) : (
            <ul className="mt-1 divide-y divide-line">
              {mine.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-tk-onyx">{e.title}</span>
                    <span className="block font-ui text-[11px] text-ink-3">{e.when}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => file(e.id, null)}
                    className="shrink-0 rounded-full border border-line px-2.5 py-0.5 font-ui text-[11px] font-semibold text-ink-3 hover:border-line-strong hover:text-tk-onyx disabled:opacity-60"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Not on a product">
          <p className="font-ui text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">Not on a product</p>
          {linkable.length === 0 ? (
            <p className="mt-1.5 text-sm text-ink-3">Every event this week is filed.</p>
          ) : (
            <ul className="mt-1 max-h-72 divide-y divide-line overflow-y-auto">
              {linkable.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-tk-onyx">{e.title}</span>
                    <span className="block font-ui text-[11px] text-ink-3">
                      {e.when}
                      {e.client ? ` · ${e.client}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => file(e.id, productId)}
                    className="shrink-0 rounded-full border border-line px-2.5 py-0.5 font-ui text-[11px] font-semibold text-tk-teal hover:border-line-strong disabled:opacity-60"
                  >
                    Add
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Card>
  )
}
