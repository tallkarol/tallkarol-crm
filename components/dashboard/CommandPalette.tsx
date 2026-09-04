"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { ToolButton } from "@/components/dashboard/ToolButton"
import { cn } from "@/lib/cn"
import { clientColor, markColor } from "@/lib/client-colors"
import { Card } from "@/components/ui/Card"

/** One row the palette can jump to. `slug` colours the chip when it is a client's thing. */
export type PaletteEntry = {
  label: string
  href: string
  /** "page" rows come first and carry a live count; the rest are records. */
  kind: "page" | "client" | "project" | "retainer" | "product"
  sub?: string
  slug?: string
}

const KIND_LABEL: Record<PaletteEntry["kind"], string> = {
  page: "Jump to",
  client: "Clients",
  project: "Projects",
  retainer: "Retainers",
  product: "Products",
}

function matches(entry: PaletteEntry, q: string) {
  if (!q) return true
  const hay = `${entry.label} ${entry.sub ?? ""} ${entry.kind}`.toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => hay.includes(word))
}

/**
 * ⌘K. Pages first (with the numbers that matter today), then every client,
 * project and retainer by name. Filtering is on the client — the list is a
 * few hundred rows at most and travels with the page.
 */
export function CommandPalette({ entries }: { entries: PaletteEntry[] }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  return (
    <>
      <ToolButton label="Search or jump to… (⌘K)" icon={<Search />} onClick={() => setOpen(true)} />
      {open ? <PaletteDialog entries={entries} onClose={() => setOpen(false)} /> : null}
    </>
  )
}

function PaletteDialog({
  entries,
  onClose,
}: {
  entries: PaletteEntry[]
  onClose: () => void
}) {
  const router = useRouter()
  const [q, setQ] = useState("")
  const [cursor, setCursor] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const visible = useMemo(() => {
    const hits = entries.filter((e) => matches(e, q))
    // Without a query, records are a long list — show pages plus the first
    // handful of each kind, so the empty state is a launcher, not a wall.
    if (!q) {
      const seen = new Map<PaletteEntry["kind"], number>()
      return hits.filter((e) => {
        const n = seen.get(e.kind) ?? 0
        seen.set(e.kind, n + 1)
        return e.kind === "page" || n < 4
      })
    }
    return hits.slice(0, 40)
  }, [entries, q])

  useEffect(() => {
    input.current?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  useEffect(() => {
    setCursor(0)
  }, [q])

  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }, [cursor])

  function go(entry: PaletteEntry | undefined) {
    if (!entry) return
    onClose()
    router.push(entry.href)
  }

  function onKey(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault()
      onClose()
    } else if (event.key === "ArrowDown") {
      event.preventDefault()
      setCursor((c) => Math.min(visible.length - 1, c + 1))
    } else if (event.key === "ArrowUp") {
      event.preventDefault()
      setCursor((c) => Math.max(0, c - 1))
    } else if (event.key === "Enter") {
      event.preventDefault()
      go(visible[cursor])
    }
  }

  let lastKind: PaletteEntry["kind"] | null = null

  return (
    <div className="fixed inset-0 z-[66]" role="dialog" aria-modal="true" aria-label="Search or jump to">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-scrim backdrop-blur-[3px]"
      />
      <Card elevation="none" className="absolute left-1/2 top-[14vh] w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden text-tk-onyx shadow-hover motion-safe:animate-[tk-rise_.2s_ease_both]" onKeyDown={onKey}>
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <Search className="size-[18px] text-ink-3" aria-hidden />
          <input
            ref={input}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search clients, projects, retainers, or jump to a page…"
            aria-label="Search"
            className="flex-1 bg-transparent text-[15px] text-tk-onyx placeholder:text-ink-3"
          />
          <kbd className="rounded-md border border-line px-1.5 py-0.5 font-ui text-[10.5px] font-semibold text-ink-3">
            esc
          </kbd>
        </div>
        <div ref={list} className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
          {visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-3">
              Nothing matches “{q}”.
            </p>
          ) : null}
          {visible.map((entry, index) => {
            const heading = entry.kind !== lastKind ? KIND_LABEL[entry.kind] : null
            lastKind = entry.kind
            return (
              <div key={`${entry.kind}:${entry.href}`}>
                {heading ? (
                  <p className="px-2.5 pb-1 pt-2 font-ui text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-3">
                    {heading}
                  </p>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === cursor}
                  data-index={index}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(entry)}
                  className={cn(
                    "flex h-[38px] w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] text-tk-onyx",
                    index === cursor && "bg-well"
                  )}
                >
                  {entry.slug ? (
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: markColor(clientColor(entry.slug)) }}
                    />
                  ) : null}
                  <span className="truncate font-medium">{entry.label}</span>
                  {entry.sub ? (
                    <span className="ml-auto shrink-0 font-ui text-[11.5px] text-ink-3">
                      {entry.sub}
                    </span>
                  ) : null}
                </button>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
