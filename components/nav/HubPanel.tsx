"use client"

import Link from "next/link"
import { Pin, Square, X } from "lucide-react"
import { useState, useTransition } from "react"
import { useRunningClock } from "@/components/timesheet/RunningClockProvider"
import { clockLabel, useElapsed } from "@/components/timesheet/useElapsed"
import { stopRecordingAction } from "@/lib/meeting-note-actions"
import { stopPunch } from "@/lib/punch-actions"
import { announcePunchChange } from "@/lib/punch-signal"
import { cn } from "@/lib/cn"
import { navIcon } from "@/lib/nav-icons"
import { ROUTES, type NavBadge, type NavGroup } from "@/lib/nav"

const BADGE_TONE: Record<NonNullable<NavBadge["tone"]>, string> = {
  clear: "bg-rail-ink/30",
  lead: "bg-accent",
  warn: "bg-[--rail-warn]",
  bad: "bg-tk-tomato",
}

function RowBadge({ badge }: { badge?: NavBadge }) {
  if (!badge || badge.count <= 0) return null
  return (
    <span
      className={cn(
        "grid h-[18px] min-w-5 place-items-center rounded-full px-1.5 font-ui text-[10.5px] font-bold text-tk-linen",
        BADGE_TONE[badge.tone ?? "lead"]
      )}
    >
      {badge.count > 99 ? "99+" : badge.count}
    </span>
  )
}

/**
 * The live clock card at the top of the Time panel. Reads the SAME context
 * FloatingClock does (RunningClockProvider) — no poll of its own — and shows
 * whichever is most current: a live meeting recording, else the first
 * running punch, else nothing. A second or third simultaneous punch gets a
 * "+N more" link to the full Clock page rather than a stacked list, which is
 * FloatingClock's job, not a 236px panel's.
 */
function ClockCard() {
  const { running, recording } = useRunningClock()
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const showRecording =
    recording &&
    (recording.status === "recording" || recording.status === "stopping" || recording.status === "requested")
  const shownPunches = running.filter((punch) => !recording || punch.id !== recording.punchId)
  const punch = shownPunches[0]
  const extra = Math.max(0, shownPunches.length - 1)

  if (!showRecording && !punch) return null

  if (showRecording && recording) {
    const name =
      recording.title ||
      [recording.client?.name, recording.project?.name].filter(Boolean).join(" · ") ||
      "Untitled meeting"
    const starting = recording.status === "requested"
    return (
      <div className="mx-0.5 flex flex-col gap-2.5 rounded-xl bg-[--rail-active] px-3 py-3 ring-1 ring-inset ring-rail-line">
        <div className="flex items-center justify-between gap-2 font-ui text-xs font-semibold text-rail-ink/80">
          <span className="flex min-w-0 items-center gap-1.5">
            <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-tk-teal" />
            <span className="truncate">{starting ? "Starting…" : name}</span>
          </span>
        </div>
        <div className="flex items-center justify-between">
          <RecordingElapsed live={recording} />
          <button
            type="button"
            disabled={busy}
            aria-label={starting ? "Cancel the recording" : `Stop recording ${name}`}
            onClick={() => {
              setError(null)
              startTransition(async () => {
                const result = await stopRecordingAction(recording.id)
                if (!result.ok) setError(result.error)
                else announcePunchChange()
              })
            }}
            className="flex items-center gap-1.5 rounded-lg bg-rail-ink/10 px-2.5 py-[7px] font-ui text-xs font-semibold text-rail-ink hover:bg-rail-ink/[0.15] disabled:opacity-50"
          >
            <Square className="size-[11px]" aria-hidden />
            {busy ? "Stopping…" : "Stop"}
          </button>
        </div>
        {error ? (
          <p role="status" className="font-ui text-[11px] font-medium text-rail-ink/85">
            {error}
          </p>
        ) : null}
      </div>
    )
  }

  if (!punch) return null
  return (
    <div className="mx-0.5 flex flex-col gap-2.5 rounded-xl bg-[--rail-active] px-3 py-3 ring-1 ring-inset ring-rail-line">
      <div className="flex items-center justify-between gap-2 font-ui text-xs font-semibold text-rail-ink/80">
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden className="size-[7px] shrink-0 rounded-full bg-tk-teal" />
          <span className="truncate">Clocked in · {punch.clientName}</span>
        </span>
      </div>
      <div className="flex items-center justify-between">
        <PunchElapsed punch={punch} />
        <button
          type="button"
          disabled={busy}
          aria-label={`Clock out of ${punch.clientName}`}
          onClick={() => {
            setError(null)
            startTransition(async () => {
              const result = await stopPunch({ punchId: punch.id })
              if (!result.ok) setError(result.error)
              else announcePunchChange()
            })
          }}
          className="flex items-center gap-1.5 rounded-lg bg-rail-ink/10 px-2.5 py-[7px] font-ui text-xs font-semibold text-rail-ink hover:bg-rail-ink/[0.15] disabled:opacity-50"
        >
          <Square className="size-[11px]" aria-hidden />
          {busy ? "Stopping…" : "Stop"}
        </button>
      </div>
      {error ? (
        <p role="status" className="font-ui text-[11px] font-medium text-rail-ink/85">
          {error}
        </p>
      ) : null}
      {extra > 0 ? (
        <Link href={ROUTES.timesheetLive} className="font-ui text-[11px] font-semibold text-rail-ink/60 hover:text-rail-ink hover:underline">
          +{extra} more running
        </Link>
      ) : null}
    </div>
  )
}

