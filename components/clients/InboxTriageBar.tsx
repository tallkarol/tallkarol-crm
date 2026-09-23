"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AlarmClock, Archive, Check, CornerDownLeft, ExternalLink, SquareCheck, StickyNote, X } from "lucide-react"
import { archiveAction, makeTaskAction, snoozeAction } from "@/app/(admin)/inbox/actions"
import { Dropdown, MenuHead, MenuOption } from "@/components/ui/Dropdown"
import { cn } from "@/lib/cn"
import { decideApproval } from "@/lib/chat/actions"
import { addFocusAction } from "@/lib/focus-actions"
import { dismissItemAction, fileItemsAction } from "@/lib/meeting-note-actions"

/**
 * The reading pane's triage bar — the only client component in the room.
 * Deliberately kept off `lib/client-inbox.ts`: it takes plain strings so it
 * never pulls `@/db` into the browser bundle. Every verb here is one of the
 * server actions the rest of the CRM already ships; nothing new is written.
 */

type Result = { ok: boolean; error?: string }

const RING = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-tk-teal"
const BTN = `inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-card px-2.5 font-ui text-[11px] font-bold text-tk-onyx transition-colors hover:bg-well disabled:opacity-50 ${RING}`
const BTN_GO = `inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-3 font-ui text-[11px] font-bold text-tk-linen hover:brightness-95 disabled:opacity-50 ${RING}`
const BTN_BAD = `inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-card px-2.5 font-ui text-[11px] font-bold text-bad transition-colors hover:bg-bad-soft disabled:opacity-50 ${RING}`

export type TriageItem = {
  key: string
  kind: "lead" | "ticket" | "message" | "mail" | "event" | "approval" | "proposal"
  refId: string
  title: string
  href: string | null
  /** Only meaningful for kind "approval". */
  canConfirm?: boolean
  /** Only meaningful for kind "mail" — the address Reply's mailto: opens. */
  replyTo?: string
  /** Only meaningful for kind "proposal" — the note the item belongs to. */
  noteId?: string
}

export function InboxTriageBar({ item, clientId, clientSlug }: { item: TriageItem; clientId: string; clientSlug: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const [taskTitle, setTaskTitle] = useState(item.title)

  function run(action: () => Promise<Result>) {
    setError(null)
    start(async () => {
      const result = await action()
      if (!result.ok) setError(result.error ?? "That didn't work.")
      else router.refresh()
    })
  }

  if (item.kind === "approval") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-well px-3.5 py-2.5">
        {error ? <p className="w-full text-[11.5px] font-semibold text-bad">{error}</p> : null}
        {item.canConfirm ? (
          <button type="button" disabled={pending} className={BTN_GO} onClick={() => run(() => decideApproval({ callId: item.refId, approve: true }))}>
            <Check className="size-3" aria-hidden />
            Confirm
          </button>
        ) : null}
        <button type="button" disabled={pending} className={BTN_BAD} onClick={() => run(() => decideApproval({ callId: item.refId, approve: false }))}>
          <X className="size-3" aria-hidden />
          Discard
        </button>
        {item.href ? (
          <Link href={item.href} className={cn(BTN, "ml-auto")}>
            <ExternalLink className="size-3" aria-hidden />
            Open thread
          </Link>
        ) : null}
      </div>
    )
  }

  if (item.kind === "proposal") {
    return (
      <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-well px-3.5 py-2.5">
        {error ? <p className="w-full text-[11.5px] font-semibold text-bad">{error}</p> : null}
        <button
          type="button"
          disabled={pending || !item.noteId}
          className={BTN_GO}
          onClick={() => item.noteId && run(() => fileItemsAction(item.noteId as string, [item.refId]))}
        >
          <Check className="size-3" aria-hidden />
          Accept
        </button>
        <button type="button" disabled={pending} className={BTN} onClick={() => run(() => dismissItemAction(item.refId))}>
          <X className="size-3" aria-hidden />
          Dismiss
        </button>
        {item.href ? (
          <Link href={item.href} className={cn(BTN, "ml-auto")}>
            <ExternalLink className="size-3" aria-hidden />
            Open note
          </Link>
        ) : null}
      </div>
    )
  }

  const isTicketLike = item.kind === "ticket" || item.kind === "message"
  const canFocus = item.kind === "ticket" || item.kind === "mail"
  const showOpen = Boolean(item.href) && !isTicketLike

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-line bg-well px-3.5 py-2.5">
      {error ? <p className="w-full text-[11.5px] font-semibold text-bad">{error}</p> : null}

      {isTicketLike && item.href ? (
        <Link href={item.href} className={BTN_GO}>
          <CornerDownLeft className="size-3" aria-hidden />
          Reply
        </Link>
      ) : item.kind === "mail" ? (
        <a href={`mailto:${item.replyTo ?? ""}?subject=${encodeURIComponent(`Re: ${item.title}`)}`} className={BTN_GO}>
          <CornerDownLeft className="size-3" aria-hidden />
          Reply
        </a>
      ) : null}

      {composing ? (
        <span className="inline-flex items-center gap-1.5">
          <input
            autoFocus
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setComposing(false)
              if (e.key === "Enter") {
                setComposing(false)
                run(() => makeTaskAction(item.key, taskTitle, clientId))
              }
            }}
            aria-label="Task title"
            className="h-7 min-w-0 rounded-md border border-line bg-card px-2 text-[12px] focus:border-tk-teal"
          />
          <button
            type="button"
            disabled={pending}
            className={BTN_GO}
            onClick={() => {
              setComposing(false)
              run(() => makeTaskAction(item.key, taskTitle, clientId))
            }}
          >
            Save
          </button>
        </span>
      ) : (
        <button type="button" disabled={pending} className={BTN} onClick={() => setComposing(true)}>
          <SquareCheck className="size-3" aria-hidden />
          Make task
        </button>
      )}

      {canFocus ? (
        <button
          type="button"
          disabled={pending}
          className={BTN}
          onClick={() => run(() => addFocusAction({ clientId, clientSlug, refKind: item.kind as "ticket" | "mail", refId: item.refId }))}
        >
          <StickyNote className="size-3" aria-hidden />
          Focus
        </button>
      ) : null}

      <Dropdown
        label={
          <span className="inline-flex items-center gap-1.5">
            <AlarmClock className="size-3" aria-hidden />
            Snooze
          </span>
        }
      >
        {(close) => (
          <>
            <MenuHead>Hide until</MenuHead>
            {[
              { id: "tomorrow", label: "Tomorrow" },
              { id: "week", label: "Next week" },
              { id: "fortnight", label: "Two weeks" },
            ].map((span) => (
              <MenuOption
                key={span.id}
                checked={false}
                label={span.label}
                onSelect={() => {
                  close()
                  run(() => snoozeAction(item.key, span.id))
                }}
              />
            ))}
          </>
        )}
      </Dropdown>

      <button type="button" disabled={pending} className={BTN} onClick={() => run(() => archiveAction(item.key))}>
        <Archive className="size-3" aria-hidden />
        Archive
      </button>

      {showOpen ? (
        <Link href={item.href as string} className={cn(BTN, "ml-auto")}>
          <ExternalLink className="size-3" aria-hidden />
          Open
        </Link>
      ) : null}
    </div>
  )
}
