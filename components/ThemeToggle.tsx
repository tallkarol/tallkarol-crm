"use client"

import { useState, useTransition } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { setTheme } from "@/app/(admin)/settings/actions"
import { cn } from "@/lib/cn"
import { applyTheme, type Theme } from "@/lib/theme"

const OPTIONS: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "Match system", Icon: Monitor },
]

/**
 * Appearance switch in the rail footer. Applies to the document at once and
 * persists in the cookie the admin layout reads on the next request, so
 * there is no reload and no flash either way. See lib/theme.ts.
 */
export function ThemeToggle({
  initial,
  collapsed,
}: {
  initial: Theme
  collapsed?: boolean
}) {
  const [theme, setCurrent] = useState<Theme>(initial)
  const [, start] = useTransition()

  function choose(next: Theme) {
    const previous = theme
    setCurrent(next)
    applyTheme(next)
    start(async () => {
      const result = await setTheme(next)
      if (!result.ok) {
        setCurrent(previous)
        applyTheme(previous)
      }
    })
  }

  if (collapsed) {
    const current = OPTIONS.find((o) => o.id === theme) ?? OPTIONS[2]
    const next = OPTIONS[(OPTIONS.findIndex((o) => o.id === theme) + 1) % OPTIONS.length]
    return (
      <button
        type="button"
        onClick={() => choose(next.id)}
        title={`Appearance: ${current.label}. Switch to ${next.label.toLowerCase()}`}
        className="flex size-8 items-center justify-center rounded-lg text-rail-ink/60 hover:bg-rail-ink/[0.06] hover:text-rail-ink"
      >
        <current.Icon className="size-4" aria-hidden />
        <span className="sr-only">Appearance: {current.label}</span>
      </button>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-rail-ink/70">Appearance</span>
      <span
        role="group"
        aria-label="Appearance"
        className="inline-flex rounded-lg border border-rail-ink/10 bg-rail-ink/[0.06] p-0.5"
      >
        {OPTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={theme === id}
            aria-label={label}
            title={label}
            onClick={() => choose(id)}
            className={cn(
              "grid h-[22px] w-[26px] place-items-center rounded-md transition-colors",
              theme === id
                ? "bg-[--rail-active] text-white"
                : "text-rail-ink/50 hover:text-rail-ink"
            )}
          >
            <Icon className="size-[13px]" aria-hidden />
          </button>
        ))}
      </span>
    </div>
  )
}
