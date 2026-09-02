"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronRight } from "lucide-react"
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
  draft: boolean
  peekBase: string
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

/**
 * One item: the state circle, the title with its kind chip and test chip,
 * and — on click — the Reported / Fix blocks, the task link, and the test
 * editor. The row never writes the item's state itself; the circle writes
 * the task and the page re-reads.
 */
export function ItemRow({
  item,
  draft,
  peekBase,
  latestRun,
  setState,
  requestTest,
  saveTest,
}: ItemRowProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [testDraft, setTestDraft] = useState(
    item.test ? JSON.stringify(item.test, null, 2) : ""
  )
  const [pending, startTransition] = useTransition()

  const hasDetail = Boolean(item.reported || item.outcome)
  const testStatus = item.lastTestStatus as RunStatus | ""

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
    <li className={cn("group", item.state === "done" && "bg-tk-linen/40")}>
      <div className="flex items-start gap-3 px-5 py-3">
        <div className="pt-[3px]">
          <ItemStateCircle
            state={item.state}
            title={item.title}
            disabled={draft || !item.taskId}
            action={setState}
            onError={setError}
          />
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span
              className={cn(
                "text-[13.5px] font-semibold",
                item.state === "done" ? "text-tk-slate/50 line-through" : "text-tk-onyx"
              )}
            >
              {item.title}
            </span>
            <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 align-middle">
              {item.kind ? (
                <span className="rounded-full bg-tk-linen px-2 py-0.5 text-[10.5px] font-semibold text-tk-slate">
                  {item.kind}
                </span>
              ) : null}
              {item.state === "waiting" ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
                  {ITEM_STATE_LABEL.waiting}
                </span>
              ) : null}
              {item.test ? (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                    testTone(testStatus)
                  )}
                >
                  {testStatus ? `test · ${RUN_STATUS_LABEL[testStatus as RunStatus] ?? testStatus}` : "test attached"}
                </span>
              ) : null}
            </span>
          </span>
          {hasDetail || item.test ? (
            <span className="mt-0.5 shrink-0 text-tk-slate/40">
              {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </span>
          ) : null}
        </button>

        {item.taskId ? (
          <Link
            href={`${peekBase}?peek=task:${item.taskId}`}
            scroll={false}
            className="mt-0.5 shrink-0 text-[11px] font-semibold text-tk-teal opacity-0 transition-opacity hover:underline group-hover:opacity-100 focus:opacity-100"
          >
            Task ↗
          </Link>
        ) : null}
      </div>

      {open ? (
        <div className="space-y-3 px-5 pb-4 pl-[3.25rem]">
          {item.reported ? (
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/55">
                Reported
              </p>
              <blockquote className="mt-1 whitespace-pre-wrap border-l-2 border-tk-slate/20 pl-3 text-[13px] leading-relaxed text-tk-slate">
                {item.reported}
              </blockquote>
            </div>
          ) : null}
          {item.outcome ? (
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/55">
                Fix
              </p>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-tk-onyx">
                {item.outcome}
              </p>
            </div>
          ) : null}

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/55">
                Test
              </p>
              {item.test && !draft ? (
                <button
                  type="button"
                  onClick={runRequest}
                  disabled={pending || testStatus === "queued" || testStatus === "running"}
                  className="rounded-full bg-tk-teal px-2.5 py-0.5 text-[10.5px] font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90 disabled:opacity-50"
                >
                  {testStatus === "queued" || testStatus === "running" ? "Waiting for an agent" : "Request test"}
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
                className="text-[11px] font-semibold text-tk-slate/60 hover:text-tk-teal"
              >
                {editing ? "Cancel" : item.test ? "Edit" : "Attach a test"}
              </button>
            </div>

            {latestRun?.verdict && !editing ? (
              <p className="mt-1 text-[12.5px] text-tk-slate">{latestRun.verdict}</p>
            ) : null}

            {!editing && item.test ? (
              <dl className="mt-1.5 space-y-0.5 text-[12px] text-tk-slate">
                <div className="flex gap-2">
                  <dt className="w-14 shrink-0 text-tk-slate/50">kind</dt>
                  <dd>{item.test.kind}{item.test.url ? ` · ${item.test.url}` : ""}{item.test.command ? ` · ${item.test.command}` : ""}</dd>
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
        <p className="px-5 pb-3 pl-[3.25rem] text-xs font-semibold text-red-700" role="status">
          {error}
        </p>
      ) : null}
    </li>
  )
}
