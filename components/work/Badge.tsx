import type { ProjectStatus } from "@/db/schema"
import { cn } from "@/lib/cn"

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode
  tone?: "neutral" | "teal" | "muted"
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tone === "teal" && "bg-tk-teal/10 text-tk-teal",
        tone === "neutral" && "bg-well text-tk-slate",
        tone === "muted" && "bg-well text-ink-3"
      )}
    >
      {children}
    </span>
  )
}

export function projectTone(status: ProjectStatus) {
  if (status === "in_progress") return "teal" as const
  if (status === "complete") return "muted" as const
  return "neutral" as const
}
