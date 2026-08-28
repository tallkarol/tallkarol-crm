import type { SourceHealth } from "@/lib/insights/types"

function dotColor(ok: boolean | null) {
  if (ok === true) return "#1B6B3A"
  if (ok === false) return "#A62228"
  return "#9AA6A2"
}

/** Compact status row — the full story lives in the Health tab. */
export function HealthPills({ health }: { health: SourceHealth[] }) {
  if (health.length === 0) {
    return <p className="px-5 py-4 text-sm text-tk-slate/70">No sources apply to this property.</p>
  }
  return (
    <div className="flex flex-wrap gap-1.5 px-5 py-3.5">
      {health.map((h) => (
        <span
          key={h.id}
          title={h.detail}
          className="inline-flex items-center gap-1.5 rounded-full border border-tk-slate/15 bg-tk-linen/40 px-2.5 py-1 text-[10.5px] font-semibold text-tk-slate"
        >
          <i
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: dotColor(h.ok) }}
            aria-hidden
          />
          {h.label}
          <span className="sr-only">
            {h.ok === true ? " — live" : h.ok === false ? " — needs attention" : " — unknown"}
          </span>
        </span>
      ))}
    </div>
  )
}
