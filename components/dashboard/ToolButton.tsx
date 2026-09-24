"use client"

import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/cn"
import { Card } from "@/components/ui/Card"

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
  track,
  wide = false,
  text,
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
  /** Names the button on /activity (see ACTIVITY.md). */
  track?: string
  /**
   * The phone's quick-action row: a full-width labelled button, and the
   * popover spans the row (the wrapper goes static, the row is `relative`)
   * rather than hanging off a third-width button.
   */
  wide?: boolean
  /** The label on a wide button, when shorter than the accessible one. */
  text?: string
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
    <div ref={box} className={wide ? "static" : "relative"}>
      <button
        type="button"
        data-trigger
        data-track={track}
        onClick={() => (children ? setOpen((o) => !o) : onClick?.())}
        aria-label={label}
        title={label}
        aria-haspopup={children ? "dialog" : undefined}
        aria-expanded={children ? open : undefined}
        aria-controls={children ? id : undefined}
        className={cn(
          wide
            ? "relative flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] border font-ui text-[14px] font-bold transition-[transform,box-shadow,border-color] duration-150"
            : "relative grid size-10 place-items-center rounded-xl border transition-[transform,box-shadow,border-color] duration-150",
          "hover:-translate-y-px hover:shadow-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tk-teal",
          primary
            ? "border-transparent bg-accent text-tk-linen shadow-card"
            : "border-line bg-card text-tk-onyx shadow-card hover:border-line-strong",
          open && !primary && "border-tk-teal"
        )}
      >
        <span className={wide ? "[&>svg]:size-[18px]" : "[&>svg]:size-[17px]"}>{icon}</span>
        {wide ? <span>{text ?? label}</span> : null}
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
        <Card
          elevation="none"
          className={cn(
            "absolute top-[calc(100%+8px)] z-[65] max-w-[calc(100vw-2rem)] p-4 text-tk-onyx shadow-hover motion-safe:animate-[tk-rise_.18s_ease_both]",
            wide ? "inset-x-0" : "right-0"
          )}
          id={id}
          role="dialog"
          aria-label={label}
          style={wide ? undefined : { width }}
        >
          {children(close)}
        </Card>
      ) : null}
    </div>
  )
}

/** A small uppercase field label used inside the popovers. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <span className="block font-ui text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
      {children}
    </span>
  )
}

export const INPUT_CLASS =
  "h-[34px] w-full rounded-lg border border-line bg-well px-2.5 text-[13px] text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal focus:bg-card"
