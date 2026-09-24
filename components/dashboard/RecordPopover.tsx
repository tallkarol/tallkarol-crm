"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Mic, Square } from "lucide-react"
import { FieldLabel, INPUT_CLASS, ToolButton } from "@/components/dashboard/ToolButton"
import type { ClockClient } from "@/components/dashboard/ClockPopover"
import { Card } from "@/components/ui/Card"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { formatClock } from "@/lib/meeting-note"
import { discardNoteAction, startRecordingAction, stopRecordingAction } from "@/lib/meeting-note-actions"
import { ROUTES } from "@/lib/nav"
import { announcePunchChange } from "@/lib/punch-signal"
import { useRunningClock } from "@/components/timesheet/RunningClockProvider"

/**
 * Record a meeting from the homepage toolbar — the clock's sibling. Nothing
 * live: pick a client (or none), a title, Start. Something live: see it and
 * Stop. The live state is the shell's one clock poll (RunningClockProvider),
 * so the header needs no new prop and this adds no poll of its own.
 */
export function RecordPopover({ clients, wide = false }: { clients: ClockClient[]; wide?: boolean }) {
  const router = useRouter()
  const [clientId, setClientId] = useState<string>("")
  const [title, setTitle] = useState("")
  const { recording: live } = useRunningClock()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function begin(close: () => void) {
    setError(null)
    start(async () => {
      const result = await startRecordingAction({
        clientId: clientId || null,
        title,
        clientRequestId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      // Tells the shell's clock poll to re-read, which updates `live` here too.
      announcePunchChange()
      setTitle("")
      close()
      router.refresh()
    })
  }

  function end(close: () => void) {
    if (!live) return
    setError(null)
    start(async () => {
      const result = live.status === "requested" ? await discardNoteAction(live.id) : await stopRecordingAction(live.id)
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
    <ToolButton label={live ? `Recording: ${live.title || live.client?.name || "meeting"}` : "Record a meeting"} text={live ? "Recording" : "Record"} icon={<Mic />} dot={Boolean(live)} wide={wide} track="home.record">
      {(close) => (
        <div className="grid gap-3">
          <div className="flex items-center gap-2 font-ui">
            <Mic className="size-4 text-tk-teal" aria-hidden />
            <b className="text-[13.5px]">{live ? (live.status === "requested" ? "Starting…" : live.status === "stopping" ? "Finishing…" : "Recording") : "Record a meeting"}</b>
            <span className="ml-auto text-[11.5px] text-ink-3">
              {live ? (live.status === "recording" ? formatClock(Math.max(0, Math.floor((Date.now() - new Date(live.startedAt ?? Date.now()).getTime()) / 1000))) : "") : "nothing recording"}
            </span>
          </div>

          {live ? (
            <Card surface="well" radius="xl" elevation="none" className="px-3 py-2.5">
              <p className="text-sm font-semibold text-tk-onyx">{live.title || live.client?.name || "Untitled meeting"}</p>
              <p className="mt-0.5 text-xs text-ink-3">
                {[live.client?.name, live.project?.name, live.punchId ? "clocked in" : "no punch", `on ${live.worker || "the Mac"}`].filter(Boolean).join(" · ")}
              </p>
              <Link href={`${ROUTES.timesheetLive}#record`} className="mt-1 inline-block text-xs font-semibold text-tk-teal hover:underline">
                Open the Record panel
              </Link>
            </Card>
          ) : (
            <>
              <label className="grid gap-1.5">
                <FieldLabel>Client</FieldLabel>
                <span className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Client">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={clientId === ""}
                    onClick={() => setClientId("")}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 font-ui text-xs font-semibold transition-colors",
                      clientId === "" ? "bg-accent-soft text-tk-teal ring-1 ring-inset ring-tk-teal/40" : "bg-well text-tk-slate ring-1 ring-inset ring-line hover:text-tk-onyx"
                    )}
                  >
                    No client yet
                  </button>
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
                          on ? "tk-client-tint tk-client-ink ring-1 ring-inset ring-[color:var(--c)]/40" : "bg-well text-tk-slate ring-1 ring-inset ring-line hover:text-tk-onyx"
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
                <FieldLabel>Title</FieldLabel>
                <input
                  data-autofocus
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") begin(close)
                  }}
                  placeholder="Optional — the notes propose one"
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
              {live ? "Stops here, on the Clock page or from the floating pill." : clientId ? "Opens a punch too; Stop clocks it out." : "No punch opens without a client."}
            </span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={close}
              className="h-8 rounded-lg px-3 font-ui text-xs font-semibold text-tk-slate transition-colors duration-[120ms] hover:bg-well hover:text-tk-onyx"
            >
              Cancel
            </button>
            {live ? (
              <button
                type="button"
                disabled={pending || live.status === "stopping"}
                data-track="home.record.stop"
                onClick={() => end(close)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-tk-tomato px-3 font-ui text-xs font-semibold text-tk-linen hover:brightness-95 disabled:opacity-60"
              >
                <Square className="size-3.5" aria-hidden />
                {live.status === "requested" ? "Cancel start" : "Stop"}
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                data-track="home.record.start"
                onClick={() => begin(close)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 font-ui text-xs font-semibold text-tk-linen hover:brightness-95 disabled:opacity-60"
              >
                <Mic className="size-3.5" aria-hidden />
                {pending ? "Starting…" : "Start"}
              </button>
            )}
          </div>
        </div>
      )}
    </ToolButton>
  )
}
