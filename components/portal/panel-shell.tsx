import type { ReactNode } from "react"

/**
 * The portal's frozen twin of components/insights/Card.
 *
 * FROZEN LITERALS — do not tokenise, and do not "fix" these to bg-card /
 * border-line for consistency. The admin insights pages need Card dark-correct;
 * the client-facing portal is pixel-stable by decree. One component cannot be
 * both, and directory freezing cannot reach a shared import, so the two
 * diverge here rather than one of them silently losing.
 *
 * The values are exactly what Card rendered before the theme work started:
 * #1F2C2B at 15% on #FFFFFF with Tailwind's shadow-sm.
 */
export function PortalPanel({
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
    <section
      className={`rounded-2xl border border-[#1F2C2B]/15 bg-[#FFFFFF] shadow-sm ${className ?? ""}`}
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-3.5">
        <h2 className="text-[13px] font-bold text-[#0F1615]">{title}</h2>
        {right ?? (note ? <p className="text-[11px] text-[#1F2C2B]/55">{note}</p> : null)}
      </div>
      {children}
    </section>
  )
}