function PunchElapsed({ punch }: { punch: { startedAt: string; minutes: number } }) {
  const seconds = useElapsed(punch.startedAt, punch.minutes)
  return (
    <span className="font-display text-[26px] font-bold tabular-nums tracking-[-0.01em] text-rail-ink">{clockLabel(seconds)}</span>
  )
}

function RecordingElapsed({ live }: { live: { status: string; startedAt: string | null } }) {
  const seconds = useElapsed(live.status === "recording" ? live.startedAt : null)
  return (
    <span className="font-display text-[26px] font-bold tabular-nums tracking-[-0.01em] text-rail-ink">{clockLabel(seconds)}</span>
  )
}

/**
 * The 236px rail-2 panel beside the dock: a group's title, its rows, and —
 * only for Time — the live clock card. `onClose` swaps the desktop pin/unpin
 * toggle for a phone sheet's X, since the mockup draws two different
 * dismiss affordances for the same "make this go away" action.
 */
export function HubPanel({
  group,
  activeHref,
  badges,
  pinned,
  onTogglePinned,
  onClose,
  className,
}: {
  group: NavGroup
  /**
   * The one row to highlight — resolved by AppShell's longest-prefix match
   * (`resolveActiveNav`), not recomputed per row here. A naive per-row
   * `pathname.startsWith(item.href)` would light up BOTH "Timesheet" and
   * "Review" at once on /timesheet/review, since "/timesheet" prefixes
   * "/timesheet/review" too.
   */
  activeHref: string | null
  badges: Record<string, NavBadge>
  pinned?: boolean
  onTogglePinned?: () => void
  onClose?: () => void
  /**
   * The wrapper's own box — width, background, padding, rounding, border.
   * Left to the caller rather than defaulted here because the desktop panel
   * (a fixed 236px column with a right hairline) and the phone sheet (full
   * width, rounded top corners, no border) do not share a box, only the
   * content inside it.
   */
  className: string
}) {
  return (
    <aside
      aria-label={`${group.label} pages`}
      data-chrome="sidebar"
      role={onClose ? "dialog" : undefined}
      aria-modal={onClose ? true : undefined}
      className={cn("flex flex-col gap-3.5", className)}
    >
      {onClose ? (
        <span aria-hidden className="mx-auto -mt-1 h-1 w-9 shrink-0 rounded-full bg-rail-ink/[0.22]" />
      ) : null}
      <div className="flex items-center justify-between py-0 pl-2.5 pr-1">
        <h2 className="font-display text-[17px] font-bold tracking-[-0.01em] text-rail-ink">{group.label}</h2>
        {onClose ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-11 place-items-center rounded-full bg-rail-ink/[0.08] text-rail-ink"
          >
            <X className="size-[18px]" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            aria-pressed={pinned}
            aria-label={pinned ? "Unpin this panel" : "Pin this panel open"}
            onClick={onTogglePinned}
            className={cn(
              "grid size-7 place-items-center rounded-lg",
              pinned ? "bg-[--rail-active] text-[--rail-active-icon]" : "text-[--rail-active-icon] hover:bg-rail-hover"
            )}
          >
            <Pin className="size-[15px]" aria-hidden />
          </button>
        )}
      </div>

      {group.id === "time" ? <ClockCard /> : null}

      <ul className="flex flex-col gap-0.5">
        {group.items.map((item) => {
          const active = item.href === activeHref
          const Icon = navIcon(item.icon)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center justify-between gap-2.5 rounded-lg px-2.5 font-ui text-[13px] leading-[19px] transition-colors",
                  onClose ? "py-3" : "py-1.5",
                  active
                    ? "bg-[--rail-active] font-semibold text-white"
                    : "text-rail-ink-2 hover:bg-rail-hover hover:text-rail-ink"
                )}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <Icon
                    aria-hidden
                    className={cn("size-4 shrink-0", active ? "text-[--rail-active-icon]" : "text-rail-ink/50")}
                    strokeWidth={active ? 2.25 : 2}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <RowBadge badge={badges[item.href]} />
              </Link>
            </li>
          )
        })}
      </ul>
    </aside>
  )
}
