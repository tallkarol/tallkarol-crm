"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "@/lib/cn"

/** Clipboard API where it exists, hidden-textarea where it doesn't. */
export async function copyToClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the textarea path
  }
  try {
    const ta = document.createElement("textarea")
    ta.value = text
    ta.setAttribute("readonly", "")
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0"
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand("copy")
    ta.remove()
    return ok
  } catch {
    return false
  }
}

export function CopyButton({
  text,
  label = "copy",
  doneLabel = "copied ✓",
  tone = "light",
}: {
  text: string
  label?: string
  doneLabel?: string
  tone?: "light" | "dark"
}) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const run = useCallback(async () => {
    const ok = await copyToClipboard(text)
    setState(ok ? "done" : "error")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setState("idle"), 1600)
  }, [text])

  return (
    <button
      type="button"
      onClick={run}
      className={cn(
        "shrink-0 rounded-md border px-2 py-0.5 font-mono text-[10.5px] transition-colors",
        tone === "dark"
          ? state === "done"
            ? "border-[#54C3AB] bg-[#54C3AB] text-[#0F1615]"
            : "border-on-accent/15 text-tk-linen/65 hover:border-[#54C3AB]/60 hover:text-[#54C3AB]"
          : state === "done"
            ? "border-tk-teal bg-accent text-tk-linen"
            : "border-line text-ink-3 hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
      )}
    >
      {state === "done" ? doneLabel : state === "error" ? "copy failed" : label}
    </button>
  )
}

/** Bigger sibling for the action row above the payloads. */
export function CopyAction({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await copyToClipboard(text)
        setDone(ok)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setDone(false), 1600)
      }}
      className={cn(
        "rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors",
        done
          ? "border-tk-teal bg-accent text-tk-linen"
          : "border-line bg-card text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal"
      )}
    >
      {done ? "Copied ✓" : label}
    </button>
  )
}

/**
 * `c` copies the open ticket's first payload from anywhere on the page — the
 * move you make most while a client is on the phone.
 */
export function CopyHotkey({ text, note }: { text: string; note: string }) {
  const [flash, setFlash] = useState<string | null>(null)

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    async function onKey(e: KeyboardEvent) {
      if (e.key !== "c" || e.metaKey || e.ctrlKey || e.altKey) return
      const el = e.target as HTMLElement | null
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.isContentEditable) return
      if (window.getSelection()?.toString()) return
      const ok = await copyToClipboard(text)
      setFlash(ok ? note : "Copy failed")
      timers.push(setTimeout(() => setFlash(null), 1600))
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("keydown", onKey)
      timers.forEach(clearTimeout)
    }
  }, [text, note])

  if (!flash) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-full bg-tk-onyx px-4 py-2 font-mono text-xs text-tk-linen shadow-overlay"
    >
      {flash}
    </div>
  )
}
