import Link from "next/link"
import type { ReactNode } from "react"
import { PeekEsc } from "@/components/peek/controls"

/**
 * The centered dialog the delivery ledger opens a row into.
 *
 * Server-rendered, with the URL as the state (`?open=project:slug`), so back,
 * refresh and sharing all behave — the same contract the slide-over peek uses,
 * in the shape a two-column engagement needs.
 */
export function ModalShell({
  closeHref,
  label,
  header,
  footer,
  children,
}: {
  closeHref: string
  label: string
  header: ReactNode
  footer?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label={label}>
      <PeekEsc closeHref={closeHref} />
      <Link
        href={closeHref}
        scroll={false}
        aria-label="Close"
        className="absolute inset-0 bg-scrim backdrop-blur-[2px] motion-safe:animate-[tk-fade-in_.18s_ease-out]"
      />
      <div className="absolute inset-0 flex items-start justify-center overflow-y-auto p-3 sm:p-6">
        <div className="relative w-full max-w-[62rem] overflow-hidden rounded-2xl border border-line bg-card shadow-[0_24px_70px_-18px_rgba(15,22,21,.45)] motion-safe:animate-[tk-modal-in_.2s_ease-out]">
          <div className="relative">
            {header}
            <Link
              href={closeHref}
              scroll={false}
              aria-label="Close"
              className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-well transition-colors duration-[120ms] hover:text-tk-onyx"
            >
              ✕
            </Link>
          </div>
          {children}
          {footer ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-line bg-well px-4 py-2.5">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- parts */

export function ModalStrip({
  cells,
}: {
  cells: { label: string; value: ReactNode; caption?: string; tone?: "amber" | "green" }[]
}) {
  return (
    <div className="grid border-y border-line bg-well sm:grid-cols-2 lg:grid-cols-4">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="border-b border-r border-line px-4 py-2.5 last:border-r-0 lg:border-b-0"
        >
          <p className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-ink-3">
            {cell.label}
          </p>
          <p
            className={
              cell.tone === "amber"
                ? "mt-0.5 text-[18px] font-semibold tracking-tight tabular-nums text-warn"
                : cell.tone === "green"
                  ? "mt-0.5 text-[18px] font-semibold tracking-tight tabular-nums text-good"
                  : "mt-0.5 text-[18px] font-semibold tracking-tight tabular-nums text-tk-onyx"
            }
          >
            {cell.value}
          </p>
          {cell.caption ? (
            <p className="text-[10.5px] text-ink-3">{cell.caption}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

export function Block({
  title,
  count,
  action,
  children,
}: {
  title: string
  count?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="mt-4 first:mt-0">
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
          {title}
        </h3>
        {count != null ? (
          <span className="font-mono text-[10px] tabular-nums text-ink-3">{count}</span>
        ) : null}
        {action ? <span className="ml-auto">{action}</span> : null}
      </div>
      {children}
    </section>
  )
}

export function Card({ children, padded }: { children: ReactNode; padded?: boolean }) {
  return (
    <div
      className={
        padded
          ? "rounded-xl border border-line bg-card px-2.5 py-1.5"
          : "overflow-hidden rounded-xl border border-line bg-card"
      }
    >
      {children}
    </div>
  )
}

export function Line({
  children,
  hot,
}: {
  children: ReactNode
  hot?: boolean
}) {
  return (
    <div
      className={
        hot
          ? "flex items-center gap-2.5 border-b border-line bg-warn-soft px-2.5 py-2 last:border-b-0"
          : "flex items-center gap-2.5 border-b border-line px-2.5 py-2 last:border-b-0"
      }
    >
      {children}
    </div>
  )
}

export function KeyValue({ label, value, tone }: { label: string; value: ReactNode; tone?: "amber" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
      <span className="text-[11.5px] text-ink-3">{label}</span>
      <span
        className={
          tone === "amber"
            ? "font-mono text-[11px] font-semibold tabular-nums text-warn"
            : "font-mono text-[11px] font-semibold tabular-nums text-tk-onyx"
        }
      >
        {value}
      </span>
    </div>
  )
}

export function Attention({ flags }: { flags: { key: string; detail: string; severity: string }[] }) {
  if (flags.length === 0) {
    return (
      <p className="rounded-xl border border-line bg-card px-3 py-2.5 text-[11.5px] text-ink-3">
        Nothing needs you here.
      </p>
    )
  }
  return (
    <div className="rounded-xl border border-transparent bg-warn-soft px-3 py-2.5">
      <ul className="list-disc space-y-1.5 pl-4">
        {flags.map((flag) => (
          <li
            key={flag.key}
            className="text-[11.5px] leading-snug text-tk-slate marker:text-warn"
          >
            {flag.severity === "hot" ? (
              <strong className="font-semibold text-tk-onyx">{flag.detail}</strong>
            ) : (
              flag.detail
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
