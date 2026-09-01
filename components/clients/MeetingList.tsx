"use client"

import type { HubMeeting } from "@/lib/client-hub"
import { cn } from "@/lib/cn"

/**
 * Client component so every timestamp renders in the viewer's timezone —
 * the server runs in UTC and would put meetings at the wrong hour.
 */
export function MeetingList({
  upcoming,
  recent,
}: {
  upcoming: HubMeeting[]
  recent: HubMeeting[]
}) {
  if (upcoming.length === 0 && recent.length === 0) {
    return (
      <p className="px-5 py-8 text-sm text-tk-slate/60">
        No meetings on the calendar for this client.
      </p>
    )
  }
  return (
    <div className="divide-y divide-tk-slate/10">
      {upcoming.map((m) => (
        <MeetingRow key={m.id} meeting={m} past={false} />
      ))}
      {recent.map((m) => (
        <MeetingRow key={m.id} meeting={m} past />
      ))}
    </div>
  )
}

function fmtHours(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "")
}

function MeetingRow({ meeting, past }: { meeting: HubMeeting; past: boolean }) {
  const start = new Date(meeting.startsAt)
  const end = new Date(meeting.endsAt)
  const time = meeting.allDay
    ? "All day"
    : `${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`
  const attendees = meeting.attendees
    .map((a) => a.name || a.email.split("@")[0])
    .filter(Boolean)
    .slice(0, 3)

  return (
    <div className="flex items-start gap-4 px-5 py-3.5">
      <div
        className={cn(
          "w-16 shrink-0 rounded-xl py-1.5 text-center",
          past ? "bg-tk-slate/10 text-tk-slate/60" : "bg-tk-teal/10 text-tk-teal"
        )}
      >
        <span className="block text-[10px] font-bold uppercase tracking-[0.08em]">
          {start.toLocaleDateString(undefined, { weekday: "short" })}
        </span>
        <span className="block text-base font-extrabold tabular-nums leading-tight">
          {start.getDate()}
        </span>
        <span className="block text-[10px] font-bold uppercase tracking-[0.08em]">
          {start.toLocaleDateString(undefined, { month: "short" })}
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold text-tk-onyx">
          {past ? null : (
            <span className="tabular-nums">{time} · </span>
          )}
          {meeting.title || "Untitled meeting"}
        </p>
        {attendees.length > 0 ? (
          <p className="mt-0.5 truncate text-xs text-tk-slate/70">
            {attendees.join(", ")}
            {meeting.location ? ` · ${meeting.location}` : ""}
          </p>
        ) : meeting.location ? (
          <p className="mt-0.5 truncate text-xs text-tk-slate/70">{meeting.location}</p>
        ) : null}
        <p className="mt-0.5 text-xs text-tk-slate/50">
          {past ? (
            meeting.loggedHours > 0 ? (
              <>
                <span className="tabular-nums">{fmtHours(meeting.loggedHours)}</span> hr
                logged
              </>
            ) : (
              "no time logged"
            )
          ) : meeting.url ? (
            <a
              href={meeting.url}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-tk-teal hover:underline"
            >
              Join ↗
            </a>
          ) : null}
        </p>
      </div>
    </div>
  )
}
