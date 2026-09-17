"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/cn"

/** A dropdown whose closed label states its state ("Surface All"). Options are links, so the URL is the filter. */
export function FilterMenu({
  label,
  current,
  options,
}: {
  label: string
  current: string
  options: { value: string; label: string; href: string }[]
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === current) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("pointerdown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 items-center gap-2 rounded-[10px] border border-line bg-card pl-3 pr-2.5 font-ui text-[12px] font-semibold text-ink hover:border-line-strong"
      >
        <span className="text-ink-3">{label}</span>
        {selected?.label}
        <ChevronDown className="size-3.5 text-ink-3" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-30 flex min-w-[190px] flex-col gap-px rounded-xl border border-line bg-card p-1.5 shadow-overlay">
          {options.map((o) => (
            <Link
              key={o.value}
              href={o.href}
              role="menuitemradio"
              aria-checked={o.value === current}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-2 py-1.5 font-ui text-[12.5px] text-ink hover:bg-well",
                o.value === current ? "font-bold" : "font-medium"
              )}
            >
              <Check className={cn("size-3.5 text-accent-ink", o.value === current ? "visible" : "invisible")} aria-hidden />
              {o.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
