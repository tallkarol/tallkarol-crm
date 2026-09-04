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
 * A section heading is its name, a rule, and a count — like a report's. The
 * sections carry their own ordinal from the source ("0 · Prep", "B · Code
 * fixes"), so adding a second number here would just compete with it.
 */
function SectionRule({
  title,
  done,
  total,
}: {
  title: string
  done: number
  total: number
}) {
  const complete = total > 0 && done === total
  return (
    <div className="flex items-center gap-3 pb-2.5">
      <h2 className="text-[11.5px] font-bold uppercase tracking-[.14em] text-tk-onyx">
        {title}
      </h2>
      <span aria-hidden className="h-px flex-1 bg-well" />
      <span
        className={cn(
          "font-mono text-[11px] tabular-nums",
          complete ? "text-tk-teal" : "text-ink-3"
        )}
      >
        {done}/{total}
      </span>
    </div>
  )
}

/**
 * The punch list itself — masthead, filter chips, numbered sections, rows.
 * Rendered by the full page and by the peek, the same way TaskDetailBody
 * serves both; `compact` drops the masthead facts the peek's eyebrow already
 * states.
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
  // Items keep the number they were filed with, whatever the filter hides.
  const numbering = new Map(list.items.map((item, i) => [item.id, i + 1]))
  // Section counts are of the whole section, not of what the filter left —
  // otherwise "B · Code fixes 0/3" under To do would mean something different
  // from the same line under All.
  const sectionTally = new Map<string, { done: number; total: number }>()
  for (const item of list.items) {
    const key = item.section || ""
    const tally = sectionTally.get(key) ?? { done: 0, total: 0 }
    tally.total += 1
    if (item.state === "done") tally.done += 1
    sectionTally.set(key, tally)
  }
  const counts = {
    all: list.items.length,
    todo: list.items.filter((i) => matchesState(i, "todo")).length,
    doing: list.items.filter((i) => i.state === "doing").length,
    done: list.progress.done,
  }
  const open = counts.all - counts.done
  const draft = list.effectiveStatus === "draft"
  const sourceLabel = [
    SOURCE_KIND_LABEL[list.sourceKind] ?? list.sourceKind,
    list.sourceRef || null,
  ]
    .filter(Boolean)
    .join(": ")

  return (
    <div>
      {!compact ? (
        <header className="border-b border-line bg-well px-5 pb-6 pt-7 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
            <p className="text-[10.5px] font-semibold uppercase tracking-[.16em] text-tk-teal">
              <Link href={ROUTES.client(list.client.slug)} className="hover:underline">
                {list.client.name}
              </Link>
              {list.project ? (
                <>
                  <span className="text-ink-3"> · </span>
                  <Link href={ROUTES.project(list.project.slug)} className="hover:underline">
                    {list.project.name}
                  </Link>
                </>
              ) : null}
              <span className="text-ink-3"> · </span>
              <span className="text-ink-3">
                {formatDay(list.createdAt.toISOString().slice(0, 10))}
              </span>
            </p>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.1em]",
                list.effectiveStatus === "done" && "bg-accent text-tk-linen",
                list.effectiveStatus === "open" && "bg-card text-tk-slate ring-1 ring-line",
                list.effectiveStatus === "draft" && "bg-amber-100 text-amber-800",
                list.effectiveStatus === "void" && "bg-well text-ink-3"
              )}
            >
              {LIST_STATUS_LABEL[list.effectiveStatus]}
            </span>
          </div>

          <h1 className="mt-3 max-w-2xl text-[27px] font-bold leading-[1.12] tracking-[-.02em] text-tk-onyx sm:text-[32px]">
            {list.title}
          </h1>

          {list.intro ? (
            <p className="mt-3 max-w-2xl font-serif text-[16px] leading-[1.6] text-tk-slate">
              {list.intro}
            </p>
          ) : null}

          {/* The count is the headline fact, so it gets to be big. */}
          <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <p className="flex items-baseline gap-1.5">
                <span className="font-mono text-[30px] font-semibold leading-none tabular-nums text-tk-onyx">
                  {list.progress.done}
                </span>
                <span className="font-mono text-[15px] leading-none tabular-nums text-ink-3">
                  / {list.progress.total}
                </span>
              </p>
              <p className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-[.14em] text-ink-3">
                Done
              </p>
            </div>
            <div>
              <p className="font-mono text-[30px] font-semibold leading-none tabular-nums text-tk-onyx">
                {open}
              </p>
              <p className="mt-1.5 text-[10.5px] font-semibold uppercase tracking-[.14em] text-ink-3">
                Still open
              </p>
            </div>
            <div className="min-w-[180px] flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-[.14em] text-ink-3">
                  Progress
                </span>
                <span className="font-mono text-[11.5px] tabular-nums text-ink-3">
                  {list.progress.pct}%
                </span>
              </div>
              <span
                className="mt-1.5 block h-2 overflow-hidden rounded-full bg-well"
                aria-hidden
              >
                <span
                  className="block h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{ width: `${list.progress.pct}%` }}
                />
              </span>
            </div>
          </div>

          {sourceLabel || draft ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-3.5">
              {sourceLabel ? (
                <p className="text-[11.5px] text-ink-3">
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
              {draft ? (
                <AcceptDraftButton
                  count={list.items.filter((i) => !i.taskId).length}
                  action={acceptDraftAction.bind(null, list.id, list.slug)}
                />
              ) : null}
            </div>
          ) : null}
        </header>
      ) : null}

      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 border-b border-line px-5 py-3 sm:px-8",
          compact && "px-6 sm:px-6"
        )}
        role="tablist"
        aria-label="Filter items"
      >
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key === "all" ? base : `${base}?state=${f.key}`}
            scroll={false}
            role="tab"
            aria-selected={filter === f.key}
            className={cn(
              "rounded-full px-3 py-1 text-[11.5px] font-semibold transition-colors",
              filter === f.key
                ? "bg-tk-onyx text-tk-linen"
                : "text-ink-3 hover:bg-well transition-colors duration-[120ms] hover:text-tk-onyx"
            )}
          >
            {f.label}
            <span className="ml-1.5 font-mono text-[10.5px] tabular-nums opacity-60">
              {counts[f.key]}
            </span>
          </Link>
        ))}
        {compact ? null : (
          <span className="ml-auto text-[11px] text-ink-3">
            Click a circle to move an item · to do → doing → done
          </span>
        )}
      </div>

      <div className={cn("space-y-7 px-5 py-6 sm:px-8", compact && "px-6 py-5 sm:px-6")}>
        {sections.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">
            Nothing here for that filter.
          </p>
        ) : null}

        {sections.map((section) => (
          <section key={section.section || "_"}>
            {section.section || sections.length > 1 ? (
              <SectionRule
                title={section.section || "Items"}
                done={sectionTally.get(section.section || "")?.done ?? section.done}
                total={sectionTally.get(section.section || "")?.total ?? section.total}
              />
            ) : null}
            <ul className="overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(15,22,21,.04)]">
              {section.items.map((item) => {
                const run = list.latestRuns[item.id]
                return (
                  <ItemRow
                    key={item.id}
                    item={item}
                    index={numbering.get(item.id) ?? 0}
                    draft={draft}
                    peekBase={base}
                    defaultOpen={!compact && item.state !== "done"}
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
          <details className="rounded-xl border border-line bg-card px-5 py-3 shadow-[0_1px_2px_rgba(15,22,21,.04)]">
            <summary className="cursor-pointer text-[11.5px] font-semibold uppercase tracking-[.12em] text-ink-3 hover:text-tk-onyx">
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
