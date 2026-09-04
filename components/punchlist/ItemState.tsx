"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/cn"
import { ITEM_STATE_LABEL, NEXT_STATE, type ItemState as State } from "@/lib/punchlist"

type ActionResult = { ok: boolean; error?: string }

/**
 * The circle at the start of every row. One click moves it along
 * to do → doing → done → to do, exactly like Karol's own punch lists; the
 * write goes to the item's task, so the tasks board agrees the moment it
 * refreshes. Optimistic, with rollback when the server says no.
 */
export function ItemStateCircle({
  state: current,
  title,
  disabled = false,
  action,
  onError,
}: {
  state: State
  title: string
  disabled?: boolean
  action: (state: State) => Promise<ActionResult>
  onError?: (message: string) => void
}) {
  const router = useRouter()
  const [state, setState] = useState<State>(current)
  const [pending, startTransition] = useTransition()

  useEffect(() => setState(current), [current])

  function cycle() {
    if (disabled || pending) return
    const next = NEXT_STATE[state]
    const before = state
    setState(next)
    startTransition(async () => {
      const result = await action(next)
      if (!result.ok) {
        setState(before)
        onError?.(result.error ?? "That didn't save.")
        return
      }
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      onClick={cycle}
      disabled={disabled}
      aria-label={`${title}: ${ITEM_STATE_LABEL[state]}. Click to mark ${ITEM_STATE_LABEL[NEXT_STATE[state]].toLowerCase()}.`}
      title={disabled ? "Accept the draft first" : `${ITEM_STATE_LABEL[state]} → ${ITEM_STATE_LABEL[NEXT_STATE[state]]}`}
      className={cn(
        "relative grid size-[22px] shrink-0 place-items-center rounded-full border-[1.5px] transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tk-teal/40 focus-visible:ring-offset-2",
        state === "done" && "border-tk-teal bg-accent-mark",
        state === "doing" && "border-tk-teal bg-card ring-4 ring-tk-teal/10",
        state === "waiting" && "border-amber-500 bg-card ring-4 ring-amber-500/10",
        state === "todo" && "border-line-strong bg-card hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:ring-4 hover:ring-tk-teal/10",
        disabled && "cursor-not-allowed opacity-40",
        pending && "opacity-70"
      )}
    >
      {state === "done" ? (
        <svg width="12" height="9" viewBox="0 0 11 9" fill="none" aria-hidden>
          <path d="M1 4.5L4 7.5L10 1.5" stroke="#F1EADC" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
      {state === "doing" ? <span aria-hidden className="size-2.5 rounded-full bg-accent-mark" /> : null}
      {state === "waiting" ? <span aria-hidden className="size-2.5 rounded-full bg-warn" /> : null}
    </button>
  )
}
