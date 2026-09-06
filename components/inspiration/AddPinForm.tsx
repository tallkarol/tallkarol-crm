"use client"

import { useRef } from "react"
import { addPin } from "@/app/(admin)/inspiration/actions"
import { Card } from "@/components/ui/Card"

export function AddPinForm({ board }: { board: string }) {
  const form = useRef<HTMLFormElement>(null)

  return (
    <Card className="p-4">
      <form
        ref={form}
        action={async (formData) => {
          await addPin(formData)
          form.current?.reset()
        }}
        className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
      >
        <input type="hidden" name="board" value={board} />
        <label className="block text-sm">
          <span className="text-xs font-medium text-ink-3">Link, video, or image URL</span>
          <input
            name="url"
            required
            type="url"
            placeholder="https://…"
            className={fieldClass}
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs font-medium text-ink-3">Note</span>
          <input name="note" placeholder="Why this one" className={fieldClass} />
        </label>
        <button
          type="submit"
          className="h-[38px] rounded-lg bg-tk-onyx px-3.5 text-[13px] font-semibold text-white hover:bg-accent"
        >
          Pin
        </button>
      </form>
    </Card>
  )
}

const fieldClass =
  "mt-1 h-[38px] w-full rounded-lg border border-line bg-well px-2.5 text-[13px] text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal focus:bg-card"
