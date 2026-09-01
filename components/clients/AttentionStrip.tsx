import Link from "next/link"
import type { RosterFlag } from "@/lib/client-hub"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"

/**
 * Cross-client triage: the things that need you today, before you pick a
 * client at all. Each card jumps straight to the client it names.
 */
export function AttentionStrip({ flags }: { flags: RosterFlag[] }) {
  if (flags.length === 0) return null
  return (
    <div className="mt-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-tk-slate/50">
        Needs attention
      </p>
      <div className="mt-2 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {flags.map((flag) => (
          <Link
            key={flag.key}
            href={ROUTES.client(flag.clientSlug)}
            className={cn(
              "rounded-xl border border-tk-slate/10 border-l-[3px] bg-white px-3.5 py-2.5 shadow-sm hover:border-tk-slate/25 hover:border-l-[3px]",
              flag.severity === "hot" ? "border-l-[#A32C1E]" : "border-l-[#8A5A05]"
            )}
          >
            <p className="text-[13px] font-semibold leading-snug text-tk-onyx">
              {flag.title}
            </p>
            <p className="mt-0.5 truncate text-xs text-tk-slate/70">{flag.sub}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
