import Link from "next/link"
import type { ReactNode } from "react"

/** Definition-list facts — the card's at-a-glance block. */
export function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</dl>
}

export function Fact({
  label,
  children,
  wide = false,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
        {label}
      </dt>
      <dd className="mt-0.5 text-sm text-tk-onyx">{children}</dd>
    </div>
  )
}

export function EntityLink({
  href,
  color,
  children,
}: {
  href: string
  color?: string
  children: ReactNode
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 font-semibold text-tk-teal hover:underline"
    >
      {color ? (
        <span
          className="tk-client-mark size-2 rounded-full"
          style={{ "--c": color } as React.CSSProperties}
          aria-hidden
        />
      ) : null}
      {children}
    </Link>
  )
}

export function PeekSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line px-6 py-4">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

/** The peek target no longer exists (deleted in another tab, stale link). */
export function GonePeek() {
  return (
    <div className="px-6 py-10 text-center">
      <p className="text-sm font-semibold text-tk-onyx">That one&rsquo;s gone</p>
      <p className="mt-1 text-sm text-ink-3">
        It was deleted or renamed since this list rendered. Close this card and
        the list will be current again.
      </p>
    </div>
  )
}
