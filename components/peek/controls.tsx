"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/cn"

type ActionResult = { ok: boolean; error?: string }

/** Esc closes the peek — same as clicking the backdrop. */
export function PeekEsc({ closeHref }: { closeHref: string }) {
  const router = useRouter()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") router.push(closeHref, { scroll: false })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [router, closeHref])
  return null
}

export type PickOption = {
  value: string
  label: string
  /** teal = the affirmative/next step; danger = destructive-ish demotion. */
  tone?: "teal" | "neutral" | "danger"
}

/**
 * Segmented status control. The current value renders as a solid chip; every
 * other option is one click away. Optimistic — the row flips immediately and
 * the server refresh settles it.
 */
export function PickButtons({
  options,
  current,
  action,
  size = "md",
}: {
  options: PickOption[]
  current: string
  action: (value: string) => Promise<ActionResult>
  size?: "md" | "sm"
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const active = optimistic ?? current

  function pick(value: string) {
    if (value === active || pending) return
    setError(null)
    setOptimistic(value)
    startTransition(async () => {
      const result = await action(value)
      if (!result.ok) {
        setOptimistic(null)
        setError(result.error ?? "That didn't save.")
        return
      }
      router.refresh()
    })
  }

  return (
    <div>
      <div
        className={cn(
          "inline-flex flex-wrap gap-1 rounded-xl border border-line bg-well p-1",
          pending && "opacity-70"
        )}
        role="group"
      >
        {options.map((opt) => {
          const isActive = opt.value === active
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => pick(opt.value)}
              disabled={pending}
              aria-pressed={isActive}
              className={cn(
                "rounded-lg font-semibold transition-colors",
                size === "md" ? "px-3 py-1.5 text-xs" : "px-2 py-1 text-[11px]",
                isActive
                  ? opt.tone === "danger"
                    ? "bg-bad text-canvas"
                    : opt.tone === "neutral"
                      ? "bg-tk-onyx text-tk-linen"
                      : "bg-accent text-tk-linen"
                  : "text-ink-3 hover:bg-card hover:text-tk-onyx"
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      {error ? <p className="mt-1.5 text-xs text-bad">{error}</p> : null}
    </div>
  )
}

function todayIso() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function plusDaysIso(days: number) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Due-date editor: native date input plus the three moves that matter. */
export function DueDateControl({
  value,
  action,
}: {
  value: string | null
  action: (value: string | null) => Promise<ActionResult>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function set(next: string | null) {
    setError(null)
    startTransition(async () => {
      const result = await action(next)
      if (!result.ok) {
        setError(result.error ?? "That didn't save.")
        return
      }
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          type="date"
          value={value ?? ""}
          onChange={(e) => set(e.target.value || null)}
          disabled={pending}
          className="rounded-lg border border-line bg-card px-2.5 py-1.5 text-xs font-medium text-tk-onyx disabled:opacity-60"
          aria-label="Due date"
        />
        <QuickChip label="Today" onClick={() => set(todayIso())} disabled={pending} />
        <QuickChip label="Tomorrow" onClick={() => set(plusDaysIso(1))} disabled={pending} />
        <QuickChip label="Next week" onClick={() => set(plusDaysIso(7))} disabled={pending} />
        {value ? (
          <QuickChip label="Clear" onClick={() => set(null)} disabled={pending} muted />
        ) : null}
      </div>
      {error ? <p className="mt-1.5 text-xs text-bad">{error}</p> : null}
    </div>
  )
}

function QuickChip({
  label,
  onClick,
  disabled,
  muted,
}: {
  label: string
  onClick: () => void
  disabled: boolean
  muted?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50",
        muted
          ? "border-line text-ink-3 hover:border-line-strong hover:text-tk-slate"
          : "border-line bg-card text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
      )}
    >
      {label}
    </button>
  )
}

/** Notes that save on blur or ⌘/Ctrl-Enter, with a quiet saved tick. */
export function NotesControl({
  value,
  action,
  placeholder = "Notes…",
  rows = 3,
}: {
  value: string
  action: (value: string) => Promise<ActionResult>
  placeholder?: string
  rows?: number
}) {
  const router = useRouter()
  const [draft, setDraft] = useState(value)
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current)
  }, [])

  async function save() {
    if (draft === value) return
    setState("saving")
    setError(null)
    const result = await action(draft)
    if (!result.ok) {
      setState("error")
      setError(result.error ?? "That didn't save.")
      return
    }
    setState("saved")
    router.refresh()
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setState("idle"), 1600)
  }

  return (
    <div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save()
        }}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-sm leading-relaxed text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal"
      />
      <p className="mt-1 min-h-4 text-[11px] text-ink-3">
        {state === "saving"
          ? "Saving…"
          : state === "saved"
            ? "Saved"
            : state === "error"
              ? <span className="text-bad">{error}</span>
              : draft !== value
                ? "Unsaved — click away or ⌘↵ to save"
                : ""}
      </p>
    </div>
  )
}

/** The one primary move on a card — Mark paid, Mark done, Unblock. */
export function PrimaryAction({
  label,
  doneLabel,
  action,
}: {
  label: string
  doneLabel?: string
  action: () => Promise<ActionResult>
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function run() {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error ?? "That didn't save.")
        return
      }
      setDone(true)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending || done}
        className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90 disabled:opacity-60"
      >
        {done ? (doneLabel ?? "Done") : pending ? "Saving…" : label}
      </button>
      {error ? <p className="text-xs text-bad">{error}</p> : null}
    </div>
  )
}
