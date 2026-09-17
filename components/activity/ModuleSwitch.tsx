"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toggleActivityModule } from "@/lib/activity/actions"
import { cn } from "@/lib/cn"

export function ModuleSwitch({ moduleKey, label, on, available }: { moduleKey: string; label: string; on: boolean; available: boolean }) {
  const router = useRouter()
  const [checked, setChecked] = useState(on)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={`${label} module`}
        disabled={!available || pending}
        title={available ? undefined : "Not built yet"}
        onClick={() => {
          const next = !checked
          setChecked(next)
          setError(null)
          start(async () => {
            const result = await toggleActivityModule(moduleKey, next)
            if (!result.ok) {
              setChecked(!next)
              setError(result.error)
              return
            }
            router.refresh()
          })
        }}
        className={cn(
          "relative h-5 w-[34px] shrink-0 rounded-full transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-accent-mark" : "bg-line-strong"
        )}
      >
        <span
          className={cn(
            "absolute left-[3px] top-[3px] size-3.5 rounded-full bg-card shadow-card transition-transform motion-reduce:transition-none",
            checked && "translate-x-3.5"
          )}
        />
      </button>
      {error ? <span className="font-ui text-[11px] font-semibold text-bad">{error}</span> : null}
    </span>
  )
}
