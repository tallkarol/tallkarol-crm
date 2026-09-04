"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { PickButtons } from "@/components/peek/controls"
import {
  addTicketNote,
  setTicketPlatform,
  setTicketPriority,
  setTicketState,
} from "@/app/(admin)/support/actions"
import { cn } from "@/lib/cn"
import { PRIORITIES, STATE_LABEL, TICKET_STATES } from "@/lib/support"

export function StatePicker({ id, current }: { id: string; current: string }) {
  return (
    <PickButtons
      size="sm"
      current={current}
      options={TICKET_STATES.map((s) => ({
        value: s,
        label: STATE_LABEL[s],
        tone: s === "closed" ? ("neutral" as const) : ("teal" as const),
      }))}
      action={(value) => setTicketState(id, value)}
    />
  )
}

export function PriorityPicker({ id, current }: { id: string; current: string }) {
  return (
    <PickButtons
      size="sm"
      current={current}
      options={PRIORITIES.map((p) => ({
        value: p,
        label: p,
        tone: p === "urgent" ? ("danger" as const) : ("teal" as const),
      }))}
      action={(value) => setTicketPriority(id, value)}
    />
  )
}

/** Free-text with the platforms already in use as suggestions. */
export function PlatformField({
  id,
  current,
  known,
}: {
  id: string
  current: string
  known: string[]
}) {
  const router = useRouter()
  const [value, setValue] = useState(current)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save() {
    if (value.trim() === current) return
    setError(null)
    startTransition(async () => {
      const result = await setTicketPlatform(id, value)
      if (!result.ok) {
        setError(result.error ?? "That didn't save.")
        return
      }
      router.refresh()
    })
  }

  return (
    <div>
      <input
        list="tk-platforms"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur()
        }}
        placeholder="Shopify, WordPress, internal app…"
        disabled={pending}
        className="w-full rounded-lg border border-line bg-card px-2 py-1 text-[13px] text-tk-onyx focus:border-tk-teal disabled:opacity-60"
      />
      <datalist id="tk-platforms">
        {known.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {error ? <p className="mt-1 text-[11px] text-bad">{error}</p> : null}
    </div>
  )
}

/** Appends to the thread and, on the first one, stamps the response time. */
export function NoteComposer({ id }: { id: string }) {
  const router = useRouter()
  const [body, setBody] = useState("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function save() {
    if (!body.trim()) return
    setError(null)
    startTransition(async () => {
      const result = await addTicketNote(id, body)
      if (!result.ok) {
        setError(result.error ?? "That didn't save.")
        return
      }
      setBody("")
      router.refresh()
    })
  }

  return (
    <div className="mt-4 border-t border-line pt-3">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") save()
        }}
        rows={3}
        placeholder="Add a note — what you found, what you did…"
        className="w-full resize-y rounded-xl border border-line bg-card px-3 py-2 text-[13px] leading-relaxed text-tk-onyx placeholder:text-ink-3 focus:border-tk-teal"
      />
      <div className="mt-1.5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending || !body.trim()}
          className={cn(
            "rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-tk-linen transition-colors hover:bg-tk-teal/90",
            (pending || !body.trim()) && "opacity-50"
          )}
        >
          {pending ? "Saving…" : "Add note"}
        </button>
        <span className="text-[11px] text-ink-3">⌘↵ to save</span>
        {error ? <span className="text-[11px] text-bad">{error}</span> : null}
      </div>
    </div>
  )
}
