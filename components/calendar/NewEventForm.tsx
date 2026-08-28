"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { createCalendarEvent } from "@/lib/calendar-actions"
import { ROUTES } from "@/lib/nav"

function pad(n: number) {
  return String(n).padStart(2, "0")
}

/** `YYYY-MM-DDTHH:mm` in the viewer's zone, which is what Google expects. */
function defaultSlot(day: string | null, hourOffset: number) {
  const base = day ? new Date(`${day}T00:00:00`) : new Date()
  const start = new Date(base)
  start.setHours(new Date().getHours() + 1, 0, 0, 0)
  start.setTime(start.getTime() + hourOffset * 3_600_000)
  return `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`
}

const field =
  "mt-1 w-full rounded-xl border border-tk-slate/20 bg-white px-3 py-2 text-sm text-tk-onyx outline-none focus:border-tk-teal"
const label =
  "text-[11px] font-semibold uppercase tracking-wide text-tk-slate/60"

export function NewEventForm({
  defaultDay,
  canWrite,
  onDone,
}: {
  defaultDay: string | null
  canWrite: boolean
  onDone: (notice: string) => void
}) {
  const [title, setTitle] = useState("")
  const [startsAt, setStartsAt] = useState(() => defaultSlot(defaultDay, 0))
  const [endsAt, setEndsAt] = useState(() => defaultSlot(defaultDay, 1))
  const [location, setLocation] = useState("")
  const [attendees, setAttendees] = useState("")
  const [description, setDescription] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!canWrite) {
    return (
      <div className="mt-4 rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm">
        <p className="text-sm font-semibold text-tk-onyx">
          No destination calendar
        </p>
        <p className="mt-1 text-sm text-tk-slate/70">
          Events made here need one Google calendar marked as the destination.
          Pick one in{" "}
          <Link
            href={ROUTES.settingsCalendar}
            className="font-semibold text-tk-teal hover:underline"
          >
            Settings → Integrations → Calendar
          </Link>
          .
        </p>
      </div>
    )
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await createCalendarEvent({
        title,
        description,
        location,
        startsAt,
        endsAt,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        attendees,
      })
      if (result.ok) onDone("Event created.")
      else setError(result.error)
    })
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 rounded-2xl border border-tk-slate/15 bg-white px-5 py-4 shadow-sm"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className={label}>Title</span>
          <input
            className={field}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Kickoff call"
            required
          />
        </label>
        <label>
          <span className={label}>Starts</span>
          <input
            type="datetime-local"
            className={field}
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            required
          />
        </label>
        <label>
          <span className={label}>Ends</span>
          <input
            type="datetime-local"
            className={field}
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            required
          />
        </label>
        <label>
          <span className={label}>Location</span>
          <input
            className={field}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Google Meet, phone, address"
          />
        </label>
        <label>
          <span className={label}>Guests</span>
          <input
            className={field}
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="comma separated emails"
          />
        </label>
        <label className="sm:col-span-2">
          <span className={label}>Notes</span>
          <textarea
            className={`${field} min-h-[4.5rem]`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-tk-slate">{error}</p> : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-tk-teal px-4 py-2 text-xs font-semibold text-tk-linen disabled:opacity-50"
        >
          {pending ? "Creating…" : "Create event"}
        </button>
        <p className="text-xs text-tk-slate/55">
          Goes to the destination calendar, then syncs back here.
        </p>
      </div>
    </form>
  )
}
