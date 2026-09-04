"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { generateArchiveAction, markReportFiledAction } from "@/lib/insights/actions"
import { cn } from "@/lib/cn"

const SECTIONS = [
  { id: "trend", label: "Traffic & trend" },
  { id: "search", label: "Search queries & positions" },
  { id: "pages", label: "Top pages" },
  { id: "conversions", label: "Conversions & attribution" },
] as const

/**
 * Freezes the chosen month from the cached snapshot (no Google calls) and
 * opens the print-ready report with the picked sections.
 */
export function ReportBuilder({
  slug,
  months,
  isHouse,
}: {
  slug: string
  months: { period: string; label: string }[]
  isHouse: boolean
}) {
  const router = useRouter()
  const [period, setPeriod] = useState(months[0]?.period ?? "")
  const [on, setOn] = useState<Record<string, boolean>>({
    trend: true,
    search: true,
    pages: true,
    conversions: isHouse,
  })
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const sections = SECTIONS.filter((s) => s.id !== "conversions" || isHouse)

  function generate() {
    setError(null)
    startTransition(async () => {
      const result = await generateArchiveAction(slug, period)
      if (!result.ok) {
        setError(result.error)
        return
      }
      const picked = sections.filter((s) => on[s.id]).map((s) => s.id)
      router.push(
        `/insights-report/${slug}?period=${period}&sections=${picked.join(",")}`
      )
    })
  }

  if (months.length === 0) {
    return (
      <p className="px-5 py-5 text-sm text-ink-3">
        Fetch a snapshot first — reports are frozen from cached data.
      </p>
    )
  }

  return (
    <div className="px-5 py-4">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        Period
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="mt-1.5 block w-full rounded-lg border border-line bg-card px-3 py-2 text-sm font-medium normal-case tracking-normal text-tk-onyx"
        >
          {months.map((m) => (
            <option key={m.period} value={m.period}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="mt-3.5">
        <legend className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">
          Sections
        </legend>
        <div className="mt-1.5 space-y-1">
          {sections.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 text-sm text-tk-onyx">
              <input
                type="checkbox"
                checked={Boolean(on[s.id])}
                onChange={(e) => setOn((cur) => ({ ...cur, [s.id]: e.target.checked }))}
                className="h-3.5 w-3.5 accent-tk-teal"
              />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <button
        type="button"
        onClick={generate}
        disabled={pending || !period}
        className="mt-4 w-full rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90 disabled:opacity-50"
      >
        {pending ? "Freezing snapshot…" : "Generate report"}
      </button>
      {error ? <p className="mt-2 text-xs text-bad">{error}</p> : null}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        Freezes the month — daily numbers from the snapshot, tables fetched for
        that month&rsquo;s exact dates — then opens the branded print page. Use
        the browser&rsquo;s Save as PDF from there. Safe to regenerate.
      </p>
    </div>
  )
}

export function MarkFiled({ archiveId, filed }: { archiveId: string; filed: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  if (filed) return null
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markReportFiledAction(archiveId)
          router.refresh()
        })
      }
      className={cn(
        "rounded-md border border-line bg-card px-2 py-1 text-[10.5px] font-semibold text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal",
        pending && "opacity-50"
      )}
    >
      Mark sent
    </button>
  )
}
