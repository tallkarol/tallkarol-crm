import { Badge } from "@/components/work/Badge"
import { Card } from "@/components/insights/Card"
import { RULE_LABELS } from "@/lib/insights/gsc-rules"
import type { GscFinding, GscScan } from "@/db/schema"

/**
 * The index-coverage half of the Health tab.
 *
 * Deliberately not its own tab: it answers the question this tab already asks —
 * is anything broken — and one fewer tab is one fewer thing to look at.
 */

const TONE: Record<number, "muted" | "neutral" | "teal"> = {
  1: "muted",
  2: "neutral",
  3: "teal",
}
const SEVERITY_LABEL: Record<number, string> = {
  1: "Blocking",
  2: "Should fix",
  3: "Watch",
}

function path(url: string) {
  try {
    return new URL(url).pathname || url
  } catch {
    return url
  }
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="px-5 py-3">
      <p className="text-xl font-semibold tabular-nums text-tk-onyx">{n}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-tk-slate/55">
        {label}
      </p>
    </div>
  )
}

export function IndexHealth({
  scan,
  open,
  resolvedThisPeriod,
}: {
  scan: GscScan | null
  open: GscFinding[]
  resolvedThisPeriod: GscFinding[]
}) {
  if (!scan) {
    return (
      <Card title="Index coverage" note="no scan yet" className="mt-3">
        <p className="px-5 py-4 text-sm text-tk-slate/70">
          Nothing scanned yet. The scan runs from{" "}
          <code className="text-tk-onyx">/api/insights/gsc-scan?site=&lt;slug&gt;</code> — one
          URL Inspection call per sitemap URL, so it runs on a schedule rather than
          on this page.
        </p>
      </Card>
    )
  }

  const ticketable = open.filter((f) => f.severity <= 2)
  const watch = open.filter((f) => f.severity === 3)
  // jsonb comes back as `unknown`; the writer is the only producer, so this
  // cast is describing our own shape rather than trusting the database.
  const sitemaps = (scan.sitemaps ?? []) as {
    path: string
    errors: number
    warnings: number
    submitted: number
  }[]

  return (
    <Card
      title="Index coverage"
      note={`scanned ${scan.scannedOn}`}
      className="mt-3"
    >
      <div className="grid grid-cols-2 divide-x divide-tk-slate/10 border-b border-tk-slate/10 sm:grid-cols-4">
        <Stat n={`${scan.passCount}/${scan.urlCount}`} label="Indexed" />
        <Stat n={ticketable.length} label="To fix" />
        <Stat n={resolvedThisPeriod.length} label="Fixed this period" />
        <Stat n={watch.length} label="Watch only" />
      </div>

      {ticketable.length === 0 ? (
        <p className="px-5 py-4 text-sm text-tk-slate/70">
          Nothing to fix. {scan.passCount} of {scan.urlCount} sitemap URLs are indexed.
        </p>
      ) : (
        <ul className="divide-y divide-tk-slate/10">
          {ticketable.map((f) => (
            <li key={f.id} className="px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={TONE[f.severity] ?? "neutral"}>
                  {SEVERITY_LABEL[f.severity] ?? "Finding"}
                </Badge>
                <p className="text-sm font-medium text-tk-onyx">
                  {RULE_LABELS[f.rule] ?? f.rule}
                </p>
                <code className="text-xs text-tk-slate/70">{path(f.url)}</code>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-tk-slate/70">{f.detail}</p>
              <p className="mt-1 text-[11px] text-tk-slate/50">
                First seen {f.firstSeenOn}
                {f.timesSeen > 1 ? ` · seen in ${f.timesSeen} scans` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {resolvedThisPeriod.length > 0 ? (
        <div className="border-t border-tk-slate/10 bg-tk-linen/40">
          <p className="px-5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-tk-slate/55">
            Fixed this period — the billable half
          </p>
          <ul className="divide-y divide-tk-slate/10">
            {resolvedThisPeriod.map((f) => (
              <li key={f.id} className="px-5 py-2.5">
                <p className="text-sm text-tk-onyx">
                  {RULE_LABELS[f.rule] ?? f.rule}{" "}
                  <code className="text-xs text-tk-slate/70">{path(f.url)}</code>
                </p>
                <p className="mt-0.5 text-[11px] text-tk-slate/55">
                  Open {f.firstSeenOn} → gone {f.resolvedOn}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sitemaps.length > 0 ? (
        <p className="border-t border-tk-slate/10 px-5 py-2.5 text-[11px] text-tk-slate/55">
          Sitemap:{" "}
          {sitemaps
            .map((m) => `${m.submitted} URLs, ${m.errors} errors, ${m.warnings} warnings`)
            .join(" · ")}
        </p>
      ) : null}
    </Card>
  )
}
