"use client"

import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  ExternalLink,
  Hash,
  KeyRound,
  MapPin,
  Users,
  X,
} from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/cn"
import { parseRichText, presentCalendarCopy, safeHref } from "@/lib/linkify"
import { markColor } from "@/lib/client-colors"

export type EventModalItem = {
  title: string
  startsAt: string
  endsAt: string
  allDay: boolean
  location?: string
  description?: string
  url?: string
  href?: string | null
  attendees?: { name: string; email: string }[]
  cancelled?: boolean
  color?: string
  source?: string
}

function whenParts(event: EventModalItem) {
  const start = new Date(event.startsAt)
  const end = new Date(event.endsAt)
  const date = start.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  })
  if (event.allDay) return { date, time: "All day" }
  const clock: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  }
  return {
    date,
    time: `${start.toLocaleTimeString(undefined, clock)} – ${end.toLocaleTimeString(undefined, clock)}`,
  }
}

function crmLinkLabel(href: string) {
  if (href.startsWith("/invoices/")) return "View invoice"
  if (href.startsWith("/contracts/")) return "View contract"
  if (href.startsWith("/timesheet")) return "View timesheet"
  if (href.startsWith("/clients/")) return "View client"
  return "Open in CRM"
}

function initials(name: string, email: string) {
  const fromName = name.trim().split(/\s+/).filter(Boolean)
  if (fromName.length >= 2) {
    return (fromName[0][0] + fromName[1][0]).toUpperCase()
  }
  if (fromName.length === 1 && fromName[0].length >= 2) {
    return fromName[0].slice(0, 2).toUpperCase()
  }
  const local = (email.split("@")[0] ?? "").split(/[._-]+/).filter(Boolean)
  if (local.length >= 2) return (local[0][0] + local[1][0]).toUpperCase()
  return (local[0] ?? "?").slice(0, 2).toUpperCase()
}

function ExternalA({
  href,
  children,
  className,
}: {
  href: string
  children: ReactNode
  className?: string
}) {
  const mailto = href.startsWith("mailto:")
  return (
    <a
      href={href}
      target={mailto ? undefined : "_blank"}
      rel={mailto ? undefined : "noreferrer"}
      className={className}
    >
      {children}
    </a>
  )
}

