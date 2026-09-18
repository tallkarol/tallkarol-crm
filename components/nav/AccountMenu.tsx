"use client"

import { useEffect, useId, useRef, useState } from "react"
import { HideMoneyToggle } from "@/components/HideMoneyToggle"
import { ThemeToggle } from "@/components/ThemeToggle"
import { logoutAction } from "@/lib/actions"
import { cn } from "@/lib/cn"
import type { Theme } from "@/lib/theme"

/**
 * The avatar at the foot of the dock. Everything the old rail footer carried
 * — hide-money, appearance, sign out — now lives behind one click instead of
 * sitting on the canvas all the time; ThemeToggle and HideMoneyToggle are
 * unchanged, just re-homed, which is why they still read in rail tokens on a
 * popover that is itself rail-2, not a light card like the app's other menus.
 */
export function AccountMenu({
  email,
  hideMoney,
  theme,
  className,
}: {
  email: string
  hideMoney: boolean
  theme: Theme
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const id = useId()
  const initial = email.slice(0, 1).toUpperCase()

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

  return (
    <div className={cn("relative", className)} ref={box}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label="Account and settings"
        title={email}
        onClick={() => setOpen((v) => !v)}
        className="mt-1.5 flex size-8 items-center justify-center rounded-full bg-[--rail-active] font-ui text-xs font-bold text-[--rail-active-icon]"
      >
        {initial}
      </button>
      {open ? (
        // A group, not role="menu": the content is toggles and a sign-out
        // button, not a list of menuitem rows, and mixing role="switch"
        // descendants under role="menu" is an ARIA anti-pattern.
        <div
          id={id}
          role="group"
          aria-label="Account"
          className="absolute bottom-0 left-full z-50 ml-2 w-60 rounded-xl border border-rail-line bg-rail-2 p-3 shadow-overlay"
        >
          <p className="truncate px-0.5 pb-2.5 text-xs text-rail-ink/70">{email}</p>
          <div className="space-y-2.5 border-t border-rail-line pt-2.5">
            <HideMoneyToggle initial={hideMoney} />
            <ThemeToggle initial={theme} />
          </div>
          <div className="mt-2.5 border-t border-rail-line pt-2.5">
            <form action={logoutAction}>
              <button
                type="submit"
                className="w-full rounded-lg px-0.5 py-1 text-left text-xs font-semibold text-rail-ink/70 hover:text-rail-ink hover:underline"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
