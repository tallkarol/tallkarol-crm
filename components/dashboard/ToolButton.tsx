"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/cn"

/**
 * One 40px icon button in the homepage toolbar. Given `children` it owns an
 * anchored popover (right-aligned under the button; click-away and Escape
 * close it, focus lands on the first field). Without children it is a plain
 * button and `onClick` does the work — the board opener uses that.
 */
export function ToolButton({
  label,
  icon,
  badge,
  dot,
  primary,
  onClick,
  width = 360,
  children,
}: {
  label: string
  icon: ReactNode
  /** Small red count in the corner — the left-off "needs a yes" count. */
  badge?: number
  /** Live dot in the corner — a running clock. */
  dot?: boolean
  primary?: boolean
  onClick?: () => void
  width?: number
  children?: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const id = useId()

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
    const first = box.current?.querySelector<HTMLElement>(
      "[data-autofocus], input, select, textarea, button:not([data-trigger])"
    )
    first?.focus()
    return () => {
      document.removeEventListener("mousedown", onAway)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const close = () => setOpen(false)

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        data-trigger
        onClick={() => (children ? setOpen((o) => !o) : onClick?.())}
        aria-label={label}
        title={label}
        aria-haspopup={children ? "dialog" : undefined}
        aria-expanded={children ? open : undefined}
        aria-controls={children ? id : undefined}
        className={cn(
          "relative grid size-10 place-items-center rounded-xl border transition-[transform,box-shadow,border-color] duration-150",
          "hover:-translate-y-px hover:shadow-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-teal",
          primary
            ? "border-transparent bg-tk-teal text-tk-linen shadow-card"
            : "border-tk-slate/15 bg-white text-tk-onyx shadow-card hover:border-tk-slate/25",
          open && !primary && "border-tk-teal"
        )}
      >
        <span className="[&>svg]:size-[17px]">{icon}</span>
        {badge ? (
          <span
            aria-hidden
            className="absolute -right-1.5 -top-1.5 grid h-[17px] min-w-[17px] place-items-center rounded-full bg-tk-tomato px-1 font-ui text-[10px] font-bold text-tk-linen ring-2 ring-canvas"
          >
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
        {dot ? (
          <span
            aria-hidden
            className="tk-live-dot absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-ok ring-2 ring-canvas"
          />
        ) : null}
      </button>
      {children && open ? (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          style={{ width }}
          className="absolute right-0 top-[calc(100%+8px)] z-[65] max-w-[calc(100vw-2rem)] rounded-2xl border border-tk-slate/15 bg-white p-4 text-tk-onyx shadow-hover motion-safe:animate-[tk-rise_.18s_ease_both]"
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  )
}

/** A small uppercase field label used inside the popovers. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="block font-ui text-[10.5px] font-bold uppercase tracking-[0.08em] text-tk-slate/70">
      {children}
    </span>
  )
}

export const INPUT_CLASS =
  "h-[34px] w-full rounded-lg border border-tk-slate/15 bg-tk-linen px-2.5 text-[13px] text-tk-onyx placeholder:text-tk-slate focus:border-tk-teal focus:bg-white focus:outline-none"
