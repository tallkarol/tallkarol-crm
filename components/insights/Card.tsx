import type { ReactNode } from "react"

/** White card in the hub grid — same skin as the rest of the CRM. */
export function Card({
  title,
  note,
  right,
  children,
  className,
}: {
  title: string
  note?: string
  right?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-2xl border border-tk-slate/15 bg-white shadow-sm ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-3 px-5 pt-3.5">
        <h2 className="text-[13px] font-bold text-tk-onyx">{title}</h2>
        {right ?? (note ? <p className="text-[11px] text-tk-slate/55">{note}</p> : null)}
      </div>
      {children}
    </section>
  )
}
