import Link from "next/link"
import { clientColor, markColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import {
  BAR_TONE,
  STATE_DOT,
  rollup,
  type AppHealth,
  type AppSurface,
} from "@/lib/app-health"

/**
 * One product, four surfaces, half a row wide. The card answers "is it fine";
 * the peek behind it answers "what exactly". Whole card is the target — the
 * tiles are read-only.
 */
export function AppHealthCard({ app, peekHref }: { app: AppHealth; peekHref: string }) {
  const color = clientColor(app.clientSlug)
  const verdict = rollup(app)

  return (
    <Link
      href={peekHref}
      scroll={false}
      className="group flex overflow-hidden rounded-2xl border border-line bg-card shadow-card transition-colors hover:border-line-strong"
    >
      <span aria-hidden className="w-[3px] shrink-0" style={{ background: markColor(color) }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-1.5">
          <p className="flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-[3px]"
              style={{ background: markColor(color) }}
            />
            <span className="truncate">{app.name}</span>
          </p>
          <p className="flex shrink-0 items-center gap-1.5 font-mono text-[11px] text-ink-3">
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ background: STATE_DOT[verdict.state] }}
            />
            <span
              className={cn(
                verdict.state === "down" && "font-semibold text-bad",
                verdict.state === "degraded" && "font-semibold text-warn"
              )}
            >
              {verdict.label}
            </span>
            <span className="text-ink-3 transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </p>
        </div>
        <div className="grid grid-cols-2">
          {app.surfaces.map((surface) => (
            <SurfaceTile key={surface.kind} surface={surface} />
          ))}
        </div>
      </div>
    </Link>
  )
}

function SurfaceTile({ surface }: { surface: AppSurface }) {
  const down = surface.state === "down"
  const warn = surface.state === "degraded"

  return (
    <div className="border-line border-b px-3 py-2 [&:nth-child(even)]:border-l [&:nth-last-child(-n+2)]:border-b-0">
      <p className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-ink-3">
          {surface.label}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-ink-3">
          {surface.provider}
        </span>
      </p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span
          aria-hidden
          className="size-1.5 shrink-0 translate-y-[-1px] rounded-full"
          style={{ background: STATE_DOT[surface.state] }}
        />
        <span
          className={cn(
            "shrink-0 text-[12.5px] font-semibold",
            down ? "text-bad" : warn ? "text-warn" : "text-tk-onyx"
          )}
        >
          {surface.headline}
        </span>
        <span className="min-w-0 truncate font-mono text-[10.5px] text-ink-3">
          {surface.detail}
        </span>
      </p>
      <span
        className="mt-1.5 flex h-3.5 items-end gap-px"
        aria-hidden
        title={surface.barsLabel}
      >
        {surface.bars.map((bar, i) => (
          <span
            key={i}
            className={cn(
              "min-w-0 flex-1 rounded-[1px]",
              BAR_TONE[bar.tone],
              bar.tone === "ok" && "opacity-70"
            )}
            style={{ height: `${Math.round(bar.v * 100)}%` }}
          />
        ))}
      </span>
    </div>
  )
}
