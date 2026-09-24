"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Dropdown, MenuLabel, MenuOption } from "@/components/ui/Dropdown"
import type { ClientStatus } from "@/db/schema"
import { updateClientStatus } from "@/lib/client-hub-actions"
import { cn } from "@/lib/cn"
import {
  CLIENT_STATUS_GROUPS,
  CLIENT_STATUS_LABEL,
  CLIENT_STATUS_TONE,
} from "@/lib/work"

type StatusTone = "progress" | "waiting" | "open" | "done" | "flat"

/** The status pill's tones — moved here from the Delivery page's menu when that page went (24 Sep 2026). */
const TONE_CLASS: Record<StatusTone, string> = {
  progress: "border-tk-teal/25 bg-tk-teal/10 text-tk-teal",
  waiting: "border-line bg-well text-ink-3",
  open: "border-transparent bg-warn-soft text-warn",
  done: "border-transparent bg-good-soft text-good",
  flat: "border-line bg-card text-ink-3",
}

/**
 * Lifecycle status as a chip that opens its own menu — same control as the
 * delivery ledger, so changing a client is one click and two.
 */
export function ClientStatusMenu({
  clientId,
  status,
  align = "left",
}: {
  clientId: string
  status: ClientStatus
  align?: "left" | "right"
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState<ClientStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  const active = optimistic ?? status
  const tone = CLIENT_STATUS_TONE[active]

  function pick(value: ClientStatus, close: () => void) {
    close()
    if (value === active || pending) return
    setError(null)
    setOptimistic(value)
    startTransition(async () => {
      const result = await updateClientStatus(clientId, value)
      if (!result.ok) {
        setOptimistic(null)
        setError(result.error ?? "That didn't save.")
        return
      }
      router.refresh()
    })
  }

  return (
    <span
      className="relative inline-flex shrink-0"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <Dropdown
        align={align}
        title={error ?? "Client status"}
        label={CLIENT_STATUS_LABEL[active] ?? "Status"}
        variant="status"
        tone={error ? TONE_CLASS.flat : TONE_CLASS[tone]}
        pending={pending}
      >
        {(close) => (
          <>
            {CLIENT_STATUS_GROUPS.map((group) => (
              <div key={group.label}>
                <MenuLabel>{group.label}</MenuLabel>
                {group.ids.map((id) => (
                  <MenuOption
                    key={id}
                    checked={id === active}
                    label={CLIENT_STATUS_LABEL[id]}
                    onSelect={() => pick(id, close)}
                  />
                ))}
              </div>
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
