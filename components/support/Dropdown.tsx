"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/cn"

/**
 * The one popover primitive the filter bar is built from. Open state lives in
 * the bar so only one menu is ever open; this handles click-away, Esc, and
 * arrow-key movement between options.
 */
export function Dropdown({
  open,
  onOpen,
  onClose,
  label,
  count,
  active,
  align = "left",
  variant = "default",
  title,
  children,
}: {
  open: boolean
  onOpen: () => void
  onClose: () => void
  /** What the button says — the filter's current condition, not its category. */
  label: ReactNode
  /** Shown as a pill when more than one value is picked. */
  count?: number
  active?: boolean
  align?: "left" | "right"
  variant?: "default" | "lens" | "icon"
  title?: string
  children: ReactNode
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  /** Horizontal offset from the button, in px, once the menu has been measured. */
  const [offset, setOffset] = useState<number | null>(null)

  /*
   * The bar wraps on a narrow pane, so a button's preferred alignment can put
   * its menu outside the queue — which the console card clips. Measure against
   * the pane on open and slide the menu back inside it.
   */
  const place = useCallback(() => {
    const wrap = wrapRef.current
    const menu = menuRef.current
    if (!wrap || !menu) return
    const wrapBox = wrap.getBoundingClientRect()
    const menuWidth = menu.offsetWidth
    const boundaryEl = wrap.closest<HTMLElement>("[data-menu-boundary]")
    const bounds = boundaryEl?.getBoundingClientRect() ?? {
      left: 0,
      right: window.innerWidth,
    }
    const gutter = 8
    let x = align === "right" ? wrapBox.right - menuWidth : wrapBox.left
    x = Math.min(x, bounds.right - gutter - menuWidth)
    x = Math.max(x, bounds.left + gutter)
    setOffset(x - wrapBox.left)
  }, [align])

  useLayoutEffect(() => {
    if (!open) {
      setOffset(null)
      return
    }
    place()
    window.addEventListener("resize", place)
    return () => window.removeEventListener("resize", place)
  }, [open, place])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open, onClose])

  function items() {
    return Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>("[role^='menuitem']") ?? []
    )
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation()
      onClose()
      buttonRef.current?.focus()
      return
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return
    e.preventDefault()
    const list = items()
    if (!list.length) return
    const at = list.indexOf(document.activeElement as HTMLButtonElement)
    const next =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? list.length - 1
          : e.key === "ArrowDown"
            ? at < 0
              ? 0
              : Math.min(at + 1, list.length - 1)
            : Math.max(at - 1, 0)
    list[next]?.focus()
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => (open ? onClose() : onOpen())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault()
            onOpen()
          }
        }}
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[12.5px] transition-colors",
          variant === "lens" ? "font-semibold" : "font-medium",
          variant === "icon" && "px-2",
          active
            ? "border-tk-teal bg-accent text-tk-linen hover:bg-tk-teal/90"
            : open
              ? "border-tk-teal bg-tk-teal/[0.06] text-tk-teal"
              : "border-line bg-card text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
        )}
      >
        {label}
        {count && count > 1 ? (
          <span
            className={cn(
              "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-mono text-[10px]",
              active ? "bg-on-accent/25 text-tk-linen" : "bg-accent text-tk-linen"
            )}
          >
            {count}
          </span>
        ) : null}
        {variant === "icon" ? null : (
          <span aria-hidden className="translate-y-px text-[9px] opacity-60">
            ▾
          </span>
        )}
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={id}
          role="menu"
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          style={offset == null ? undefined : { left: offset }}
          className={cn(
            "absolute top-[calc(100%+5px)] z-40 max-h-[26rem] min-w-[15rem] overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-overlay",
            // Pre-measurement fallback; `place()` replaces it before paint.
            offset != null ? null : align === "right" ? "right-0" : "left-0"
          )}
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function MenuHead({ children, onClear }: { children: ReactNode; onClear?: () => void }) {
  return (
    <div className="flex items-center gap-2 px-2 pb-1.5 pt-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-3">
      {children}
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto font-sans text-[10.5px] font-semibold normal-case tracking-normal text-tk-teal hover:underline"
        >
          Clear
        </button>
      ) : null}
    </div>
  )
}

export function MenuSub({ children }: { children: ReactNode }) {
  return (
    <div className="px-2 pb-0.5 pt-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3">
      {children}
    </div>
  )
}

export function MenuRule() {
  return <div className="mx-1.5 my-1 h-px bg-line" />
}

export function MenuOption({
  kind,
  checked,
  onSelect,
  color,
  count,
  children,
}: {
  kind: "check" | "radio"
  checked: boolean
  onSelect: () => void
  color?: string
  count?: number
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role={kind === "check" ? "menuitemcheckbox" : "menuitemradio"}
      aria-checked={checked}
      onClick={onSelect}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] text-tk-slate hover:bg-well transition-colors duration-[120ms]"
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
      {color ? (
        <span
          className="tk-client-mark size-2 shrink-0 rounded-full"
          style={{ "--c": color } as React.CSSProperties}
          aria-hidden
        />
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {count != null ? (
        <span className="font-mono text-[10.5px] tabular-nums text-ink-3">{count}</span>
      ) : null}
    </button>
  )
}
