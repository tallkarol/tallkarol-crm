import Link from "next/link"
import { ItemRow } from "@/components/punchlist/ItemRow"
import { AcceptDraftButton } from "@/components/punchlist/AcceptDraft"
import { ROUTES } from "@/lib/nav"
import {
  LIST_STATUS_LABEL,
  SOURCE_KIND_LABEL,
  groupBySection,
  matchesState,
  type StateFilter,
} from "@/lib/punchlist"
import {
  acceptDraftAction,
  requestTestAction,
  setItemStateAction,
  setItemTestAction,
} from "@/lib/punchlist-actions"
import type { PunchlistView } from "@/lib/punchlists"
import { cn } from "@/lib/cn"
import { formatDay } from "@/lib/work"

const FILTERS: { key: StateFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "todo", label: "To do" },
  { key: "doing", label: "Doing" },
  { key: "done", label: "Done" },
]

/**
 * The punch list itself — header, filter chips, sections, rows. Rendered by
 * the full page and by the peek, the same way TaskDetailBody serves both.
 * `compact` drops the header facts the peek's eyebrow already states.
 */
export function PunchlistBody({
  list,
  filter,
  base,
  compact = false,
}: {
  list: PunchlistView
  filter: StateFilter
  base: string
  compact?: boolean
}) {
  const visible = list.items.filter((item) => matchesState(item, filter))
  const sections = groupBySection(visible)
  const counts = {
    all: list.items.length,
    todo: list.items.filter((i) => matchesState(i, "todo")).length,
    doing: list.items.filter((i) => i.state === "doing").length,
    done: list.progress.done,
  }
  const draft = list.effectiveStatus === "draft"
  const sourceLabel = [
    SOURCE_KIND_LABEL[list.sourceKind] ?? list.sourceKind,
    list.sourceRef || null,
  ]
    .filter(Boolean)
    .join(": ")

  return (
    <div>
      <div className={cn("px-5", compact ? "pt-4" : "pt-5")}>
        {!compact ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-tk-onyx">{list.title}</h1>
              <p className="mt-1 text-sm text-tk-slate/70">
                <Link href={ROUTES.client(list.client.slug)} className="font-semibold text-tk-teal hover:underline">
                  {list.client.name}
                </Link>
                {list.project ? (
                  <>
                    {" · "}
                    <Link href={ROUTES.project(list.project.slug)} className="font-semibold text-tk-teal hover:underline">
                      {list.project.name}
                    </Link>
                  </>
                ) : null}
                {" · "}
                {formatDay(list.createdAt.toISOString().slice(0, 10))}
              </p>
            </div>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                list.effectiveStatus === "done" && "bg-tk-teal/10 text-tk-teal",
                list.effectiveStatus === "open" && "bg-tk-linen text-tk-slate",
                list.effectiveStatus === "draft" && "bg-amber-50 text-amber-700",
                list.effectiveStatus === "void" && "bg-tk-slate/10 text-tk-slate/60"
              )}
            >
              {LIST_STATUS_LABEL[list.effectiveStatus]}
            </span>
          </div>
        ) : null}

        {list.intro ? (
          <p className="mt-3 text-[13.5px] leading-relaxed text-tk-slate">{list.intro}</p>
        ) : null}
        {sourceLabel ? (
          <p className="mt-1.5 text-xs text-tk-slate/60">
            Generated {sourceLabel}
            {list.generatedBy ? ` · ${list.generatedBy}` : ""}
            {list.sessionRef ? (
              <>
                {" · "}
                <Link
                  href={`${base}?peek=session:${encodeURIComponent(list.sessionRef)}`}
                  scroll={false}
                  className="font-semibold text-tk-teal hover:underline"
                >
                  session {list.sessionRef.slice(0, 8)}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] tabular-nums text-tk-slate/70">
              {list.progress.done} / {list.progress.total} done
            </span>
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-tk-slate/10" aria-hidden>
              <span
                className="block h-full rounded-full bg-tk-teal transition-[width]"
                style={{ width: `${list.progress.pct}%` }}
              />
            </span>
          </div>
          {draft ? (
            <AcceptDraftButton
              count={list.items.filter((i) => !i.taskId).length}
              action={acceptDraftAction.bind(null, list.id, list.slug)}
            />
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter items">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "all" ? base : `${base}?state=${f.key}`}
              scroll={false}
              role="tab"
              aria-selected={filter === f.key}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors",
                filter === f.key
                  ? "border-tk-teal bg-tk-teal text-tk-linen"
                  : "border-tk-slate/20 bg-white text-tk-slate hover:border-tk-teal hover:text-tk-teal"
              )}
            >
              {f.label}
              <span className="ml-1 font-mono text-[10.5px] tabular-nums opacity-70">{counts[f.key]}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-4 px-5 pb-5">
        {sections.length === 0 ? (
          <p className="text-sm text-tk-slate/60">Nothing here for that filter.</p>
        ) : null}
        {sections.map((section) => (
          <section key={section.section || "_"}>
            {section.section || sections.length > 1 ? (
              <div className="flex items-baseline justify-between px-1 pb-1.5">
                <h2 className="text-[12.5px] font-bold text-tk-onyx">
                  {section.section || "Items"}
                </h2>
                <span className="font-mono text-[11px] tabular-nums text-tk-slate/55">
                  {section.done}/{section.total}
                </span>
              </div>
            ) : null}
            <ul className="divide-y divide-tk-slate/10 overflow-hidden rounded-2xl border border-tk-slate/15 bg-white shadow-sm">
              {section.items.map((item) => {
                const run = list.latestRuns[item.id]
                return (
                  <ItemRow
                    key={item.id}
                    item={item}
                    draft={draft}
                    peekBase={base}
                    latestRun={
                      run
                        ? {
                            id: run.id,
                            status: run.status,
                            verdict: run.verdict,
                            finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
                          }
                        : null
                    }
                    setState={setItemStateAction.bind(null, item.id)}
                    requestTest={requestTestAction.bind(null, item.id, list.slug)}
                    saveTest={setItemTestAction.bind(null, item.id, list.slug)}
                  />
                )
              })}
            </ul>
          </section>
        ))}

        {list.sourceText && !compact ? (
          <details className="rounded-2xl border border-tk-slate/15 bg-white px-5 py-3 shadow-sm">
            <summary className="cursor-pointer text-[12.5px] font-semibold text-tk-slate">
              Source text
            </summary>
            <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-tk-slate">
              {list.sourceText}
            </pre>
          </details>
        ) : null}
      </div>
    </div>
  )
}
