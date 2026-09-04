"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Dropdown, MenuOption } from "@/components/ui/Dropdown"
import {
  setDeliverableStatusAction,
  setProjectFeeStatusAction,
  setProjectStatusAction,
} from "@/lib/peek-actions"
import { setRetainerStatusAction, setWorkstreamStageAction } from "@/app/(admin)/delivery/actions"
import type {
  DeliverableStatus,
  FeeStatus,
  ProjectStatus,
  RetainerStatus,
  WorkstreamStage,
} from "@/db/schema"
import { cn } from "@/lib/cn"

type Result = { ok: boolean; error?: string }

export type StatusTone = "progress" | "waiting" | "open" | "done" | "flat"

export const TONE_CLASS: Record<StatusTone, string> = {
  progress: "border-tk-teal/25 bg-tk-teal/10 text-tk-teal",
  waiting: "border-line bg-well text-ink-3",
  open: "border-transparent bg-warn-soft text-warn",
  done: "border-transparent bg-good-soft text-good",
  flat: "border-line bg-card text-ink-3",
}

export type StatusOption = { value: string; label: string; tone: StatusTone }

/**
 * What a menu writes to, as data rather than a closure.
 *
 * The modal is a server component, and a server component cannot hand a
 * function to a client one — so the menu names its target and does the
 * dispatch here, on the client, where the action references already live.
 */
export type StatusTarget =
  | { kind: "project-status"; id: string }
  | { kind: "project-fee"; id: string }
  | { kind: "retainer-status"; id: string }
  | { kind: "deliverable-status"; id: string }
  | { kind: "workstream-stage"; id: string }

function dispatch(target: StatusTarget, value: string): Promise<Result> {
  switch (target.kind) {
    case "project-status":
      return setProjectStatusAction(target.id, value as ProjectStatus)
    case "project-fee":
      return setProjectFeeStatusAction(target.id, value as FeeStatus)
    case "retainer-status":
      return setRetainerStatusAction(target.id, value as RetainerStatus)
    case "deliverable-status":
      return setDeliverableStatusAction(target.id, value as DeliverableStatus)
    case "workstream-stage":
      return setWorkstreamStageAction(target.id, value as WorkstreamStage)
  }
}

/**
 * A status that is also its own menu. One click opens it, two changes it —
 * which is the whole reason the ledger replaced a drag target.
 *
 * Optimistic: the chip flips immediately and the server refresh settles it.
 * A refused write puts the old value back and says why.
 */
export function StatusMenu({
  options,
  current,
  target,
  align = "left",
  title,
}: {
  options: StatusOption[]
  current: string
  target: StatusTarget
  align?: "left" | "right"
  title?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const active = optimistic ?? current
  const option = options.find((o) => o.value === active) ?? options[0]

  function pick(value: string, close: () => void) {
    close()
    if (value === active || pending) return
    setError(null)
    setOptimistic(value)
    startTransition(async () => {
      const result = await dispatch(target, value)
      if (!result.ok) {
        setOptimistic(null)
        setError(result.error ?? "That didn't save.")
        return
      }
      router.refresh()
    })
  }

  return (
    <span className="relative inline-flex">
      <Dropdown
        align={align}
        title={error ?? title}
        label={option?.label ?? active}
        variant="status"
        tone={error ? TONE_CLASS.flat : (TONE_CLASS[option?.tone ?? "flat"])}
        pending={pending}
      >
        {(close) => (
          <>
            {options.map((opt) => (
              <MenuOption
                key={opt.value}
                checked={opt.value === active}
                label={opt.label}
                onSelect={() => pick(opt.value, close)}
              />
            ))}
          </>
        )}
      </Dropdown>
      {error ? (
        <span
          role="status"
          className={cn(
            "absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded-md",
            "border border-transparent bg-card px-2 py-1 text-[10.5px] font-semibold text-bad shadow-card"
          )}
        >
          {error}
        </span>
      ) : null}
    </span>
  )
}
