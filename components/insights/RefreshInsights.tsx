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
        <p className="text-xs text-tk-slate/55">
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
            ? "bg-tk-teal text-tk-linen hover:bg-tk-teal/90"
            : "border border-tk-slate/20 bg-white text-tk-slate hover:border-tk-teal hover:text-tk-teal"
        )}
      >
        {pending ? "Fetching…" : label}
      </button>
      {error ? <p className="max-w-xs text-xs text-[#A62228]">{error}</p> : null}
    </div>
  )
}
