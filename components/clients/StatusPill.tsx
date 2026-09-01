import { cn } from "@/lib/cn"

export type PillTone = "good" | "warn" | "crit" | "teal" | "muted" | "neutral"

/**
 * State chips for the client hub. Semantic color (good/warn/crit) stays
 * separate from the teal accent, so "paid" and "in progress" never read as
 * the same kind of fact.
 */
export function StatusPill({
  children,
  tone = "neutral",
  dot = true,
}: {
  children: React.ReactNode
  tone?: PillTone
  dot?: boolean
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        tone === "good" && "bg-[#26684A]/10 text-[#26684A]",
        tone === "warn" && "bg-[#8A5A05]/10 text-[#8A5A05]",
        tone === "crit" && "bg-[#A32C1E]/10 text-[#A32C1E]",
        tone === "teal" && "bg-tk-teal/10 text-tk-teal",
        tone === "neutral" && "bg-tk-linen text-tk-slate",
        tone === "muted" && "bg-tk-slate/10 text-tk-slate/70"
      )}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current opacity-75"
        />
      ) : null}
      {children}
    </span>
  )
}
