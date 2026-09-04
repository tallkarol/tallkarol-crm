import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"

export function clientInitials(name: string) {
  const words = name.trim().split(/\s+/)
  const letters = words.length >= 2 ? [words[0][0], words[1][0]] : name.slice(0, 2)
  return Array.from(letters).join("").toUpperCase()
}

export function ClientAvatar({
  name,
  slug,
  size = "md",
  muted = false,
}: {
  name: string
  slug: string
  size?: "sm" | "md" | "lg"
  muted?: boolean
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 select-none place-items-center rounded-xl font-bold tracking-wide text-white",
        size === "sm" && "h-8 w-8 text-[10.5px]",
        size === "md" && "h-10 w-10 text-xs",
        size === "lg" && "h-12 w-12 rounded-2xl text-sm",
        muted && "bg-line-strong text-ink-3"
      )}
      style={muted ? undefined : { backgroundColor: clientColor(slug) }}
    >
      {clientInitials(name)}
    </span>
  )
}
