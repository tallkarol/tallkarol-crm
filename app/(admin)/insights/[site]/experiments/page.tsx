import { notFound } from "next/navigation"
import { Badge } from "@/components/work/Badge"
import { Card } from "@/components/insights/Card"
import { CaptureReading, ExperimentOutcome } from "@/components/insights/ExperimentBits"
import {
  getExperimentsForSite,
  formLocationsOf,
  pagesOf,
  type ExperimentWithReadings,
} from "@/lib/experiments/queries"
import {
  CHECKPOINTS,
  CHECKPOINT_LABEL,
  checkpointReady,
  checkpointWindow,
  rate,
  type Checkpoint,
  type FunnelCounts,
  type PageSpec,
  type ReadingPayload,
} from "@/lib/experiments/types"
import { fmtDayYear, fmtInt, todayKey } from "@/lib/insights/derive"
import { getInsightsContext } from "@/lib/insights/queries"

export const metadata = { title: "Experiments · Insights" }
export const dynamic = "force-dynamic"

const ROLE_TONE = {
  target: "teal",
  guardrail: "neutral",
  context: "muted",
} as const

function pct(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(value < 0.1 ? 2 : 1)}%`
}

/** Reading for a checkpoint, or null if it has not been captured. */
function readingFor(experiment: ExperimentWithReadings, checkpoint: Checkpoint) {
  return experiment.readings.find((r) => r.checkpoint === checkpoint) ?? null
}

function countsFor(
  payload: ReadingPayload | null,
  pageKey: string
): FunnelCounts | null {
  return payload?.pages?.[pageKey] ?? null
}

/**
 * One row per watched page: what it did at baseline against the most recent
 * reading. Deliberately plain numbers — the point is to see movement, not to
 * be told what it means.
 */
function PageTable({
  pages,
  baseline,
  latest,
  latestLabel,
}: {
  pages: PageSpec[]
  baseline: ReadingPayload | null
  latest: ReadingPayload | null
  latestLabel: string
}) {
  return (
    <div className="overflow-x-auto px-5 pb-4 pt-3">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-tk-slate/15 text-[10.5px] uppercase tracking-wide text-tk-slate/55">
            <th className="pb-2 pr-3 text-left font-semibold">Page</th>
            <th className="pb-2 px-2 text-right font-semibold">Sessions</th>
            <th className="pb-2 px-2 text-right font-semibold">Form starts</th>
            <th className="pb-2 px-2 text-right font-semibold">Start rate</th>
            <th className="pb-2 px-2 text-right font-semibold">Enquiries</th>
            <th className="pb-2 pl-2 text-right font-semibold">Enquiry rate</th>
          </tr>
        </thead>
        <tbody>
          {pages.map((page) => {
            const base = countsFor(baseline, page.key)
            const now = countsFor(latest, page.key)
            return (
              <tr key={page.key} className="border-b border-tk-slate/8 last:border-0">
                <td className="py-2 pr-3">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-tk-onyx">{page.label}</span>
                    <Badge tone={ROLE_TONE[page.role]}>{page.role}</Badge>
                  </span>
                  <span className="mt-0.5 block font-mono text-[11px] text-tk-slate/50">
                    {page.path}
                  </span>
                </td>
                <Cells base={base?.sessions ?? null} now={now?.sessions ?? null} />
                <Cells base={base?.formStarts ?? null} now={now?.formStarts ?? null} />
                <RateCells
                  base={base ? rate(base.formStarts, base.sessions) : null}
                  now={now ? rate(now.formStarts, now.sessions) : null}
                />
                <Cells base={base?.leads ?? null} now={now?.leads ?? null} />
                <RateCells
                  base={base ? rate(base.leads, base.sessions) : null}
                  now={now ? rate(now.leads, now.sessions) : null}
                />
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[11px] text-tk-slate/55">
        Small figure is the baseline; large figure is {latestLabel}.
      </p>
    </div>
  )
}

function Cells({ base, now }: { base: number | null; now: number | null }) {
  return (
    <td className="px-2 py-2 text-right tabular-nums">
      <span className="block font-semibold text-tk-onyx">
        {now === null ? "—" : fmtInt(now)}
      </span>
      <span className="block text-[11px] text-tk-slate/50">
        {base === null ? "—" : fmtInt(base)}
      </span>
    </td>
  )
}

function RateCells({ base, now }: { base: number | null; now: number | null }) {
  return (
    <td className="px-2 py-2 text-right tabular-nums">
      <span className="block font-semibold text-tk-onyx">{pct(now)}</span>
      <span className="block text-[11px] text-tk-slate/50">{pct(base)}</span>
    </td>
  )
}

function ExperimentCard({
  experiment,
  siteSlug,
  today,
}: {
  experiment: ExperimentWithReadings
  siteSlug: string
  today: string
}) {
  const pages = pagesOf(experiment)
  const formLocations = formLocationsOf(experiment)
  const baseline = (readingFor(experiment, "baseline")?.payload ?? null) as ReadingPayload | null

  const laterCheckpoints = CHECKPOINTS.filter((c) => c !== "baseline")
  const latestCaptured = [...laterCheckpoints]
    .reverse()
    .find((c) => readingFor(experiment, c))
  const latest = latestCaptured
    ? ((readingFor(experiment, latestCaptured)!.payload ?? null) as ReadingPayload | null)
    : null

  const caveats = (latest ?? baseline)?.caveats ?? []
  const locationRows = latest
    ? formLocations
        .map((spec) => ({ spec, counts: latest.formLocations?.[spec.key] ?? null }))
        .filter((row) => row.counts && (row.counts.formStarts > 0 || row.counts.leads > 0))
    : []

  return (
    <Card
      title={experiment.name}
      right={
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={experiment.status === "running" ? "teal" : "muted"}>
            {experiment.status}
          </Badge>
          {experiment.verdict ? <Badge tone="neutral">{experiment.verdict}</Badge> : null}
        </span>
      }
    >
      <div className="px-5 pb-1 pt-2">
        <p className="text-[11px] text-tk-slate/55">
          Shipped {fmtDayYear(experiment.startedOn)} · baseline{" "}
          {fmtDayYear(experiment.baselineFrom)} → {fmtDayYear(experiment.baselineTo)}
        </p>
        {experiment.changeNote ? (
          <p className="mt-2 text-sm text-tk-slate/80">{experiment.changeNote}</p>
        ) : null}
        {experiment.hypothesis ? (
          <p className="mt-2 border-l-2 border-tk-teal/40 pl-3 text-sm italic text-tk-slate/70">
            {experiment.hypothesis}
          </p>
        ) : null}
      </div>

      {pages.length ? (
        <PageTable
          pages={pages}
          baseline={baseline}
          latest={latest}
          latestLabel={latestCaptured ? CHECKPOINT_LABEL[latestCaptured] : "not yet captured"}
        />
      ) : null}

      {locationRows.length ? (
        <div className="border-t border-tk-slate/10 px-5 py-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/55">
            By form location — {latestCaptured ? CHECKPOINT_LABEL[latestCaptured] : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1.5">
            {locationRows.map(({ spec, counts }) => (
              <span key={spec.key} className="text-sm">
                <span className="font-semibold text-tk-onyx">{spec.label}</span>{" "}
                <span className="tabular-nums text-tk-slate/70">
                  {fmtInt(counts!.formStarts)} starts · {fmtInt(counts!.leads)} enquiries
                </span>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-tk-slate/10 px-5 py-3">
        {CHECKPOINTS.map((checkpoint) => {
          const window = checkpointWindow(experiment, checkpoint)
          const captured = Boolean(readingFor(experiment, checkpoint))
          return (
            <span key={checkpoint} className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-tk-slate/70">
                {CHECKPOINT_LABEL[checkpoint]}
              </span>
              <CaptureReading
                siteSlug={siteSlug}
                experimentSlug={experiment.slug}
                checkpoint={checkpoint}
                label={CHECKPOINT_LABEL[checkpoint]}
                ready={checkpointReady(experiment, checkpoint, today)}
                captured={captured}
                windowTo={window.to}
              />
            </span>
          )
        })}
      </div>

      {caveats.length ? (
        <ul className="border-t border-tk-slate/10 px-5 py-3 text-[11px] text-tk-slate/55">
          {caveats.map((caveat) => (
            <li key={caveat} className="before:mr-1.5 before:content-['·']">
              {caveat}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="border-t border-tk-slate/10 px-5 py-3">
        <ExperimentOutcome
          siteSlug={siteSlug}
          experimentSlug={experiment.slug}
          status={experiment.status}
          verdict={experiment.verdict}
        />
      </div>
    </Card>
  )
}

export default async function InsightsExperimentsPage({
  params,
}: {
  params: { site: string }
}) {
  const ctx = await getInsightsContext(params.site)
  if (!ctx) notFound()
  const { site } = ctx

  const all = await getExperimentsForSite(site.id)
  const today = todayKey()

  if (!all.length) {
    return (
      <div className="rounded-2xl border border-dashed border-tk-slate/20 bg-white/80 px-6 py-10 text-center shadow-sm">
        <p className="text-sm font-semibold text-tk-onyx">No experiments yet</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-tk-slate/70">
          An experiment is a change you made on purpose, with readings taken at
          30, 60 and 90 days so you can see what it did. Seed one with{" "}
          <code className="rounded bg-tk-linen px-1 py-0.5 font-mono text-[11px]">
            npm run experiment:seed
          </code>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {all.map((experiment) => (
        <ExperimentCard
          key={experiment.id}
          experiment={experiment}
          siteSlug={site.slug}
          today={today}
        />
      ))}
    </div>
  )
}
