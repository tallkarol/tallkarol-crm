import Link from "next/link"
import { cn } from "@/lib/cn"

export function BrandMark({
  href = "/",
  compact,
  onClick,
  tone = "card",
}: {
  href?: string
  compact?: boolean
  onClick?: () => void
  /** `rail` on the onyx sidebar, `card` on light chrome (the mobile top bar). */
  tone?: "rail" | "card"
}) {
  const rail = tone === "rail"
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex min-w-0 items-center",
        compact ? "justify-center" : "gap-2.5"
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center",
          compact ? "size-8" : "h-8 w-6"
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/tallkarol-monogram-logo.svg"
          alt=""
          width={28}
          height={38}
          className="h-full w-full object-contain object-center"
        />
      </span>
      {compact ? (
        <span className="sr-only">Tall Karol CRM</span>
      ) : (
        <span className="min-w-0">
          <span
            className={cn(
              "block truncate font-ui text-[14.5px] font-bold tracking-tight",
              rail ? "text-rail-ink" : "text-tk-onyx"
            )}
          >
            Tall Karol
          </span>
          <span
            className={cn(
              "block font-ui text-[9.5px] font-bold uppercase tracking-[0.18em]",
              rail ? "text-rail-ink/50" : "text-ink-3"
            )}
          >
            CRM
          </span>
        </span>
      )}
    </Link>
  )
}
