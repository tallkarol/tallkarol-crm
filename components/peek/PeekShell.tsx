import Link from "next/link"
import type { ReactNode } from "react"
import { PeekEsc } from "@/components/peek/controls"

/**
 * The slide-over frame every peek card lives in. Server-rendered; the URL is
 * the state (?peek=…), so back button, refresh, and sharing all behave.
 * Backdrop click and Esc both return to closeHref.
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
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={eyebrow}>
      <PeekEsc closeHref={closeHref} />
      <Link
        href={closeHref}
        scroll={false}
        aria-label="Close"
        className="absolute inset-0 bg-tk-onyx/30 backdrop-blur-[2px] motion-safe:animate-[tk-fade-in_.18s_ease-out]"
      />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[30rem] flex-col bg-white shadow-2xl motion-safe:animate-[tk-peek-in_.22s_ease-out] sm:my-3 sm:mr-3 sm:rounded-2xl sm:border sm:border-tk-slate/15">
        <div className="flex items-center justify-between gap-3 border-b border-tk-slate/10 px-6 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-tk-slate/55">
            {eyebrow}
          </p>
          <Link
            href={closeHref}
            scroll={false}
            aria-label="Close card"
            className="flex size-7 items-center justify-center rounded-lg text-tk-slate/55 transition-colors hover:bg-tk-linen hover:text-tk-onyx"
          >
            ✕
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="border-t border-tk-slate/10 px-6 py-3">
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
