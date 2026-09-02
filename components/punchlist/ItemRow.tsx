"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { ItemStateCircle } from "@/components/punchlist/ItemState"
import { cn } from "@/lib/cn"
import {
  ITEM_STATE_LABEL,
  RUN_STATUS_LABEL,
  type ItemState,
  type ItemView,
  type RunStatus,
} from "@/lib/punchlist"

type ActionResult = { ok: boolean; error?: string }

export type ItemRowProps = {
  item: ItemView
  index: number
  draft: boolean
  peekBase: string
  defaultOpen?: boolean
  latestRun: { id: string; status: string; verdict: string; finishedAt: string | null } | null
  setState: (state: ItemState) => Promise<ActionResult>
  requestTest: () => Promise<ActionResult>
  saveTest: (raw: string) => Promise<ActionResult>
}

function testTone(status: string) {
  if (status === "pass") return "bg-tk-teal/10 text-tk-teal"
  if (status === "fail" || status === "blocked") return "bg-red-50 text-red-700"
  if (status === "queued" || status === "running") return "bg-amber-50 text-amber-700"
  return "bg-tk-linen text-tk-slate"
}

/** The small uppercase label that opens each block of prose. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-tk-slate/45">
      {children}
    </p>
  )
}

/**
 * One item, laid out like a numbered clause in a report: the state circle,
 * the item number, the title with its chips, and the Reported / Fix prose.
 * Open items show their prose by default — a punch list is meant to be read,
 * not clicked open one row at a time — while done ones collapse to a line.
 * The row never writes the item's state itself; the circle writes the task
 * and the page re-reads.
 */
