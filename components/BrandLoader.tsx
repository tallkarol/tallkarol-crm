import { cn } from "@/lib/cn"

/**
 * The route loader — every `loading.tsx` renders this in the page's place
 * while the next page's server render runs, so a click answers at once and
 * the dock, panel and room header stay put around it.
 *
 * The monogram fills from the bottom, holds, drains, and loops, over a faint
 * copy of itself, with a teal glow breathing behind it — Artist House's
 * BrandLoadingOverlay, redone in CSS so it costs no JavaScript (keyframes are
 * `tk-loader-*` in globals.css). It fades in after a beat, so a page that
 * arrives quickly never flashes it.
 */
export function BrandLoader({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading"
      className={cn("tk-loader flex min-h-[55vh] w-full flex-1 items-center justify-center", className)}
    >
      <div className="relative">
        <div aria-hidden className="tk-loader-glow pointer-events-none absolute left-1/2 top-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" />
        <div className="tk-loader-mark relative h-[76px] w-[56px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/tallkarol-monogram-logo.svg" alt="" width={56} height={76} className="absolute inset-0 h-full w-full object-contain opacity-[0.18]" />
          <div aria-hidden className="tk-loader-fill absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/tallkarol-monogram-logo.svg" alt="" width={56} height={76} className="h-full w-full object-contain" />
          </div>
        </div>
        <p className="absolute left-1/2 top-full mt-5 -translate-x-1/2 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-3">
          Loading
        </p>
      </div>
    </div>
  )
}
