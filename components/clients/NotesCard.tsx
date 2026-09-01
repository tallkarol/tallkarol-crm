"use client"

import { useEffect, useRef, useState } from "react"
import { updateClientNotes } from "@/lib/client-hub-actions"

/**
 * Client notes, saved as you type. Debounced so a sentence costs one write,
 * not one per keystroke.
 */
export function NotesCard({
  clientId,
  initialNotes,
}: {
  clientId: string
  initialNotes: string
}) {
  const [notes, setNotes] = useState(initialNotes)
  const [state, setState] = useState<"idle" | "dirty" | "saving" | "saved" | "error">(
    "idle"
  )
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  function onChange(value: string) {
    setNotes(value)
    setState("dirty")
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      setState("saving")
      const result = await updateClientNotes(clientId, value)
      setState(result.ok ? "saved" : "error")
    }, 800)
  }

  return (
    <div>
      <textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Client notes"
        rows={5}
        placeholder="How they like to work, who approves, what never to do…"
        className="w-full resize-y border-0 bg-transparent p-0 text-[13px] leading-relaxed text-tk-slate/80 placeholder:text-tk-slate/40 focus:outline-none"
      />
      <p className="mt-1 text-[11px] text-tk-slate/45">
        {state === "saving"
          ? "Saving…"
          : state === "saved"
            ? "Saved"
            : state === "dirty"
              ? "Editing…"
              : state === "error"
                ? "Could not save — try again"
                : "Saved with the client"}
      </p>
    </div>
  )
}
