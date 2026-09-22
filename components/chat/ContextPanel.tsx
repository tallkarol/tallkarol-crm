import Link from "next/link"
import { ListChecks, Lock } from "lucide-react"
import { cn } from "@/lib/cn"
import { packLabel } from "@/lib/chat/desk-context"
import { dayLabel, dollars, modelLabel, timeLabel } from "@/lib/chat/format"
import { LADDERS, type JobType } from "@/lib/chat/models"
import { PERSONAS } from "@/lib/chat/personas"
import { viaReplyAction } from "@/lib/chat/reply-actions"
import { ROUTES } from "@/lib/nav"
import { deskSpeaker, Mark } from "@/components/chat/Marks"
import { UsageMeters } from "@/components/chat/UsageMeters"
import type { ThreadStats } from "@/components/chat/types"
import type { ChatToolCall } from "@/db/schema"
import type { UsageRailView } from "@/lib/usage/types"

/**
 * What the thread is bound to, in one column: the desk and its pack, the
 * ladder the turns run on, every write it has proposed and where each one
 * stands, what it has cost, and the allowance the whole chat draws on.
 * Nothing here is new data — it is the receipt strips and the gate cards,
 * read as a list instead of found by scrolling.
 */
export function ContextPanel({
  agent,
  pack,
  privateThread,
  task,
  stats,
  calls,
  firstAt,
  usage,
  now,
}: {
  agent: string
  /** Raw: `clients/mineralife`, `products/momentum`, `me`, or "". */
  pack: string
  privateThread: boolean
  task: { id: string; title: string } | null
  stats: ThreadStats
  /** Every tool call in the thread; the writes are picked out here. */
  calls: ChatToolCall[]
  firstAt: string | null
  usage: UsageRailView
  /** Server time, ISO. */
  now: string
}) {
  const persona = agent ? PERSONAS[agent] : undefined
  const decisions = calls.filter((c) => c.mutating && !viaReplyAction(c.args))
  const ladder = LADDERS[stats.job as JobType]?.label ?? stats.job
  const at = new Date(now)
  const kind = pack.startsWith("clients/")
    ? "client"
    : pack.startsWith("products/")
      ? "product"
      : pack === "me"
        ? "private"
        : ""

  return (
    <div className="tk-main-scroll flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4 pt-3.5">
      <section>
        <H>Desk</H>
        <div className="flex items-start gap-2.5 rounded-[10px] border border-line bg-card p-2.5">
          {persona ? (
            <Mark speaker={deskSpeaker(persona.name)} size="lg" />
          ) : task ? (
            <Mark speaker={{ kind: "solver" }} size="lg" />
          ) : (
            <Mark speaker={{ kind: "assistant" }} size="lg" />
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-display text-[13px] font-semibold text-tk-onyx">
              {persona ? persona.label : task ? "Solver" : "Assistant"}
              {privateThread ? <Lock className="size-3 text-ink-3" aria-label="Private" /> : null}
            </div>
            <p className="mt-0.5 text-[11.5px] leading-[1.45] text-ink-3">
              {persona
                ? persona.tagline
                : task
                  ? "Every send runs on the task ladder, in the task's worktree."
                  : "Reads answer straight away. Anything that writes shows a preview and waits for you."}
            </p>
          </div>
        </div>
        <dl className="mt-2.5 grid grid-cols-[4rem_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-[12px]">
          {persona ? (
            <>
              <dt className="text-ink-3">Pack</dt>
              <dd className="m-0 truncate text-tk-onyx">
                {pack ? (
                  <>
                    {packLabel(pack)}
                    {kind ? <span className="text-ink-3"> · {kind}</span> : null}
                  </>
                ) : persona.pack ? (
                  <span className="text-ink-3">none pinned — the desk will ask</span>
                ) : (
                  <span className="text-ink-3">none</span>
                )}
              </dd>
            </>
          ) : null}
          <dt className="text-ink-3">Ladder</dt>
          <dd className="m-0 truncate text-tk-onyx">{stats.job ? ladder : <span className="text-ink-3">—</span>}</dd>
          <dt className="text-ink-3">Runs on</dt>
          <dd className="m-0 truncate text-tk-onyx">
            {stats.model ? modelLabel(stats.model) : <span className="text-ink-3">—</span>}
          </dd>
          <dt className="text-ink-3">Task</dt>
          <dd className="m-0 truncate">
            {task ? (
              <Link
                href={ROUTES.task(task.id)}
                title={task.title}
                className="inline-flex max-w-full items-center gap-1 font-semibold text-accent-ink hover:underline"
              >
                <ListChecks className="size-3 shrink-0" aria-hidden />
                <span className="truncate">{task.title}</span>
              </Link>
            ) : (
              <span className="text-ink-3">none bound</span>
            )}
          </dd>
        </dl>
      </section>

      <section>
        <H>Decisions</H>
        {decisions.length === 0 ? (
          <p className="px-1 text-[11.5px] text-ink-3">No writes proposed yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {decisions.map((call) => (
              <li key={call.id}>
                <a
                  href={`#call-${call.id}`}
                  className={cn(
                    "flex h-[30px] items-center gap-2 rounded-[7px] px-2 font-mono text-[11.5px] font-medium text-ink-2 hover:bg-well",
                    call.status === "pending" && "bg-card ring-1 ring-line"
                  )}
                >
                  <span
                    className={cn(
                      "size-[7px] shrink-0 rounded-full",
                      call.status === "pending"
                        ? "bg-warn ring-[3px] ring-warn-soft"
                        : call.status === "ran" || call.status === "approved"
                          ? "bg-good"
                          : call.status === "failed"
                            ? "bg-bad"
                            : "bg-ink-3"
                    )}
                    aria-hidden
                  />
                  <span className="truncate">{call.name}</span>
                  <span className="ml-auto shrink-0 font-ui text-[11px]">
                    {call.status === "pending" ? (
                      <span className="rounded-full bg-warn-soft px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] text-warn">
                        Needs you
                      </span>
                    ) : call.status === "ran" ? (
                      <span className="text-ink-3">
                        Confirmed{call.decidedAt ? ` · ${timeLabel(call.decidedAt)}` : ""}
                      </span>
                    ) : call.status === "approved" ? (
                      <span className="text-ink-3">Approved</span>
                    ) : call.status === "rejected" ? (
                      <span className="text-ink-3">Discarded</span>
                    ) : call.status === "failed" ? (
                      <span className="text-bad">Failed</span>
                    ) : (
                      <span className="text-ink-3">Skipped</span>
                    )}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <H>This thread</H>
        <dl className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-[12px]">
          <dt className="text-ink-3">Turns</dt>
          <dd className="m-0 text-tk-onyx">{stats.turns}</dd>
          <dt className="text-ink-3">Spend</dt>
          <dd className="m-0 font-mono tabular-nums text-tk-onyx">{dollars(stats.cents)}</dd>
          <dt className="text-ink-3">Models</dt>
          <dd className="m-0 truncate text-tk-onyx">{stats.chain || <span className="text-ink-3">—</span>}</dd>
          <dt className="text-ink-3">Started</dt>
          <dd className="m-0 text-tk-onyx">
            {firstAt ? `${dayLabel(firstAt, at)} ${timeLabel(firstAt)}` : <span className="text-ink-3">—</span>}
          </dd>
        </dl>
      </section>

      <section className="mt-auto pt-2">
        <H>
          Allowance
          <Link href={ROUTES.usage} className="ml-auto font-ui text-[10.5px] font-semibold normal-case tracking-normal text-accent-ink">
            Full page
          </Link>
        </H>
        <UsageMeters usage={usage} />
      </section>
    </div>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 flex items-center font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">
      {children}
    </h3>
  )
}
