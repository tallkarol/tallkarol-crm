"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { Card } from "@/components/ui/Card"

/**
 * A year switcher and a client select — not nine pills. Pills are for the two
 * or three things you flip between constantly; a dormant account list is a
 * dropdown.
 */
export function SheetFilters({
  years,
  year,
  clients,
  clientSlug,
  showSettled,
  summary,
}: {
  years: string[]
  year: string
  clients: { slug: string; name: string }[]
  clientSlug: string
  showSettled: boolean
  summary: string
}) {
  const router = useRouter()

  function href(next: Partial<{ year: string; client: string; show: string }>) {
    const search = new URLSearchParams()
    const merged = {
      year,
      client: clientSlug,
      show: showSettled ? "all" : "",
      ...next,
    }
    if (merged.year) search.set("year", merged.year)
    if (merged.client) search.set("client", merged.client)
    if (merged.show) search.set("show", merged.show)
    const query = search.toString()
    return query ? `${ROUTES.timesheetSheets}?${query}` : ROUTES.timesheetSheets
  }

  const options = [...years]
  if (!options.includes(year) && year !== "all") options.unshift(year)

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      <Card radius="lg" elevation="none" className="flex overflow-hidden" role="group" aria-label="Year">
        {options.slice(0, 4).map((option) => (
          <Link
            key={option}
            href={href({ year: option })}
            aria-current={year === option ? "true" : undefined}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold transition-colors",
              year === option
                ? "bg-accent text-tk-linen"
                : "text-ink-3 hover:text-tk-onyx"
            )}
          >
            {option}
          </Link>
        ))}
        <Link
          href={href({ year: "all" })}
          aria-current={year === "all" ? "true" : undefined}
          className={cn(
            "px-3 py-1.5 text-xs font-semibold transition-colors",
            year === "all"
              ? "bg-accent text-tk-linen"
              : "text-ink-3 hover:text-tk-onyx"
          )}
        >
          All
        </Link>
      </Card>

      <select
        value={clientSlug}
        onChange={(event) => router.push(href({ client: event.target.value }))}
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

      <Link
        href={href({ show: showSettled ? "" : "all" })}
        className={cn(
          "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
          showSettled
            ? "border-tk-teal bg-tk-teal/10 text-tk-teal"
            : "border-line bg-card text-ink-3 hover:text-tk-onyx"
        )}
      >
        {showSettled ? "Hiding nothing" : "Hiding paid"}
      </Link>

      <p className="ml-auto font-mono text-xs tabular-nums text-ink-3">
        {summary}
      </p>
    </div>
  )
}
