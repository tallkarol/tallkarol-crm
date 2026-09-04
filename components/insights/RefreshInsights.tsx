"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { refreshInsightsAction } from "@/lib/insights/actions"
import { cn } from "@/lib/cn"

/**
 * The one button that talks to Google. Everything else on the hub reads the
 * snapshot it writes.
 */
export function RefreshInsights({
  slug,
  refreshedAt,
  label = "Refresh",
  primary = false,
}: {
  slug: string
  refreshedAt: string | null
  label?: string
  primary?: boolean
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run() {
    setError(null)
    startTransition(async () => {
      const result = await refreshInsightsAction(slug)
      if (result.ok) router.refresh()
      else setError(result.error)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {refreshedAt ? (
        <p className="text-xs text-ink-3">
          Fetched{" "}
          {new Date(refreshedAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      ) : null}
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={cn(
          "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
          primary
            ? "bg-accent text-tk-linen hover:bg-tk-teal/90"
            : "border border-line bg-card text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
        )}
      >
        {pending ? "Fetching…" : label}
      </button>
      {error ? <p className="max-w-xs text-xs text-bad">{error}</p> : null}
    </div>
  )
}
