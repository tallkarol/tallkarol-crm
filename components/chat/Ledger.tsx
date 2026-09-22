"use client"

import { Fragment, useEffect, useState, type CSSProperties } from "react"
import { Unplug } from "lucide-react"
import { cn } from "@/lib/cn"
import { dayKey, dayLabel, durationLabel, modelLabel } from "@/lib/chat/format"
import { groupRequests } from "@/lib/chat/requests"
import { parseCommand } from "@/lib/chat/skills"
import type { WorkerStatus } from "@/lib/chat/worker-status"
import { Mark, speakerFor } from "@/components/chat/Marks"
import { RequestSection } from "@/components/chat/Message"
import type { ChatMessageView, PendingView } from "@/components/chat/types"
import { agoLabel } from "@/lib/chat/format"

/**
 * The thread, as a ledger of requests down a gutter.
 *
 * The same rows the old bubble list drew, grouped by the line that started
 * each request (lib/chat/requests.ts). A hairline runs down the gutter and
 * the marks sit on it, so who spoke and when reads like a log, not a chat.
 * The dock's panel renders this too, `compact`, so a desk reads the same
 * beside a page as it does on /chat.
 */
export function Ledger({
  messages,
  pending,
  worker,
  speaker,
  now,
  compact,
}: {
  messages: ChatMessageView[]
  pending: PendingView | null
  /** Omitted in the dock, which has no heartbeat to show. */
  worker?: WorkerStatus
  /** Who the working row is: the desk's label, "Solver", or "Assistant". */
  speaker: string
  /** Server time, ISO — day headings must agree on both sides of hydration. */
  now: string
  compact?: boolean
}) {
  const groups = groupRequests(messages)
  const at = new Date(now)
  const last = groups[groups.length - 1]
  const command = last?.ask ? parseCommand(last.ask.body) : null
  const who = command ? `/${command.name}` : speaker

  return (
    <div
      className={cn(
        "relative flex flex-col before:pointer-events-none before:absolute before:bottom-3.5 before:left-[12.5px] before:top-3.5 before:w-px before:bg-line before:content-['']",
        compact ? "gap-5" : "gap-7"
      )}
    >
      {groups.map((group, i) => {
        const stamp = stampOf(group)
        const before = i > 0 ? stampOf(groups[i - 1]) : null
        const heading = stamp && (!before || dayKey(before) !== dayKey(stamp))
        return (
          <Fragment key={group.key}>
            {heading ? <DayRule label={dayLabel(stamp, at)} /> : null}
            <RequestSection group={group} compact={compact} />
          </Fragment>
        )
      })}
      {pending ? (
        !worker || worker.online ? (
          <Working pending={pending} speaker={who} />
        ) : (
          <Stranded worker={worker} />
        )
      ) : null}
    </div>
  )
}

function stampOf(group: ReturnType<typeof groupRequests>[number]): string | null {
  return group.ask?.createdAt ?? group.replies[0]?.createdAt ?? group.notes[0]?.createdAt ?? null
}

function DayRule({ label }: { label: string }) {
  return (
    <div className="pl-10 font-ui text-[10px] font-bold uppercase tracking-[0.1em] text-ink-3">{label}</div>
  )
}

/**
 * Wordless on purpose — the dots say it. `role="status"` and the label keep
 * the meaning for anyone who cannot see them, and `.tk-wave-dot` holds a
 * still resting state under reduced motion instead of freezing mid-rise.
 * The seconds count from when the worker took it, so a long turn reads as
 * long rather than as stuck.
 */
function Working({ pending, speaker }: { pending: PendingView; speaker: string }) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  const elapsed = Math.max(0, Date.now() - new Date(pending.since).getTime())
  void tick

  return (
    <div className="grid grid-cols-[26px_minmax(0,1fr)] gap-x-3.5 gap-y-2">
      <div className="flex justify-center pt-px">
        <Mark speaker={speakerFor("assistant", speaker)} />
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2 font-ui text-[12px] font-semibold text-tk-onyx">
          <span className={cn("truncate", speaker.startsWith("/") && "font-mono")}>{speaker}</span>
          <span className="shrink-0 rounded-[5px] border border-line bg-card px-1.5 py-px font-mono text-[10.5px] font-medium text-ink-3">
            {modelLabel(pending.model)}
          </span>
        </div>
        <div
          role="status"
          aria-label="Working"
          className="flex items-center gap-2.5 font-ui text-[11.5px] font-medium text-ink-3"
        >
          <span className="inline-flex h-3.5 items-center gap-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="tk-wave-dot size-[5px] rounded-full bg-ink-3"
                style={{ "--i": i } as CSSProperties}
              />
            ))}
          </span>
          <span suppressHydrationWarning>
            {pending.status === "queued"
              ? "Queued"
              : `Claimed by ${pending.claimedBy || "the worker"}`}{" "}
            · {durationLabel(elapsed)}
          </span>
        </div>
      </div>
    </div>
  )
}

/**
 * Queued, but no heartbeat.
 *
 * Without this the page shows the dots forever and the honest answer is
 * invisible. What the page knows is only that no beat has reached THIS
 * database for twenty seconds — not whether a process exists on the Mac. On
 * Sep 11, 2026 the worker ran the whole time while its CRM (the dev server it
 * was pointed at) served a compile-error page to every route, so the copy
 * names both causes. The question is not lost: it stays queued and is
 * claimed the moment a beat returns.
 */
function Stranded({ worker }: { worker: WorkerStatus }) {
  return (
    <div className="ml-10 flex max-w-[36rem] items-start gap-2.5 rounded-xl bg-warn-soft px-3 py-2.5 text-xs leading-[1.45] text-warn">
      <Unplug className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div>
        <p className="font-ui font-bold">
          No heartbeat from the worker{worker.secondsAgo != null ? ` for ${agoLabel(worker.secondsAgo)}` : ""}.
        </p>
        <p className="mt-1">
          Your question is queued and answers the moment a beat arrives. Either nothing is running on the
          Mac — start it with <code className="font-mono">npm run chat:worker</code> — or the worker is up
          but the CRM it talks to is not answering; its log is{" "}
          <code className="font-mono">~/Library/Logs/tallkarol/chat-worker.log</code>.
        </p>
      </div>
    </div>
  )
}
