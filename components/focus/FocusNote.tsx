"use client"

import Link from "next/link"
import { useDraggable } from "@dnd-kit/core"
import { Check, CornerDownLeft, ExternalLink, Pin, X } from "lucide-react"
import { cn } from "@/lib/cn"
import { clientColor, markColor } from "@/lib/client-colors"
import { KIND_LABEL, PAPER_LABEL, type FocusCard } from "@/lib/focus"

export type NoteOps = {
  onDone: (id: string) => void
  onGlobal: (id: string, global: boolean) => void
  onToQueue: (id: string) => void
  onUnfocus: (id: string) => void
}

/**
 * A post-it. `size="slot"` is the tray card, `size="sheet"` the 1-mode desk
 * sheet with notes, checklist and actions. Paper colour comes in on --paper;
 * the tape, fold and pin are CSS on `.tk-note` (globals.css).
 */
export function FocusNote({
  card,
  size,
  tilt = 0,
  ops,
  children,
}: {
  card: FocusCard
  size: "slot" | "sheet"
  tilt?: number
  ops: NoteOps
  /** Sheet-only extras (checklist, chat) rendered by the tray. */
  children?: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `focus:${card.id}`,
    data: { kind: "focus", id: card.id },
  })
  const sheet = size === "sheet"
  const style = {
    "--paper": `var(--paper-${card.paper})`,
    "--c": markColor(clientColor(card.clientSlug)),
    transform: `rotate(${tilt}deg)`,
  } as React.CSSProperties

  return (
    <article
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      data-global={card.global ? "true" : "false"}
      style={style}
      className={cn(
        "tk-note group flex cursor-grab touch-none flex-col gap-1.5 active:cursor-grabbing",
        sheet ? "min-h-[190px] px-5 py-4 sm:px-6" : "min-h-[150px] px-3.5 pb-3 pt-3.5",
        isDragging && "opacity-40"
      )}
    >
      {card.global ? <span aria-hidden className="tk-pinhead" /> : null}

      <div className="flex items-center gap-1.5 font-ui text-[9px] font-extrabold uppercase tracking-[0.12em] text-[--paper-ink-3]">
        {PAPER_LABEL[card.paper] ?? KIND_LABEL[card.refKind]}
        {card.global ? (
          <span
            className="ml-auto inline-flex h-4 items-center gap-1 rounded-[3px] bg-[--c] px-1.5 font-ui text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-white"
            title={`On the global set · ${card.clientName}`}
          >
            <Pin className="size-2.5" aria-hidden />
            Global
          </span>
        ) : null}
      </div>

      <h3
        className={cn(
          "text-[--paper-ink]",
          sheet
            ? "font-display text-[21px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[24px]"
            : "text-[13.5px] font-semibold leading-[1.3] tracking-[-0.005em]"
        )}
      >
        {card.title}
      </h3>

      <p className={cn("flex flex-wrap gap-x-2 gap-y-0.5 text-[--paper-ink-2]", sheet ? "text-xs" : "text-[11px]")}>
        {card.project ? <span>{card.project}</span> : null}
        {card.dueLabel ? (
          <span className={cn(card.overdue && "font-bold text-[--pin]")}>
            {card.overdue ? "⚠ " : ""}
            {card.dueLabel}
          </span>
        ) : null}
      </p>

      {sheet ? children : null}

      <div className="mt-auto flex items-center gap-2 border-t border-dashed border-[--paper-line] pt-1.5">
        {card.checklist ? (
          <span className="flex items-center gap-1.5 font-ui text-[10.5px] font-semibold text-[--paper-ink-2]">
            <span className="h-1 w-[54px] overflow-hidden rounded-full bg-[--paper-line]">
              <span
                className="block h-full bg-[--paper-ink-2]"
                style={{ width: `${Math.round((card.checklist.done / card.checklist.total) * 100)}%` }}
              />
            </span>
            {card.checklist.done}/{card.checklist.total}
          </span>
        ) : null}
        <span
          className={cn(
            "ml-auto inline-flex gap-0.5 transition-opacity",
            sheet ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          )}
        >
          <NoteButton label="Done" onClick={() => ops.onDone(card.id)} done>
            <Check className="size-3.5" aria-hidden />
          </NoteButton>
          <NoteButton
            label={card.global ? "Take off the global set" : "Elevate to the global set"}
            onClick={() => ops.onGlobal(card.id, !card.global)}
            on={card.global}
          >
            <Pin className="size-3.5" aria-hidden />
          </NoteButton>
          <NoteButton label="Back to the queue" onClick={() => ops.onToQueue(card.id)}>
            <CornerDownLeft className="size-3.5" aria-hidden />
          </NoteButton>
          <NoteButton label="Unfocus" onClick={() => ops.onUnfocus(card.id)}>
            <X className="size-3.5" aria-hidden />
          </NoteButton>
        </span>
      </div>
    </article>
  )
}

function NoteButton({
  label,
  onClick,
  on,
  done,
  children,
}: {
  label: string
  onClick: () => void
  on?: boolean
  done?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        "grid size-[22px] place-items-center rounded-[5px] text-[--paper-ink-2] hover:bg-[--paper-line] hover:text-[--paper-ink]",
        on && "text-[--pin]",
        done && "hover:bg-good-soft"
      )}
    >
      {children}
    </button>
  )
}

/** The compact strip in the queue: number, title, kind, promote. */
export function QueueNote({
  card,
  index,
  onPromote,
}: {
  card: FocusCard
  index: number
  onPromote: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `focus:${card.id}`,
    data: { kind: "focus", id: card.id },
  })
  const style = {
    "--paper": `var(--paper-${card.paper})`,
    transform: `rotate(${index % 2 ? 0.4 : -0.4}deg)`,
  } as React.CSSProperties
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={style}
      className={cn(
        "tk-qnote group flex cursor-grab touch-none items-center gap-2 px-2.5 py-1.5 text-xs font-medium active:cursor-grabbing",
        isDragging && "opacity-40"
      )}
    >
      <span className="w-3.5 shrink-0 font-mono text-[10px] font-extrabold text-[--paper-ink-3]">{index + 1}</span>
      <span className="min-w-0 flex-1 truncate">{card.title}</span>
      <span className="shrink-0 font-ui text-[8.5px] font-extrabold uppercase tracking-[0.1em] text-[--paper-ink-3]">
        {PAPER_LABEL[card.paper]}
      </span>
      <button
        type="button"
        aria-label="Promote to a slot"
        title="Promote"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onPromote(card.id)
        }}
        className="grid size-5 shrink-0 place-items-center rounded text-[--paper-ink-2] opacity-0 hover:bg-[--paper-line] group-hover:opacity-100"
      >
        <ExternalLink className="size-3" aria-hidden />
      </button>
    </div>
  )
}
