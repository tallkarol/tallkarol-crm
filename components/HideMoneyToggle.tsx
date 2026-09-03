"use client"

import { useState, useTransition } from "react"
import { Eye, EyeOff } from "lucide-react"
import { setHideMoney } from "@/app/(admin)/settings/actions"
import { cn } from "@/lib/cn"

/**
 * Demo mode switch. The cookie changes what the server renders and what the
 * inline script tells the browser, and neither refreshes on a soft navigation
 * (scripts do not re-run, chart formatters are closed over), so a successful
 * flip reloads the page outright. Lives in the onyx rail, hence rail tokens.
 */
export function HideMoneyToggle({
  initial,
  collapsed,
}: {
  initial: boolean
  collapsed?: boolean
}) {
  const [on, setOn] = useState(initial)
  const [pending, start] = useTransition()

  function flip() {
    const next = !on
    setOn(next)
    start(async () => {
      const result = await setHideMoney(next)
      if (!result.ok) {
        setOn(!next)
        return
      }
      window.location.reload()
    })
  }

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={flip}
        disabled={pending}
        aria-pressed={on}
        title={on ? "Amounts hidden — show them" : "Hide amounts (demo mode)"}
        className={cn(
          "flex size-8 items-center justify-center rounded-lg disabled:opacity-60",
          on
            ? "bg-tk-teal text-tk-linen"
            : "text-rail-ink/60 hover:bg-rail-ink/[0.06] hover:text-rail-ink"
        )}
      >
        {on ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        <span className="sr-only">{on ? "Show amounts" : "Hide amounts"}</span>
      </button>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 text-xs text-rail-ink/70">
        {on ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
        Hide amounts
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Hide amounts (demo mode)"
        disabled={pending}
        onClick={flip}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60",
          on ? "bg-tk-teal" : "bg-rail-ink/25"
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            on && "translate-x-4"
          )}
          style={{ background: "#fff" }}
        />
      </button>
    </div>
  )
}
