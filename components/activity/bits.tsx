import type { ReactNode } from "react"
import { Card } from "@/components/ui/Card"
import { formatMs, formatShare } from "@/lib/activity/format"
import { cn } from "@/lib/cn"

/** Presentational pieces shared by the /activity views. Server-safe: no hooks. */

export function Panel({
  title,
  sub,
  actions,
  flush = false,
  className,
  children,
  id,
}: {
  title: ReactNode
  sub?: ReactNode
  actions?: ReactNode
  /** The body draws to the card's edges (tables). */
  flush?: boolean
  className?: string
  children: ReactNode
  id?: string
}) {
  return (
    <Card as="section" id={id} className={cn("min-w-0 scroll-mt-20", className)}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pt-4">
        <h2 className="font-ui text-[13px] font-bold text-ink">{title}</h2>
        {sub || actions ? (
          <div className="flex flex-wrap items-center gap-2">
            {sub ? <p className="font-ui text-[11.5px] font-medium text-ink-3">{sub}</p> : null}
            {actions}
          </div>
        ) : null}
      </header>
      <div className={flush ? "pb-1 pt-2" : "px-5 pb-4 pt-3"}>{children}</div>
    </Card>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-5 py-8 text-center text-[12.5px] leading-relaxed text-ink-3">{children}</p>
}

export function Scroll({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

export const TH =
  "whitespace-nowrap border-b border-line px-3 py-2 text-left font-ui text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 first:pl-5 last:pr-5"
export const TD = "border-b border-line px-3 py-2.5 align-middle text-[12.5px] text-ink-2 first:pl-5 last:pr-5"
export const TBODY = "[&_tr:last-child_td]:border-b-0"
export const NUM = "text-right tabular-nums whitespace-nowrap"

export function Name({ title, id }: { title: ReactNode; id?: ReactNode }) {
  return (
    <span className="block min-w-0">
      <b className="block whitespace-nowrap font-ui text-[13px] font-semibold text-ink">{title}</b>
      {id ? <span className="mt-px block font-mono text-[11px] text-ink-3">{id}</span> : null}
    </span>
  )
}

export function Meter({ part, whole }: { part: number; whole: number }) {
  const share = whole > 0 ? Math.min(1, part / whole) : 0
  return (
    <span className="flex items-center gap-2">
      <span className="relative block h-1.5 w-[90px] overflow-hidden rounded-full bg-chart-track">
        <span className="absolute inset-y-0 left-0 rounded-full bg-accent-mark" style={{ width: `${share * 100}%` }} />
      </span>
      <span className="min-w-[34px] tabular-nums">{formatShare(part, whole)}</span>
    </span>
  )
}

type Tone = "good" | "warn" | "bad" | "teal" | "muted"

const PILL: Record<Tone, string> = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  teal: "bg-accent-soft text-accent-ink",
  muted: "bg-well text-ink-3",
}

export function Pill({ tone, dot = true, children }: { tone: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 font-ui text-[11px] font-semibold",
        dot && "before:size-1.5 before:rounded-full before:bg-current before:content-['']",
        PILL[tone]
      )}
    >
      {children}
    </span>
  )
}

export function Chip({ tone, children }: { tone: "tune" | "hurt" | "plain"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-[5px] border px-1.5 py-0.5 font-ui text-[9.5px] font-bold uppercase tracking-[0.08em]",
        tone === "tune" && "border-accent-ink/40 text-accent-ink",
        tone === "hurt" && "border-warn/45 text-warn",
        tone === "plain" && "border-line-strong text-ink-3"
      )}
    >
      {children}
    </span>
  )
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="whitespace-nowrap rounded-[5px] border border-line bg-well px-1.5 py-px font-mono text-[11px] text-ink-2">
      {children}
    </code>
  )
}

/** Views per day, the de-emphasis line with the latest day marked. */
export function Spark({ values, label }: { values: number[]; label: string }) {
  const w = 84
  const h = 22
  if (values.length < 2) return null
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [3 + (i * (w - 6)) / (values.length - 1), h - 3 - (v / max) * (h - 7)] as const)
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")
  const [lx, ly] = pts[pts.length - 1]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="block">
      <polygon points={`3,${h - 2} ${line} ${w - 3},${h - 2}`} fill="var(--chart-prev)" opacity={0.12} />
      <polyline points={line} fill="none" stroke="var(--chart-prev)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3} fill="var(--chart-teal)" stroke="var(--chart-halo)" strokeWidth={1.5} />
    </svg>
  )
}

const SCALE_MS = 5000

/** Median (filled) to p95 (ring) on a shared 0–5 s scale. HTML, so the dots never stretch. */
export function RangePlot({ p50, p95 }: { p50: number | null; p95: number | null }) {
  if (p50 === null) return <span className="text-ink-3">—</span>
  const label = `median ${formatMs(p50)}, p95 ${formatMs(p95)}`
  if (p50 > SCALE_MS) {
    return (
      <span className="block text-right font-ui text-[10.5px] font-semibold text-ink-3" aria-label={label}>
        off the 5 s scale →
      </span>
    )
  }
  const pos = (v: number) => (Math.min(v, SCALE_MS) / SCALE_MS) * 100
  const left = pos(p50)
  const right = pos(p95 ?? p50)
  return (
    <span className="relative block h-[22px] min-w-[180px]" role="img" aria-label={label}>
      {[0, 1, 2, 3, 4, 5].map((t) => (
        <span key={t} className="absolute inset-y-0.5 w-px bg-line" style={{ left: `${t * 20}%` }} />
      ))}
      <span
        className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full"
        style={{ left: `${left}%`, width: `${Math.max(0, right - left)}%`, background: "var(--chart-teal)" }}
      />
      <span
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-card"
        style={{ left: `${right}%`, borderColor: "var(--chart-teal)" }}
      />
      <span
        className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${left}%`, background: "var(--chart-teal)", boxShadow: "0 0 0 2px var(--chart-halo)" }}
      />
      {(p95 ?? 0) > SCALE_MS ? <span className="absolute -right-1 top-0 font-ui text-[10px] font-bold text-ink-3">→</span> : null}
    </span>
  )
}

export function RangeAxis() {
  return (
    <span className="flex min-w-[180px] justify-between font-mono text-[9.5px] font-semibold normal-case tracking-normal text-ink-3">
      <span>0</span>
      <span>1</span>
      <span>2</span>
      <span>3</span>
      <span>4</span>
      <span>5 s</span>
    </span>
  )
}

export function VitalCell({ value, rating, text }: { value: number | null; rating: "good" | "needs-improvement" | "poor" | null; text: string }) {
  if (value === null || rating === null) return <span className="text-ink-3">—</span>
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="tabular-nums">{text}</span>
      <Pill tone={rating === "good" ? "good" : rating === "poor" ? "bad" : "warn"}>
        {rating === "good" ? "Good" : rating === "poor" ? "Poor" : "Needs work"}
      </Pill>
    </span>
  )
}
