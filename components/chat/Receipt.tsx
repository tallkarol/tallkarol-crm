import { ArrowUpRight, Check, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { dollars, durationLabel, modelLabel, modelPool, timeLabel } from "@/lib/chat/format"
import type { RequestGroup, RequestState } from "@/lib/chat/requests"

/**
 * The line under a request: its state, the rungs it climbed and what
 * promoted each one, what it read and wrote, what it cost, how long it took.
 * Read straight off the turn and tool-call rows, so what the strip claims
 * and what the month was charged cannot disagree.
 */
export function Receipt({ group }: { group: RequestGroup }) {
  const { turns, reads, writes, state, cents, ms, ask } = group
  const lastFailed = [...turns].reverse().find((t) => t.status === "failed" && t.error)

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[11px] font-medium tracking-[-0.01em] text-ink-3">
      <State state={state} />
      {turns.length ? <Sep /> : null}
      {turns.map((turn, i) => (
        <span key={turn.id} className="inline-flex items-center gap-2">
          {i > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-warn">
              <ArrowUpRight className="size-[11px]" aria-hidden />
              {turn.detector || "escalated"}
            </span>
          ) : null}
          <span className={cn(modelPool(turn.model) === "other" ? "text-warn" : "text-ink-2")}>
            {modelLabel(turn.model)}
          </span>
        </span>
      ))}
      {reads.length ? (
        <>
          <Sep />
          <span>
            {reads.length} {reads.length === 1 ? "read" : "reads"}
          </span>
        </>
      ) : null}
      {writes.length ? (
        <>
          <Sep />
          <span>
            {writes.length} {writes.length === 1 ? "write" : "writes"}
          </span>
        </>
      ) : null}
      {cents > 0 ? (
        <>
          <Sep />
          <span className="tabular-nums">{dollars(cents)}</span>
        </>
      ) : null}
      {ms > 0 ? (
        <>
          <Sep />
          <span>{durationLabel(ms)}</span>
        </>
      ) : null}
      {ask ? <span className="ml-auto">{timeLabel(ask.createdAt)}</span> : null}
      {state === "failed" && lastFailed ? (
        <span className="basis-full text-bad">{lastFailed.error}</span>
      ) : null}
    </div>
  )
}

function Sep() {
  return <span className="size-[3px] rounded-full bg-line-strong" aria-hidden />
}

const LABEL: Record<RequestState, string> = {
  done: "Done",
  needs: "Needs you",
  running: "Running",
  queued: "Queued",
  failed: "Failed",
}

/** The state, as a word with a mark. Colour carries it; the word makes it readable. */
export function State({ state, className }: { state: RequestState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-ui text-[10.5px] font-bold uppercase tracking-[0.06em]",
        state === "done" && "text-good",
        state === "needs" && "text-warn",
        state === "running" && "text-accent-ink",
        state === "queued" && "text-ink-3",
        state === "failed" && "text-bad",
        className
      )}
    >
      {state === "done" ? (
        <Check className="size-[11px]" aria-hidden />
      ) : state === "failed" ? (
        <X className="size-[11px]" aria-hidden />
      ) : (
        <StateDot state={state} />
      )}
      {LABEL[state]}
    </span>
  )
}

export function StateDot({ state }: { state: RequestState | "idle" }) {
  return (
    <span
      className={cn(
        "size-[7px] shrink-0 rounded-full",
        state === "needs" && "bg-warn ring-[3px] ring-warn-soft",
        state === "running" &&
          "bg-accent-ink ring-[3px] ring-accent-soft motion-safe:animate-pulse",
        state === "queued" && "border-[1.5px] border-ink-3 bg-transparent",
        state === "done" && "bg-good",
        state === "failed" && "bg-bad",
        state === "idle" && "bg-ink-3"
      )}
      aria-hidden
    />
  )
}
