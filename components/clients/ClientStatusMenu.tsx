"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Dropdown, MenuLabel, MenuOption } from "@/components/ui/Dropdown"
import { TONE_CLASS } from "@/components/delivery/StatusMenu"
import type { ClientStatus } from "@/db/schema"
import { updateClientStatus } from "@/lib/client-hub-actions"
import { cn } from "@/lib/cn"
import {
  CLIENT_STATUS_GROUPS,
  CLIENT_STATUS_LABEL,
  CLIENT_STATUS_TONE,
} from "@/lib/work"

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
            "border border-[#B4322A]/30 bg-white px-2 py-1 text-[10.5px] font-semibold text-[#B4322A] shadow-sm"
          )}
        >
          {error}
        </span>
      ) : null}
    </span>
  )
}
