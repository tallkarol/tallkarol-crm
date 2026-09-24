import Link from "next/link"
import type { ReactNode } from "react"
import { PeekEsc } from "@/components/peek/controls"
import { PEEK_FRAME } from "@/components/peek/frame"

/**
 * The slide-over frame every peek card lives in. Server-rendered; the URL is
 * the state (?peek=…), so back button, refresh, and sharing all behave.
 * Backdrop click and Esc both return to closeHref.
 *
 * z-75, not the 70 every other overlay uses, so a peek opened from inside
 * another overlay slides in above it — and still passes under the skip link
 * (80) and the floating clock (100).
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
    <div className="fixed inset-0 z-[75]" role="dialog" aria-modal="true" aria-label={eyebrow} data-nav="peek">
      <PeekEsc closeHref={closeHref} />
      <Link
        href={closeHref}
        scroll={false}
        aria-label="Close"
        className={PEEK_FRAME.backdrop}
      />
      <div className={PEEK_FRAME.panel}>
        <div className={PEEK_FRAME.header}>
          <p className={PEEK_FRAME.eyebrow}>
            {eyebrow}
          </p>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close card"
            className={PEEK_FRAME.close}
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
