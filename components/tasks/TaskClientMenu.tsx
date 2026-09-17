"use client"

import { useEffect, useId, useRef, useState, useTransition, type CSSProperties } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { MenuOption } from "@/components/ui/Dropdown"
import { clientColor, inkColor, markColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { updateTask } from "@/lib/task-actions"

export type TaskClientOption = { id: string; name: string; slug: string }

/**
 * Move a task to another client. Portaled so it can open from a clipped row
 * or the peek without being eaten by overflow.
 *
 * Picking a client drops the project, product and deliverable that belonged
 * to the old one — same rule as filing a punch against a new house.
 */
export function TaskClientMenu({
  taskId,
  clientId,
  clients,
  variant = "name",
  size = "sm",
  disabled = false,
}: {
  taskId: string
  clientId: string | null
  clients: TaskClientOption[]
  variant?: "name" | "field"
  size?: "sm" | "md"
  disabled?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState(clientId)
  const [busy, startTransition] = useTransition()
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    setPicked(clientId)
  }, [clientId])

  useEffect(() => {
    if (!open) return

    function place() {
      const button = trigger.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const width = 232
      const menuHeight = Math.min(330, panel.current?.offsetHeight ?? 280)
      const left =
        rect.left + width > window.innerWidth - 8
          ? Math.max(8, rect.right - width)
          : rect.left
      const below = rect.bottom + 5
      const top =
        below + menuHeight > window.innerHeight - 8
          ? Math.max(8, rect.top - 5 - menuHeight)
          : below
      setPos({ top, left })
    }

    place()
    const frame = window.requestAnimationFrame(place)

    function onAway(event: MouseEvent) {
      const node = event.target as Node
      if (trigger.current?.contains(node) || panel.current?.contains(node)) return
      setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }

    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    document.addEventListener("mousedown", onAway)
    document.addEventListener("keydown", onKey)
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
      document.removeEventListener("mousedown", onAway)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const current = clients.find((c) => c.id === picked) ?? null
  const needle = query.trim().toLowerCase()
  const shown = needle
    ? clients.filter((c) => c.name.toLowerCase().includes(needle))
    : clients

  function apply(next: string | null) {
    if (next === picked || busy || disabled) {
      setOpen(false)
      return
    }
    setError(null)
    setPicked(next)
    setOpen(false)
    setQuery("")
    startTransition(async () => {
      const result = await updateTask(taskId, {
        clientId: next,
        projectId: null,
        productId: null,
        deliverableId: null,
      })
      if (!result.ok) {
        setPicked(clientId)
        setError(result.error)
        return
      }
      router.refresh()
    })
  }

  const color = current ? clientColor(current.slug) : undefined
  const label = current?.name ?? "No client"

  return (
    <span
      className="relative inline-flex min-w-0 items-center"
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        ref={trigger}
        type="button"
        disabled={disabled || busy}
        title="Move to another client"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
        aria-label={`Client: ${label}. Move to another client`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "inline-flex max-w-full items-center gap-1.5 rounded-md text-left disabled:opacity-50",
          variant === "field"
            ? cn(
                "rounded-lg border px-2.5 py-1.5 text-xs focus-visible:border-tk-teal",
                current
                  ? "border-line bg-well text-tk-slate"
                  : "border-dashed border-line-strong bg-card text-ink-3"
              )
            : cn(
                "font-semibold hover:underline",
                size === "md" ? "text-sm" : "text-[11.5px]",
                current ? "text-tk-slate" : "text-ink-3"
              ),
          open && variant === "name" && "underline"
        )}
        style={
          variant === "name" && color
            ? { color: inkColor(color) }
            : undefined
        }
      >
        {color ? (
          <span
            aria-hidden
            className={cn(
              "shrink-0 rounded-full",
              size === "md" ? "size-2" : "size-1.5",
              variant === "field" && "tk-client-mark size-2"
            )}
            style={
              variant === "field"
                ? ({ "--c": color } as CSSProperties)
                : { backgroundColor: markColor(color) }
            }
          />
        ) : null}
        <span className="min-w-0 truncate">{label}</span>
        <span aria-hidden className="text-[9px] opacity-60">
          ▾
        </span>
      </button>

      {open
        ? createPortal(
            <div
              ref={panel}
              id={menuId}
              role="menu"
              style={{ top: pos.top, left: pos.left }}
              className="fixed z-[90] max-h-[330px] min-w-[232px] overflow-y-auto rounded-xl border border-line bg-card p-1.5 shadow-overlay"
            >
              {clients.length > 6 ? (
                <input
                  autoFocus
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter clients…"
                  aria-label="Filter clients"
                  className="mb-1 w-full rounded-lg border border-line bg-well px-2 py-1.5 text-xs text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal"
                />
              ) : null}
              <MenuOption
                checked={picked == null}
                label="No client"
                onSelect={() => apply(null)}
              />
              {shown.map((client) => (
                <MenuOption
                  key={client.id}
                  checked={client.id === picked}
                  swatch={clientColor(client.slug)}
                  label={client.name}
                  onSelect={() => apply(client.id)}
                />
              ))}
              {shown.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-ink-3">No match.</p>
              ) : null}
            </div>,
            document.body
          )
        : null}

      {error ? (
        <span
          role="status"
          className="absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded-md border border-transparent bg-card px-2 py-1 text-[10.5px] font-semibold text-bad shadow-card"
        >
          {error}
        </span>
      ) : null}
    </span>
  )
}
