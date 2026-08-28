import Link from "next/link"
import { cn } from "@/lib/cn"

export function BrandMark({
  href = "/",
  compact,
  onClick,
}: {
  href?: string
  compact?: boolean
  onClick?: () => void
}) {
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
          <span className="block truncate text-[15px] font-semibold tracking-tight text-tk-onyx">
            Tall Karol
          </span>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-tk-slate/70">
            CRM
          </span>
        </span>
      )}
    </Link>
  )
}
