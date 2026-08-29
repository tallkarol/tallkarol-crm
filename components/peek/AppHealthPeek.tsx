import { GonePeek } from "@/components/peek/bits"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import {
  BAR_TONE,
  STATE_DOT,
  WIRED,
  findAppHealth,
  rollup,
  type AppSurface,
} from "@/lib/app-health"

/**
 * Everything about one product's health, one surface per section. The card on
 * /uptime is the glance; this is the read — the numbers you'd otherwise open
 * four dashboards to find.
 */
export function AppHealthPeek({ slug }: { slug: string }) {
  const app = findAppHealth(slug)
  if (!app) return <GonePeek />

  const verdict = rollup(app)
  const color = clientColor(app.clientSlug)

  return (
    <>
      <div className="px-6 pb-5 pt-4">
        <h2 className="flex items-center gap-2 text-lg font-semibold leading-snug text-tk-onyx">
          <span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: color }} />
          {app.name}
        </h2>
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-tk-slate/70">
          <span
            aria-hidden
            className="size-2 rounded-full"
            style={{ background: STATE_DOT[verdict.state] }}
          />
          <span
            className={cn(
              "font-semibold",
              verdict.state === "down"
                ? "text-[#B4322A]"
                : verdict.state === "degraded"
                  ? "text-[#8A5A05]"
                  : "text-tk-onyx"
            )}
          >
            {verdict.label}
          </span>
          <span className="text-tk-slate/25">·</span>
          <span>{app.stack}</span>
        </p>

        {!WIRED ? (
          <p className="mt-3 rounded-lg border border-dashed border-tk-slate/25 bg-tk-linen/50 px-3 py-2 text-[12px] leading-relaxed text-tk-slate/75">
            <span className="font-semibold text-tk-onyx">Preview.</span> Nothing
            below is polled yet — the numbers are illustrative, so the layout can
            be judged before the probes exist.
          </p>
        ) : null}

        <div className="mt-4 grid grid-cols-4 gap-1.5">
          {app.surfaces.map((surface) => (
            <div
              key={surface.kind}
              className="rounded-lg border border-tk-slate/12 px-2 py-1.5 text-center"
            >
              <span
                aria-hidden
                className="mx-auto block size-1.5 rounded-full"
                style={{ background: STATE_DOT[surface.state] }}
              />
              <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-wide text-tk-slate/55">
                {surface.label}
              </p>
              <p
                className={cn(
                  "truncate text-[11.5px] font-semibold",
                  surface.state === "down"
                    ? "text-[#B4322A]"
                    : surface.state === "degraded"
                      ? "text-[#8A5A05]"
                      : "text-tk-onyx"
                )}
              >
                {surface.headline}
              </p>
            </div>
          ))}
        </div>
      </div>

      {app.surfaces.map((surface) => (
        <SurfaceSection key={surface.kind} surface={surface} />
      ))}

      <section className="border-t border-tk-slate/10 px-6 py-4">
        <h3 className="text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/55">
          To wire it
        </h3>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-tk-onyx px-3.5 py-3 font-mono text-[11px] leading-relaxed text-[#CFD8D4]">
          <code>{`npm run site:set -- ${app.slug}-api uptimeMonitorId <id>
npm run site:set -- ${app.slug} uptimeMonitorId <id>
npm run wire:monitor -- ${app.slug}-daily "Daily run" ${app.slug} 1440 180
# Resend: read-only RESEND_API_KEY + the sending domain`}</code>
        </pre>
      </section>
    </>
  )
}

function SurfaceSection({ surface }: { surface: AppSurface }) {
  return (
    <section className="border-t border-tk-slate/10 px-6 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/55">
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ background: STATE_DOT[surface.state] }}
          />
          {surface.label}
        </h3>
        <p className="font-mono text-[10.5px] text-tk-slate/40">{surface.provider}</p>
      </div>

      <span className="mt-2.5 flex h-7 items-end gap-[2px]" aria-hidden>
        {surface.bars.map((bar, i) => (
          <span
            key={i}
            className={cn(
              "min-w-0 flex-1 rounded-[1.5px]",
              BAR_TONE[bar.tone],
              bar.tone === "ok" && "opacity-70"
            )}
            style={{ height: `${Math.round(bar.v * 100)}%` }}
          />
        ))}
      </span>
      <p className="mt-1 font-mono text-[10.5px] text-tk-slate/40">{surface.barsLabel}</p>

      <dl className="mt-3 space-y-1.5">
        {surface.facts.map((fact) => (
          <div key={fact.label} className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-[12px] text-tk-slate/60">{fact.label}</dt>
            <dd className="min-w-0 truncate text-right font-mono text-[11.5px] text-tk-onyx">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-2.5 text-[12px] leading-relaxed text-tk-slate/70">{surface.note}</p>
    </section>
  )
}
