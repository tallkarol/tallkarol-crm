"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { cn } from "@/lib/cn"
import { ROUTES } from "@/lib/nav"

export type SolveState = {
  threadId: string
  archived: boolean
  label: "Queued" | "Working" | "Replied" | "Failed"
  tone: "neutral" | "teal" | "bad"
}

type Result = { ok: boolean; threadId?: string; error?: string }

const TONE: Record<SolveState["tone"], string> = {
  neutral: "text-ink-3",
  teal: "text-tk-teal",
  bad: "text-bad",
}

/**
 * Take the task into a chat thread and let the agent have a go.
 *
 * Without a thread: one button, and it goes there. With one: the link back
 * and where the agent is with it, read from the thread's newest turn — the
 * task itself is never written. An archived thread reads as "start over", so
 * the button comes back beside it.
 */
export function SolveInChat({
  action,
  state,
}: {
  action: () => Promise<Result>
  state: SolveState | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function run() {
    setError(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok || !result.threadId) {
        setError(result.error ?? "Could not start the chat.")
        return
      }
      router.push(ROUTES.chatThread(result.threadId))
    })
  }

  const button = (label: string) => (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="rounded-xl border border-line bg-card px-4 py-2 text-sm font-semibold text-tk-slate transition-colors hover:border-line-strong hover:text-tk-teal disabled:opacity-60"
    >
      {pending ? "Starting…" : label}
    </button>
  )

  return (
    <div className="flex flex-wrap items-center gap-3">
      {state ? (
        <>
          <Link
            href={ROUTES.chatThread(state.threadId)}
            className="text-xs font-semibold text-tk-teal hover:underline"
          >
            Open chat ↗
          </Link>
          <span
            className={cn(
              "rounded-full bg-well px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.06em] ring-1 ring-line",
              state.archived ? TONE.neutral : TONE[state.tone]
            )}
          >
            {state.archived ? "Archived" : state.label}
          </span>
          {state.archived ? button("New chat") : null}
        </>
      ) : (
        button("Solve in chat")
      )}
      {error ? <p className="text-xs text-bad">{error}</p> : null}
    </div>
  )
}
