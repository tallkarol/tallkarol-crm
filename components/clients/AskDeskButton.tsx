"use client"

import { DESK_OPEN_EVENT } from "@/lib/chat/desk-context"

/** Opens the client-manager desk in the dock on the right — the same desk the panel row opens. */
export function AskDeskButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(DESK_OPEN_EVENT))}
      className="inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 font-ui text-xs font-semibold text-ink-2 hover:border-line-strong hover:text-tk-onyx"
    >
      <span className="grid size-[18px] place-items-center rounded-full bg-rail font-ui text-[8px] font-extrabold text-[--rail-active-icon]">CM</span>
      Ask the desk
    </button>
  )
}
