import Link from "next/link"
import type { ReactNode } from "react"
import { PeekEsc } from "@/components/peek/controls"

/**
 * The slide-over frame every peek card lives in. Server-rendered; the URL is
 * the state (?peek=…), so back button, refresh, and sharing all behave.
 * Backdrop click and Esc both return to closeHref.
 *
 * z-75, not the 70 every other overlay uses: the dashboard renders PeekRouter
 * BEFORE LeftOffBoard, so at a tied z-index the board wins on DOM order and a
 * peek opened from a card on the board would slide in behind it. 75 clears the
 * board and still passes under the skip link (80) and the floating clock (100).
 */
export function PeekShell({
  closeHref,
  eyebrow,
  footer,
  children,
}: {
  closeHref: string
  eyebrow: string
  footer?: { href: string; label: string }
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label={eyebrow}>
      <PeekEsc closeHref={closeHref} />
      <Link
        href={closeHref}
        scroll={false}
        aria-label="Close"
        className="absolute inset-0 bg-scrim backdrop-blur-[2px] motion-safe:animate-[tk-fade-in_.18s_ease-out]"
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[30rem] flex-col bg-card shadow-overlay motion-safe:animate-[tk-peek-in_.22s_ease-out] sm:my-3 sm:mr-3 sm:rounded-2xl sm:border sm:border-line">
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
            {eyebrow}
          </p>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close card"
            className="flex size-7 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-well transition-colors duration-[120ms] hover:text-tk-onyx"
          >
            ✕
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="border-t border-line px-6 py-3">
            <Link
              href={footer.href}
              className="text-xs font-semibold text-tk-teal hover:underline"
            >
              {footer.label} →
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  )
}