export function ItemRow({
  item,
  index,
  draft,
  peekBase,
  defaultOpen = false,
  latestRun,
  setState,
  requestTest,
  saveTest,
}: ItemRowProps) {
  const router = useRouter()
  const hasDetail = Boolean(item.reported || item.outcome)
  const [open, setOpen] = useState(defaultOpen && hasDetail)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [testDraft, setTestDraft] = useState(
    item.test ? JSON.stringify(item.test, null, 2) : ""
  )
  const [pending, startTransition] = useTransition()

  const testStatus = item.lastTestStatus as RunStatus | ""
  const done = item.state === "done"
  const expandable = hasDetail || Boolean(item.test)

  function runRequest() {
    setError(null)
    startTransition(async () => {
      const result = await requestTest()
      if (!result.ok) setError(result.error ?? "Could not request the test.")
      router.refresh()
    })
  }

  function saveSpec() {
    setError(null)
    startTransition(async () => {
      const result = await saveTest(testDraft)
      if (!result.ok) {
        setError(result.error ?? "Could not save the test.")
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <li
      className={cn(
        "group relative border-t border-tk-slate/10 transition-colors first:border-t-0",
        done ? "bg-tk-linen/25" : "bg-white"
      )}
    >
      {/* The teal edge marks what is still live, so open work reads down the page. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-[3px]",
          item.state === "doing" && "bg-tk-teal",
          item.state === "waiting" && "bg-amber-500",
          (done || item.state === "todo") && "bg-transparent"
        )}
      />

      <div className="flex items-start gap-3.5 px-5 py-4 sm:px-6">
        <div className="pt-px">
          <ItemStateCircle
            state={item.state}
            title={item.title}
            disabled={draft || !item.taskId}
            action={setState}
            onError={setError}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2.5">
            <span
              className={cn(
                "mt-[3px] shrink-0 font-mono text-[11px] tabular-nums",
                done ? "text-tk-slate/30" : "text-tk-slate/45"
              )}
            >
              {String(index).padStart(2, "0")}
            </span>

            <div className="min-w-0 flex-1">
              <h3
                className={cn(
                  "text-[15px] font-semibold leading-snug",
                  done ? "text-tk-slate/55" : "text-tk-onyx"
                )}
              >
                {item.title}
              </h3>

              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {item.kind ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em]",
                      done ? "bg-tk-slate/5 text-tk-slate/45" : "bg-tk-linen text-tk-slate/80"
                    )}
                  >
                    {item.kind}
                  </span>
                ) : null}
                {item.state === "waiting" ? (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] text-amber-700">
                    {ITEM_STATE_LABEL.waiting}
                  </span>
                ) : null}
                {item.test ? (
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em]",
                      testTone(testStatus)
                    )}
                  >
                    {testStatus
                      ? `test · ${RUN_STATUS_LABEL[testStatus as RunStatus] ?? testStatus}`
                      : "test attached"}
                  </span>
                ) : null}
                {item.taskId ? (
                  <Link
                    href={`${peekBase}?peek=task:${item.taskId}`}
                    scroll={false}
                    className="text-[10.5px] font-semibold text-tk-teal opacity-0 transition-opacity hover:underline focus:opacity-100 group-hover:opacity-100"
                  >
                    Task ↗
                  </Link>
                ) : null}
              </div>
            </div>

            {expandable ? (
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
                aria-label={open ? `Collapse ${item.title}` : `Expand ${item.title}`}
                className="-mr-1 mt-px shrink-0 rounded-md p-1 text-tk-slate/35 transition-colors hover:bg-tk-linen hover:text-tk-slate"
              >
                <ChevronDown
                  className={cn("size-4 transition-transform", open && "rotate-180")}
                />
              </button>
            ) : null}
          </div>

          {open ? (
            <div className="mt-3.5 space-y-3.5 border-l-2 border-tk-slate/10 pl-4">
              {item.reported ? (
                <div>
                  <Label>Reported</Label>
                  <blockquote className="mt-1 whitespace-pre-wrap font-serif text-[14.5px] leading-relaxed text-tk-slate/85">
                    {item.reported}
                  </blockquote>
                </div>
              ) : null}

              {item.outcome ? (
                <div>
                  <Label>Fix</Label>
                  <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-tk-onyx/90">
                    {item.outcome}
                  </p>
                </div>
              ) : null}

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Without a test there is nothing to label — just the way in. */}
                  {item.test || editing ? <Label>Test</Label> : null}
                  {item.test && !draft ? (
                    <button
                      type="button"
                      onClick={runRequest}
                      disabled={pending || testStatus === "queued" || testStatus === "running"}
                      className="rounded-full bg-tk-teal px-2.5 py-0.5 text-[10.5px] font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90 disabled:opacity-50"
                    >
                      {testStatus === "queued" || testStatus === "running"
                        ? "Waiting for an agent"
                        : "Request test"}
                    </button>
                  ) : null}
                  {latestRun ? (
                    <Link
                      href={`${peekBase}?peek=run:${latestRun.id}`}
                      scroll={false}
                      className="text-[11px] font-semibold text-tk-teal hover:underline"
                    >
                      Last run: {RUN_STATUS_LABEL[latestRun.status as RunStatus] ?? latestRun.status} ↗
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setEditing((v) => !v)}
                    className="text-[11px] font-semibold text-tk-slate/40 transition-colors hover:text-tk-teal"
                  >
                    {editing ? "Cancel" : item.test ? "Edit" : "+ Attach a test"}
                  </button>
                </div>

                {latestRun?.verdict && !editing ? (
                  <p className="mt-1 text-[12.5px] text-tk-slate">{latestRun.verdict}</p>
                ) : null}

                {!editing && item.test ? (
                  <dl className="mt-1.5 space-y-0.5 text-[12px] text-tk-slate">
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-tk-slate/50">kind</dt>
                      <dd>
                        {item.test.kind}
                        {item.test.url ? ` · ${item.test.url}` : ""}
                        {item.test.command ? ` · ${item.test.command}` : ""}
                      </dd>
                    </div>
                    {item.test.steps?.length ? (
                      <div className="flex gap-2">
                        <dt className="w-14 shrink-0 text-tk-slate/50">steps</dt>
                        <dd>
                          <ol className="list-decimal pl-4">
                            {item.test.steps.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ol>
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex gap-2">
                      <dt className="w-14 shrink-0 text-tk-slate/50">expect</dt>
                      <dd>{item.test.expect}</dd>
                    </div>
                  </dl>
                ) : null}

                {editing ? (
                  <div className="mt-2">
                    <textarea
                      value={testDraft}
                      onChange={(e) => setTestDraft(e.target.value)}
                      rows={8}
                      spellCheck={false}
                      placeholder={'{ "kind": "browser", "url": "https://…", "steps": ["…"], "expect": "…" }'}
                      className="w-full rounded-lg border border-tk-slate/20 bg-tk-linen/60 px-3 py-2 font-mono text-[12px] text-tk-onyx outline-none focus:border-tk-teal"
                    />
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={saveSpec}
                        disabled={pending}
                        className="rounded-full bg-tk-teal px-3 py-1 text-[11px] font-semibold text-tk-linen hover:bg-tk-teal/90 disabled:opacity-50"
                      >
                        Save test
                      </button>
                      <span className="text-[11px] text-tk-slate/50">
                        Empty clears it. kind: browser · http · command · manual; `expect` is required.
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {error ? (
            <p className="mt-2 text-xs font-semibold text-red-700" role="status">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  )
}
