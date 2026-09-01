"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/cn"

/**
 * In-page section nav for the client hub. Sticky inside the app shell's
 * scrolling <main>, with the active section tracked by observation so the
 * highlight follows the scroll rather than the last click.
 */
export function AnchorNav({ items }: { items: { id: string; label: string }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "")

  useEffect(() => {
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        // Topmost visible section wins, so the highlight tracks reading order.
        const top = items.find((item) => visible.has(item.id))
        if (top) setActive(top.id)
      },
      { rootMargin: "-15% 0px -70% 0px" }
    )
    for (const item of items) {
      const el = document.getElementById(item.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [items])

  return (
    <nav
      aria-label="Client sections"
      className="sticky top-0 z-10 -mx-2 mt-5 flex gap-1 overflow-x-auto border-b border-tk-slate/10 bg-tk-linen/70 px-2 py-2 backdrop-blur-sm"
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          onClick={() => setActive(item.id)}
          className={cn(
            "whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-semibold",
            active === item.id
              ? "bg-tk-teal/10 text-tk-teal"
              : "text-tk-slate/70 hover:bg-tk-slate/5"
          )}
        >
          {item.label}
        </a>
      ))}
    </nav>
  )
}
