"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"
import { monthLong, monthsOfYear, yearOf } from "@/lib/timesheet"

/**
 * Two clicks to any month, instead of twelve taps on an arrow. Months with no
 * entries are dimmed, and the steppers skip straight over them.
 */
export function MonthPicker({
  clientSlug,
  month,
  monthsWithData,
}: {
  clientSlug: string
  month: string
  monthsWithData: string[]
}) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => yearOf(month))
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onAway(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onAway)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onAway)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const has = new Set(monthsWithData)
  const sorted = [...monthsWithData].sort()
  const prev = sorted.filter((m) => m < month).pop() ?? null
  const next = sorted.find((m) => m > month) ?? null
  const years = Array.from(
    new Set([...sorted.map(yearOf), yearOf(month), year])
  ).sort((a, b) => b - a)

  return (
    <div className="relative flex items-center gap-1" ref={box}>
      <Stepper
        href={prev ? ROUTES.timesheetFor(clientSlug, prev) : null}
        label="Previous month with entries"
      >
        <ChevronLeft className="size-4" />
      </Stepper>

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex min-w-[9.5rem] items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-tk-onyx hover:bg-white"
      >
        {monthLong(month)}
        <ChevronDown className="size-3.5 text-tk-slate/50" />
      </button>

      <Stepper
        href={next ? ROUTES.timesheetFor(clientSlug, next) : null}
        label="Next month with entries"
      >
        <ChevronRight className="size-4" />
      </Stepper>

      {open ? (
        <div
          role="dialog"
          aria-label="Pick a month"
          className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-tk-slate/15 bg-white p-3 shadow-lg"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setYear((y) => y - 1)}
              aria-label="Previous year"
              className="flex size-7 items-center justify-center rounded-md text-tk-slate hover:bg-tk-linen"
            >
              <ChevronLeft className="size-4" />
            </button>
            <select
              value={year}
              onChange={(event) => setYear(Number(event.target.value))}
              aria-label="Year"
              className="rounded-md border border-tk-slate/20 px-2 py-1 text-xs font-semibold text-tk-onyx outline-none focus:border-tk-teal"
            >
              {years.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setYear((y) => y + 1)}
              aria-label="Next year"
              className="flex size-7 items-center justify-center rounded-md text-tk-slate hover:bg-tk-linen"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1">
            {monthsOfYear(year).map((option) => {
              const current = option.key === month
              const filled = has.has(option.key)
              return (
                <Link
                  key={option.key}
                  href={ROUTES.timesheetFor(clientSlug, option.key)}
                  onClick={() => setOpen(false)}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "rounded-md px-2 py-2 text-center text-xs font-semibold transition-colors",
                    current
                      ? "bg-tk-teal text-tk-linen"
                      : filled
                        ? "text-tk-onyx hover:bg-tk-linen"
                        : "text-tk-slate/35 hover:bg-tk-linen/60"
                  )}
                >
                  {option.label}
                </Link>
              )
            })}
          </div>

          <p className="mt-2 text-[11px] text-tk-slate/50">
            Dimmed months have no entries.
          </p>
        </div>
      ) : null}
    </div>
  )
}

function Stepper({
  href,
  label,
  children,
}: {
  href: string | null
  label: string
  children: React.ReactNode
}) {
  if (!href) {
    return (
      <span
        aria-hidden
        className="flex size-8 items-center justify-center rounded-lg text-tk-slate/20"
      >
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-lg text-tk-slate hover:bg-white hover:text-tk-onyx"
    >
      {children}
    </Link>
  )
}
