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
        tone === "good" && "bg-good-soft text-good",
        tone === "warn" && "bg-warn-soft text-warn",
        tone === "crit" && "bg-bad-soft text-bad",
        tone === "teal" && "bg-accent-soft text-accent-ink",
        tone === "neutral" && "bg-well text-tk-slate",
        tone === "muted" && "bg-well text-ink-3"
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
