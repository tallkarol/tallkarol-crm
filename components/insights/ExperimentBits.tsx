"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
  captureReadingAction,
  setExperimentOutcomeAction,
} from "@/lib/experiments/actions"
import { cn } from "@/lib/cn"

/**
 * Freeze one checkpoint. Disabled until its window has elapsed, so the button
 * cannot quietly record a half-finished month.
 */
export function CaptureReading({
  siteSlug,
  experimentSlug,
  checkpoint,
  label,
  ready,
  captured,
  windowTo,
}: {
  siteSlug: string
  experimentSlug: string
  checkpoint: string
  label: string
  ready: boolean
  captured: boolean
  windowTo: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function run() {
    setError(null)
    startTransition(async () => {
      const result = await captureReadingAction(siteSlug, experimentSlug, checkpoint)
      if (result.ok) router.refresh()
      else setError(result.error)
    })
  }

  if (!ready) {
    return (
      <span className="text-[11px] text-tk-slate/45" title={`Window closes ${windowTo}`}>
        opens {windowTo}
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className={cn(
          "rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
          captured
            ? "border border-tk-slate/20 bg-white text-tk-slate hover:border-tk-teal hover:text-tk-teal"
            : "bg-tk-teal text-tk-linen hover:bg-tk-teal/90"
        )}
      >
        {pending ? "Reading…" : captured ? "Re-capture" : `Capture ${label}`}
      </button>
      {error ? <span className="text-[11px] text-[#A62228]">{error}</span> : null}
    </span>
  )
}

/** Close an experiment out, or put it back to running. */
export function ExperimentOutcome({
  siteSlug,
  experimentSlug,
  status,
  verdict,
}: {
  siteSlug: string
  experimentSlug: string
  status: string
  verdict: string
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function set(nextStatus: string, nextVerdict: string) {
    setError(null)
    startTransition(async () => {
      const result = await setExperimentOutcomeAction(
        siteSlug,
        experimentSlug,
        nextStatus,
        nextVerdict
      )
      if (result.ok) router.refresh()
      else setError(result.error)
    })
  }

  const options: { label: string; status: string; verdict: string }[] =
    status === "running"
      ? [
          { label: "Supported", status: "concluded", verdict: "supported" },
          { label: "Refuted", status: "concluded", verdict: "refuted" },
          { label: "Inconclusive", status: "concluded", verdict: "inconclusive" },
        ]
      : [{ label: "Reopen", status: "running", verdict: "" }]

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "running" ? (
        <span className="text-[11px] text-tk-slate/55">Call it:</span>
      ) : null}
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => set(option.status, option.verdict)}
          disabled={pending}
          className={cn(
            "rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
            verdict === option.verdict && status !== "running"
              ? "border-tk-teal bg-tk-teal/10 text-tk-teal"
              : "border-tk-slate/20 bg-white text-tk-slate hover:border-tk-teal hover:text-tk-teal"
          )}
        >
          {option.label}
        </button>
      ))}
      {error ? <span className="text-[11px] text-[#A62228]">{error}</span> : null}
    </div>
  )
}
