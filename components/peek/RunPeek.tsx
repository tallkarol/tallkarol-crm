import Link from "next/link"
import { Fact, Facts, GonePeek, PeekSection } from "@/components/peek/bits"
import { ROUTES } from "@/lib/nav"
import { RUN_STATUS_LABEL, type RunStatus } from "@/lib/punchlist"
import { loadRun } from "@/lib/punchlists"

function stamp(d: Date | null) {
  return d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—"
}

/** One test run: what was asked, who ran it, what came back. */
export async function RunPeek({ id }: { id: string }) {
  const run = await loadRun(id)
  if (!run) return <GonePeek />
  const status = run.status as RunStatus
  const report = run.report ?? {}

  return (
    <>
      <div className="px-6 pt-5">
        <p className="text-base font-semibold text-tk-onyx">{run.item.title}</p>
        <p className="mt-1 text-sm text-tk-slate/70">
          <Link href={ROUTES.punchlist(run.item.punchlist.slug)} className="font-semibold text-tk-teal hover:underline">
            {run.item.punchlist.title}
          </Link>
          {" · "}
          {run.item.punchlist.client.name}
        </p>
        <p className="mt-3">
          <span
            className={
              "rounded-full px-2.5 py-1 text-[11px] font-semibold " +
              (status === "pass"
                ? "bg-tk-teal/10 text-tk-teal"
                : status === "fail" || status === "blocked"
                  ? "bg-red-50 text-red-700"
                  : "bg-amber-50 text-amber-700")
            }
          >
            {RUN_STATUS_LABEL[status] ?? run.status}
          </span>
        </p>
        {run.verdict ? (
          <p className="mt-3 text-[13.5px] leading-relaxed text-tk-onyx">{run.verdict}</p>
        ) : null}
      </div>

      <PeekSection title="Run">
        <Facts>
          <Fact label="Requested">{stamp(run.requestedAt)}</Fact>
          <Fact label="Finished">{stamp(run.finishedAt)}</Fact>
          <Fact label="Runner">{run.runner || "—"}</Fact>
          <Fact label="Session">
            {run.sessionRef ? (
              <Link
                href={`${ROUTES.timesheetReview}?peek=session:${encodeURIComponent(run.sessionRef)}`}
                className="font-semibold text-tk-teal hover:underline"
              >
                {run.sessionRef.slice(0, 8)}
              </Link>
            ) : (
              "—"
            )}
          </Fact>
        </Facts>
      </PeekSection>

      <PeekSection title="Spec">
        <dl className="space-y-1 text-[12.5px] text-tk-slate">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-tk-slate/50">kind</dt>
            <dd>{run.spec.kind}{run.spec.url ? ` · ${run.spec.url}` : ""}{run.spec.command ? ` · ${run.spec.command}` : ""}</dd>
          </div>
          {run.spec.steps?.length ? (
            <div className="flex gap-2">
              <dt className="w-16 shrink-0 text-tk-slate/50">steps</dt>
              <dd>
                <ol className="list-decimal pl-4">
                  {run.spec.steps.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ol>
              </dd>
            </div>
          ) : null}
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-tk-slate/50">expect</dt>
            <dd>{run.spec.expect}</dd>
          </div>
        </dl>
      </PeekSection>

      {report.findings?.length || report.notCovered?.length || report.evidence?.length || report.fixes?.length ? (
        <PeekSection title="Report">
          {report.findings?.length ? (
            <ReportList label="Findings" items={report.findings} tone="bad" />
          ) : null}
          {report.fixes?.length ? <ReportList label="Fixed directly" items={report.fixes} /> : null}
          {report.notCovered?.length ? <ReportList label="Not covered" items={report.notCovered} /> : null}
          {report.evidence?.length ? <ReportList label="Evidence" items={report.evidence} mono /> : null}
        </PeekSection>
      ) : null}
    </>
  )
}

function ReportList({
  label,
  items,
  tone,
  mono = false,
}: {
  label: string
  items: string[]
  tone?: "bad"
  mono?: boolean
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/55">{label}</p>
      <ul className={"mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] " + (tone === "bad" ? "text-red-800" : "text-tk-slate")}>
        {items.map((item, i) => (
          <li key={i} className={mono ? "break-all font-mono text-[11.5px]" : undefined}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
