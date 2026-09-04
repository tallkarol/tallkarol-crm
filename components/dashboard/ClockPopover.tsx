"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Clock, Play, Square } from "lucide-react"
import { FieldLabel, INPUT_CLASS, ToolButton } from "@/components/dashboard/ToolButton"
import { cn } from "@/lib/cn"
import { clientColor } from "@/lib/client-colors"
import { startPunch, stopPunch } from "@/lib/punch-actions"
import { announcePunchChange } from "@/lib/punch-signal"
import type { PunchView } from "@/lib/punches"

export type ClockClient = { id: string; name: string; slug: string }

/**
 * The clock in the homepage toolbar. Nothing running: pick a client, say
 * what you are on, Start. Something running: see it and Stop. The floating
 * clock elsewhere in the app keeps polling, so both agree within a poll.
 */
export function ClockPopover({
  clients,
  running,
}: {
  clients: ClockClient[]
  running: PunchView[]
}) {
  const router = useRouter()
  const [clientId, setClientId] = useState<string>(clients[0]?.id ?? "")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const live = running[0] ?? null

  function begin(close: () => void) {
    setError(null)
    start(async () => {
      const result = await startPunch({ clientId: clientId || null, note })
      if (!result.ok) {
        setError(result.error)
        return
      }
      announcePunchChange()
      setNote("")
      close()
      router.refresh()
    })
  }

  function end(close: () => void) {
    setError(null)
    start(async () => {
      const result = await stopPunch(live ? { punchId: live.id } : {})
      if (!result.ok) {
        setError(result.error)
        return
      }
      announcePunchChange()
      close()
      router.refresh()
    })
  }

  return (
    <ToolButton label={live ? `Running: ${live.clientName}` : "Clock in"} icon={<Clock />} dot={Boolean(live)}>
      {(close) => (
        <div className="grid gap-3">
          <div className="flex items-center gap-2 font-ui">
            <Clock className="size-4 text-tk-teal" aria-hidden />
            <b className="text-[13.5px]">{live ? "Running" : "Clock in"}</b>
            <span className="ml-auto text-[11.5px] text-ink-3">
              {live ? `${live.elapsed} · started ${new Date(live.startedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "nothing running"}
            </span>
          </div>

          {live ? (
            <div className="rounded-xl border border-line bg-well px-3 py-2.5">
              <p className="flex items-center gap-2 text-sm font-semibold text-tk-onyx">
                <span
                  aria-hidden
                  className="size-2 rounded-full"
                  style={{ background: clientColor(live.clientSlug) }}
                />
                {live.clientName}
                {live.projectName ? (
                  <span className="font-normal text-ink-3">· {live.projectName}</span>
                ) : null}
              </p>
              {live.note ? (
                <p className="mt-0.5 text-xs text-ink-3">{live.note}</p>
              ) : null}
            </div>
          ) : (
            <>
              <label className="grid gap-1.5">
                <FieldLabel>Client</FieldLabel>
                <span className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Client">
                  {clients.map((c) => {
                    const on = c.id === clientId
                    return (
                      <button
                        key={c.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setClientId(c.id)}
                        style={{ "--c": clientColor(c.slug) } as React.CSSProperties}
                        className={cn(
                          "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 font-ui text-xs font-semibold transition-colors",
                          on
                            ? "tk-client-tint tk-client-ink ring-1 ring-inset ring-[color:var(--c)]/40"
                            : "bg-well text-tk-slate ring-1 ring-inset ring-line hover:text-tk-onyx"
                        )}
                      >
                        <span aria-hidden className="size-1.5 rounded-full" style={{ background: "var(--c)" }} />
                        {c.name}
                      </button>
                    )
                  })}
                </span>
              </label>
              <label className="grid gap-1.5">
                <FieldLabel>What are you on?</FieldLabel>
                <input
                  data-autofocus
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") begin(close)
                  }}
                  placeholder="Optional note"
                  className={INPUT_CLASS}
                />
              </label>
            </>
          )}

          {error ? (
            <p role="alert" className="text-xs font-semibold text-bad">
              {error}
            </p>
          ) : null}

          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-ink-3">
              {live ? "Stops here or from the menu bar app." : "Shows in the floating clock on every page."}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={close}
              className="h-8 rounded-lg px-3 font-ui text-xs font-semibold text-tk-slate hover:bg-well transition-colors duration-[120ms] hover:text-tk-onyx"
            >
              Cancel
            </button>
            {live ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => end(close)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-tk-tomato px-3 font-ui text-xs font-semibold text-tk-linen hover:brightness-95 disabled:opacity-60"
              >
                <Square className="size-3.5" aria-hidden />
                Stop
              </button>
            ) : (
              <button
                type="button"
                disabled={pending || (!clientId && clients.length > 0)}
                onClick={() => begin(close)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-ui text-xs font-semibold text-tk-linen hover:brightness-95 disabled:opacity-60"
              >
                <Play className="size-3.5" aria-hidden />
                Start
              </button>
            )}
          </div>
        </div>
      )}
    </ToolButton>
  )
}