function LinkifiedText({ text }: { text: string }) {
  const parts = parseRichText(text)
  if (!parts.length) return null
  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-tk-slate">
      {parts.map((part, i) =>
        part.type === "link" ? (
          <ExternalA
            key={`${part.href}:${i}`}
            href={part.href}
            className={cn(
              "font-medium text-tk-teal underline-offset-2 hover:underline",
              part.label.startsWith("http") && "break-all"
            )}
          >
            {part.label}
          </ExternalA>
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </p>
  )
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
          {label}
        </p>
        <div className="mt-0.5 text-sm text-tk-onyx">{children}</div>
      </div>
    </div>
  )
}

const pill =
  "inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors"
const pillPrimary = `${pill} bg-accent text-tk-linen hover:bg-tk-teal/90`
const pillGhost = `${pill} border border-line text-tk-slate hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:text-tk-teal`

export function EventModal({
  event,
  onClose,
}: {
  event: EventModalItem
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  if (!mounted) return null

  const color = event.color ?? "#006965"
  const when = whenParts(event)
  const attendees = (event.attendees ?? []).filter(
    (person) => person.name || person.email
  )
  const copy = event.description?.trim()
    ? presentCalendarCopy(event.description)
    : null
  const amount =
    copy &&
    copy.links.length === 0 &&
    !copy.meetingId &&
    /^\$[\d,]+(\.\d{2})?$/.test(copy.notes)
      ? copy.notes
      : null
  const notes = amount ? "" : (copy?.notes ?? "")
  const locationHref = event.location ? safeHref(event.location) : null
  const join = copy?.links.find((link) => link.kind === "join")
  const extraLinks = (copy?.links ?? []).filter((link) => link.kind !== "join")
  const hasBody =
    Boolean(event.location) ||
    attendees.length > 0 ||
    Boolean(copy?.meetingId) ||
    Boolean(copy?.passcode) ||
    Boolean(notes) ||
    extraLinks.length > 0

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8">
      <button
        type="button"
        className="absolute inset-0 bg-scrim backdrop-blur-[2px] motion-safe:animate-[tk-fade-in_.18s_ease-out]"
        aria-label="Close event"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="event-modal-title"
        className="relative flex max-h-[min(40rem,90dvh)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-overlay motion-safe:animate-[tk-modal-in_.22s_ease-out]"
      >
        <div className="h-1 shrink-0" style={{ background: markColor(color) }} />

        <header className="flex shrink-0 items-start justify-between gap-3 px-6 pb-4 pt-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {event.source ? (
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-3">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: markColor(color) }}
                  />
                  {event.source}
                </p>
              ) : null}
              {event.cancelled ? (
                <span className="rounded-full bg-bad-soft px-2 py-0.5 text-[11px] font-semibold text-bad">
                  Cancelled
                </span>
              ) : null}
            </div>
            <h2
              id="event-modal-title"
              className="mt-1.5 text-xl font-semibold leading-snug tracking-tight text-tk-onyx"
            >
              {event.title || "Untitled event"}
            </h2>
            {amount ? (
              <p className="mt-1 text-[26px] font-semibold leading-tight text-tk-onyx">
                {amount}
              </p>
            ) : null}
            <p className="mt-1.5 text-sm text-ink-3">
              {when.date}
              <span className="text-ink-3"> · </span>
              {when.time}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-well transition-colors duration-[120ms] hover:text-tk-onyx"
            aria-label="Close event"
          >
            <X className="size-4" aria-hidden />
          </button>
        </header>

        {hasBody ? (
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto border-t border-line px-6 py-5">
            {event.location ? (
              <Fact icon={MapPin} label="Where">
                {locationHref ? (
                  <ExternalA
                    href={locationHref}
                    className="font-medium text-tk-teal hover:underline"
                  >
                    {event.location}
                  </ExternalA>
                ) : (
                  event.location
                )}
              </Fact>
            ) : null}

            {attendees.length ? (
              <Fact icon={Users} label="Who">
                <ul className="flex flex-wrap gap-1.5">
                  {attendees.map((person, i) => {
                    const label = person.name || person.email
                    const chip = (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-well px-2 py-1 pr-2.5">
                        <span
                          className="grid size-5 place-items-center rounded-full bg-accent text-[9px] font-bold text-tk-linen"
                          aria-hidden
                        >
                          {initials(person.name, person.email)}
                        </span>
                        <span className="text-xs font-medium text-tk-onyx">
                          {label}
                        </span>
                      </span>
                    )
                    return (
                      <li key={`${person.email}:${i}`}>
                        {person.email ? (
                          <ExternalA href={`mailto:${person.email}`}>
                            {chip}
                          </ExternalA>
                        ) : (
                          chip
                        )}
                      </li>
                    )
                  })}
                </ul>
              </Fact>
            ) : null}

            {copy?.meetingId || copy?.passcode ? (
              <div className="grid grid-cols-2 gap-4">
                {copy.meetingId ? (
                  <Fact icon={Hash} label="Meeting ID">
                    <span className="font-medium tabular-nums">
                      {copy.meetingId}
                    </span>
                  </Fact>
                ) : null}
                {copy.passcode ? (
                  <Fact icon={KeyRound} label="Passcode">
                    <span className="font-medium">{copy.passcode}</span>
                  </Fact>
                ) : null}
              </div>
            ) : null}

            {notes ? (
              <div className="rounded-xl bg-well px-4 py-3">
                <LinkifiedText text={notes} />
              </div>
            ) : null}

            {extraLinks.length ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
                {extraLinks.map((link) => (
                  <li key={link.href}>
                    <ExternalA
                      href={link.href}
                      className="text-sm font-semibold text-tk-teal hover:underline"
                    >
                      {link.label}
                    </ExternalA>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {join || event.url || event.href ? (
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line bg-well px-6 py-3.5">
            {join ? (
              <ExternalA href={join.href} className={pillPrimary}>
                {join.label}
                <ExternalLink className="size-3.5 opacity-80" aria-hidden />
              </ExternalA>
            ) : null}
            {event.url ? (
              <ExternalA
                href={event.url}
                className={join ? pillGhost : pillPrimary}
              >
                Open calendar event
                <ExternalLink className="size-3.5 opacity-80" aria-hidden />
              </ExternalA>
            ) : null}
            {event.href ? (
              <Link
                href={event.href}
                onClick={onClose}
                className={join || event.url ? pillGhost : pillPrimary}
              >
                {crmLinkLabel(event.href)}
              </Link>
            ) : null}
          </footer>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
