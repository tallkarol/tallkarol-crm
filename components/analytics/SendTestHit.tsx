"use client"

import { useState } from "react"
import { sendTestHitAction } from "@/lib/analytics-actions"

export function SendTestHit({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  async function onClick() {
    setBusy(true)
    setNote(null)
    const result = await sendTestHitAction(slug)
    setBusy(false)
    setNote(
      result.ok
        ? "Sent. Open GA4 Realtime — you should appear within about 30 seconds."
        : result.error || "Send failed."
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="rounded-full bg-tk-teal px-4 py-2 text-sm font-semibold text-tk-linen hover:bg-tk-teal/90 disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send test hit"}
      </button>
      {note ? <p className="text-sm text-tk-slate/70">{note}</p> : null}
    </div>
  )
}
