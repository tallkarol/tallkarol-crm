"use client"

import { useCallback, useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { PEEK_FRAME, parsePeek, peekEyebrow } from "@/components/peek/frame"

/** Give up on a navigation that never lands, rather than holding a frame forever. */
const PENDING_TIMEOUT_MS = 15_000

/**
 * The card opens on the click, not on the server's answer.
 *
 * A peek is URL state (`?peek=type:id`) rendered on the server, so opening
 * one used to wait on the whole page's re-render before anything moved.
 * This listens for clicks on any `?peek=` link — there are fifty-odd, so one
 * listener rather than a wrapper on each — and shows the card's own frame
 * (same classes, same eyebrow, from ./frame) with a skeleton body at once.
 * When the URL lands on that peek the real card is already rendered; the
 * frame steps aside and `data-peek-warm` stops the real one replaying its
 * slide-in, so the swap reads as the skeleton filling in.
 *
 * Closing is the mirror: a click on a link inside the card that drops the
 * peek, or Esc, hides the card immediately (`data-peek-closing`) while the
 * page under it re-renders. Both flags live on <html> and are cleared by the
 * URL itself, so a failed or superseded navigation cannot strand them past
 * the next route change. Rules are in globals.css under "Instant card frame".
 */
export function PeekPending() {
  const router = useRouter()
  const pathname = usePathname()
  const current = useSearchParams().get("peek")
  const [pending, setPending] = useState<string | null>(null)

  // The URL moved: whatever we were waiting on has landed or been superseded.
  useEffect(() => {
    setPending(null)
    const root = document.documentElement
    delete root.dataset.peekClosing
    if (!current) delete root.dataset.peekWarm
  }, [pathname, current])

  // Backing out before the card lands. Over an already-open card, that card's
  // own Esc and close links do the navigating — a second push here would race
  // them. On its own, navigate to where we already are, which supersedes the
  // in-flight peek.
  const cancel = useCallback(() => {
    setPending(null)
    if (document.querySelector('[data-nav="peek"]')) return
    delete document.documentElement.dataset.peekWarm
    router.push(`${window.location.pathname}${window.location.search}`, { scroll: false })
  }, [router])

  useEffect(() => {
    if (!pending) return
    const timer = window.setTimeout(() => setPending(null), PENDING_TIMEOUT_MS)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener("keydown", onKey)
    }
  }, [pending, cancel])

  useEffect(() => {
    const root = document.documentElement

    function onClick(e: MouseEvent) {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return

      const next = url.searchParams.get("peek")
      const now = new URLSearchParams(window.location.search).get("peek")
      if (next) {
        if (next === now && url.pathname === window.location.pathname) return
        root.dataset.peekWarm = "1"
        setPending(next)
      } else if (now && a.closest('[data-nav="peek"]')) {
        root.dataset.peekClosing = "1"
      }
    }

    // PeekEsc navigates on the same key; this only hides the card sooner.
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      if (document.querySelector('[data-nav="peek"]')) root.dataset.peekClosing = "1"
    }

    document.addEventListener("click", onClick, true)
    window.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("click", onClick, true)
      window.removeEventListener("keydown", onKey)
    }
  }, [])

  if (!pending) return null
  const { type, id } = parsePeek(pending)
  const eyebrow = peekEyebrow(type, id)

  return (
    <div className="fixed inset-0 z-[76]" role="dialog" aria-modal="true" aria-label={eyebrow} aria-busy="true">
      <button type="button" aria-label="Close" onClick={cancel} className={PEEK_FRAME.backdrop} />
      <div className={PEEK_FRAME.panel}>
        <div className={PEEK_FRAME.header}>
          <p className={PEEK_FRAME.eyebrow}>{eyebrow}</p>
          <button type="button" aria-label="Close card" onClick={cancel} className={PEEK_FRAME.close}>
            ✕
          </button>
        </div>
        <div aria-hidden className="space-y-4 px-6 pt-5 motion-safe:animate-pulse">
          <div className="h-5 w-3/4 rounded-md bg-line" />
          <div className="h-3 w-2/5 rounded bg-line" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-4 pt-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i}>
                <div className="h-2.5 w-14 rounded bg-line" />
                <div className="mt-2 h-3.5 w-24 rounded bg-line" />
              </div>
            ))}
          </div>
          <div className="space-y-2 border-t border-line pt-4">
            <div className="h-3 w-full rounded bg-line" />
            <div className="h-3 w-5/6 rounded bg-line" />
            <div className="h-3 w-2/3 rounded bg-line" />
          </div>
        </div>
      </div>
    </div>
  )
}
