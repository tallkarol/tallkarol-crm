"use client"

import { useEffect, useId, useRef, useState } from "react"
import { cn } from "@/lib/cn"

/**
 * One button, one popover. Click-away and Escape close it; the label carries
 * its own state so a closed control still says what it is doing.
 *
 * Deliberately generic: the task hub and the support queue are the same kind
 * of surface and should not grow two vocabularies for filtering.
 */
export function Dropdown({
  label,
  on = false,
  count,
  align = "left",
  icon,
  title,
  variant = "default",
  tone,
  pending = false,
  children,
}: {
  label: string
  /** Filtering something — goes teal so it reads without opening. */
  on?: boolean
  /** Shown as a badge when more than one thing is picked. */
  count?: number
  align?: "left" | "right"
  icon?: React.ReactNode
  title?: string
  /**
   * `status` renders the trigger as a state chip rather than a filter button —
   * the delivery ledger, where a status is the thing you change.
   */
  variant?: "default" | "status"
  /** Chip colours for `variant="status"`, as a border/bg/text class string. */
  tone?: string
  /** Dims the trigger while an optimistic write settles. */
  pending?: boolean
  children: (close: () => void) => React.ReactNode
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
    return () => {
      document.removeEventListener("mousedown", onAway)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        title={title}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap border transition-colors",
          variant === "status"
            ? cn(
                "h-[23px] rounded-full px-2 text-[11px] font-semibold hover:brightness-[0.97]",
                tone ?? "border-line bg-card text-ink-3",
                pending && "opacity-60",
                open && "ring-1 ring-tk-teal/40"
              )
            : cn(
                "rounded-lg px-2.5 py-1.5 text-xs font-medium",
                on
                  ? "border-tk-teal bg-accent text-tk-linen"
                  : "border-line bg-card text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal",
                open && !on && "border-tk-teal bg-tk-teal/5 text-tk-teal"
              )
        )}
      >
        {icon}
        {label}
        {count && count > 1 ? (
          <span
            className={cn(
              "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px]",
              on ? "bg-on-accent/25 text-tk-linen" : "bg-accent text-tk-linen"
            )}
          >
            {count}
          </span>
        ) : null}
        <span
          aria-hidden
          className={cn(variant === "status" ? "text-[8px] opacity-55" : "text-[9px] opacity-60")}
        >
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={id}
          role="menu"
          className={cn(
            "absolute top-[calc(100%+5px)] z-30 max-h-[330px] min-w-[232px] overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-overlay",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  )
}

export function MenuHead({
  children,
  onClear,
}: {
  children: React.ReactNode
  onClear?: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-2 pb-1.5 pt-1 text-[9.5px] font-semibold uppercase tracking-[0.12em] text-ink-3">
      {children}
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto text-[10.5px] font-semibold normal-case tracking-normal text-tk-teal hover:underline"
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}

export function MenuOption({
  kind = "radio",
  checked,
  swatch,
  label,
  count,
  onSelect,
}: {
  kind?: "radio" | "check"
  checked: boolean
  swatch?: string
  label: string
  count?: number | string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role={kind === "check" ? "menuitemcheckbox" : "menuitemradio"}
      aria-checked={checked}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-tk-slate hover:bg-well transition-colors duration-[120ms]"
    >
      {kind === "check" ? (
        <span
          aria-hidden
          className={cn(
            "grid size-3.5 shrink-0 place-items-center rounded border-[1.5px] text-[9px] text-white",
            checked ? "border-tk-teal bg-accent" : "border-line-strong"
          )}
        >
          {checked ? "✓" : ""}
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            "grid size-3.5 shrink-0 place-items-center rounded-full border-[1.5px]",
            checked ? "border-tk-teal" : "border-line-strong"
          )}
        >
          {checked ? <span className="size-1.5 rounded-full bg-accent" /> : null}
        </span>
      )}
      {swatch ? (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: swatch }}
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count != null ? (
        <span className="font-mono text-[10.5px] text-ink-3">{count}</span>
      ) : null}
    </button>
  )
}

export function MenuRule() {
  return <div className="mx-1.5 my-1 h-px bg-line" />
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2 pb-0.5 pt-1.5 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-ink-3">
      {children}
    </p>
  )
}
