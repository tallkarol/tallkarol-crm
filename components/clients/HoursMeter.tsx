import { cn } from "@/lib/cn"

/** Month-against-ceiling bar. Turns amber past the near-cap threshold. */
export function HoursMeter({
  logged,
  cap,
  className,
}: {
  logged: number
  cap: number
  className?: string
}) {
  const pct = cap > 0 ? Math.min(100, Math.round((logged / cap) * 100)) : 0
  const hot = cap > 0 && logged / cap >= 0.85
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-full bg-tk-slate/10", className)}
      role="img"
      aria-label={`${logged} of ${cap} hours used this month`}
    >
      <div
        className={cn("h-full rounded-full", hot ? "bg-[#8A5A05]" : "bg-tk-teal")}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
