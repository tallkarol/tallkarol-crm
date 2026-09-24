"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useDroppable } from "@dnd-kit/core"
import { ExternalLink, Layers, LayoutGrid, Maximize2, Plus, Square, StickyNote } from "lucide-react"
import { SolveInChat } from "@/components/tasks/SolveInChat"
import { solveTaskAction } from "@/lib/chat/task-actions"
import { cn } from "@/lib/cn"
import { setChecklistItemDone } from "@/lib/task-actions"
import { FOCUS_MAX, type FocusCard, type FocusMode } from "@/lib/focus"
import { FocusNote, QueueNote, type NoteOps } from "@/components/focus/FocusNote"

const TILT = [-1.1, 0.7, -0.5]

/**
 * The Focus row: the showing slots (3 or 1) and the queue beside them. Owns
 * no drag state — the Board's DndContext does — but registers every drop
 * target: each slot, the queue, and "before this queue note".
 */
export function FocusTray({
  showing,
  queue,
  mode,
  ops,
  onMode,
  onTakeover,
  onPromote,
  onAdd,
  compact = false,
  actions,
  hint,
  flag = "global",
  queueHint = "Queue is empty — drag from the board or the inbox",
}: {
  showing: FocusCard[]
  queue: FocusCard[]
  mode: FocusMode
  ops: NoteOps
  onMode: (mode: FocusMode) => void
  onTakeover?: () => void
  onPromote: (id: string) => void
  onAdd?: (title: string) => Promise<void>
  /** The takeover: no header controls, bigger cards. */
  compact?: boolean
  /** Controls beside the 3 | 1 switch (the roster puts "New client" here). */
  actions?: React.ReactNode
  /** The line after the title — "3 pinned across 2 clients". */
  hint?: React.ReactNode
  /** What the notes' top-right badge says — see FocusNote. */
  flag?: "global" | "client"
  queueHint?: string
}) {
  const max = FOCUS_MAX[mode]
  return (
    <section className="flex flex-col gap-2.5" aria-label="Focus">
      {!compact ? (
        <div className="flex items-center gap-2.5">
          <h2 className="flex items-center gap-1.5 font-ui text-[13px] font-bold text-tk-onyx">
            <StickyNote className="size-3.5" aria-hidden />
            Focus
          </h2>
          {hint ? <span className="hidden min-w-0 truncate text-[11.5px] text-ink-3 md:inline">{hint}</span> : null}
          <div className="ml-auto flex items-center gap-1.5">
            {actions}
            <ModeSwitch mode={mode} onMode={onMode} />
            {onTakeover ? (
              <button
                type="button"
                onClick={onTakeover}
                title="Take over the screen · Esc to come back"
                aria-label="Take over the screen"
                className="grid size-[30px] place-items-center rounded-lg text-ink-3 hover:bg-well hover:text-tk-onyx"
              >
                <Maximize2 className="size-4" aria-hidden />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className={cn("grid items-start gap-3.5", compact ? "" : "lg:grid-cols-[minmax(0,1fr)_248px]")}>
        <div
          className={cn(
            "grid gap-3.5 px-1 pb-2 pt-2",
            mode === "one" ? "grid-cols-1" : "grid-cols-3",
            compact && mode === "three" && "gap-7 px-2.5 pt-5"
          )}
        >
          {Array.from({ length: max }, (_, i) => (
            <Slot key={i} index={i} card={showing[i] ?? null} mode={mode} ops={ops} compact={compact} flag={flag} />
          ))}
        </div>
        {!compact ? <Queue queue={queue} onPromote={onPromote} onAdd={onAdd} hint={queueHint} /> : null}
      </div>
    </section>
  )
}

export function ModeSwitch({ mode, onMode }: { mode: FocusMode; onMode: (m: FocusMode) => void }) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg border border-line bg-card p-0.5" role="group" aria-label="How many at once">
      <button
        type="button"
        onClick={() => onMode("three")}
        aria-pressed={mode === "three"}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-md px-2 font-ui text-[11px] font-semibold",
          mode === "three" ? "bg-tk-onyx text-tk-linen" : "text-ink-3 hover:text-tk-onyx"
        )}
      >
        <LayoutGrid className="size-3" aria-hidden />3
      </button>
      <button
        type="button"
        onClick={() => onMode("one")}
        aria-pressed={mode === "one"}
        className={cn(
          "inline-flex h-6 items-center gap-1 rounded-md px-2 font-ui text-[11px] font-semibold",
          mode === "one" ? "bg-tk-onyx text-tk-linen" : "text-ink-3 hover:text-tk-onyx"
        )}
      >
        <Square className="size-3" aria-hidden />1
      </button>
    </div>
  )
}

function Slot({
  index,
  card,
  mode,
  ops,
  compact,
  flag,
}: {
  index: number
  card: FocusCard | null
  mode: FocusMode
  ops: NoteOps
  compact: boolean
  flag: "global" | "client"
}) {
  const { isOver, setNodeRef } = useDroppable({ id: `slot:${index}`, data: { zone: "slot", index } })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative min-w-0 rounded-md",
        isOver && "outline outline-2 outline-offset-4 outline-dashed outline-accent-ink",
        !card && "grid min-h-[150px] place-items-center border-[1.5px] border-dashed border-line-strong px-3 text-center font-ui text-[11.5px] font-semibold text-ink-3",
        !card && compact && "min-h-[280px]"
      )}
    >
      {card ? (
        <FocusNote card={card} size={mode === "one" ? "sheet" : "slot"} tilt={mode === "one" ? -0.3 : TILT[index] ?? 0} ops={ops} flag={flag}>
          {mode === "one" ? <SheetBody card={card} /> : null}
        </FocusNote>
      ) : (
        <span>
          Drop a card here
          <span className="mt-1 block font-medium opacity-80">or pick from the queue</span>
        </span>
      )}
    </div>
  )
}

/** The 1-mode desk sheet body: notes, checklist, and the three verbs. */
function SheetBody({ card }: { card: FocusCard }) {
  const router = useRouter()
  const [, start] = useTransition()
  return (
    <>
      <div className={cn("grid gap-4", card.steps.length ? "sm:grid-cols-[minmax(0,1fr)_220px]" : "")}>
        {card.notes ? (
          <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-[--paper-ink-2]">{card.notes}</p>
        ) : (
          <span />
        )}
        {card.steps.length ? (
          <ul className="flex flex-col gap-1 text-xs">
            {card.steps.map((step) => (
              <li key={step.id} className={cn("flex items-center gap-2", step.done && "text-[--paper-ink-3] line-through")}>
                <button
                  type="button"
                  aria-label={step.done ? `Reopen ${step.title}` : `Tick ${step.title}`}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() =>
                    start(async () => {
                      await setChecklistItemDone(step.id, !step.done)
                      router.refresh()
                    })
                  }
                  className={cn(
                    "grid size-[13px] shrink-0 place-items-center rounded-[3px] border-[1.5px] border-[--paper-ink-3]",
                    step.done && "border-transparent bg-[--paper-ink-2] text-[--paper]"
                  )}
                >
                  {step.done ? <span className="text-[9px] font-black leading-none">✓</span> : null}
                </button>
                {step.title}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
        {card.refKind === "task" ? (
          <SolveInChat action={solveTaskAction.bind(null, card.refId)} state={null} />
        ) : null}
        <Link
          href={card.href}
          className="inline-flex h-[26px] items-center gap-1.5 rounded-lg bg-[--paper-line] px-2.5 font-ui text-[11px] font-semibold text-[--paper-ink]"
        >
          <ExternalLink className="size-3" aria-hidden />
          Open
        </Link>
      </div>
    </>
  )
}

function Queue({
  queue,
  onPromote,
  onAdd,
  hint,
}: {
  queue: FocusCard[]
  onPromote: (id: string) => void
  onAdd?: (title: string) => Promise<void>
  hint: string
}) {
  const { isOver, setNodeRef } = useDroppable({ id: "queue", data: { zone: "queue" } })
  const [title, setTitle] = useState("")
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col gap-1.5 pt-1.5">
      <div className="flex items-center gap-1.5 px-0.5 font-ui text-[9.5px] font-extrabold uppercase tracking-[0.12em] text-ink-3">
        <Layers className="size-3" aria-hidden />
        Up next <span className="font-mono text-ink-2">{queue.length}</span>
        <span className="ml-auto font-medium normal-case tracking-normal">drag to reorder · ↗ promotes</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[40px] flex-col gap-[5px] rounded-md p-0.5",
          isOver && "outline outline-2 outline-offset-2 outline-dashed outline-accent-ink"
        )}
      >
        {queue.map((card, i) => (
          <QueueSlot key={card.id} card={card} index={i} onPromote={onPromote} />
        ))}
        {queue.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-strong px-3 py-2.5 text-center text-[11.5px] text-ink-3">{hint}</p>
        ) : null}
      </div>
      {onAdd ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const t = title.trim()
            if (!t) return
            start(async () => {
              await onAdd(t)
              setTitle("")
            })
          }}
          className="flex h-7 items-center gap-1.5 rounded-md border border-dashed border-line-strong px-2 text-ink-3 focus-within:border-ink-3"
        >
          <Plus className="size-3 shrink-0" aria-hidden />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={pending}
            placeholder="Add to the queue…"
            aria-label="Add a task to the queue"
            className="min-w-0 flex-1 bg-transparent font-ui text-[11.5px] text-tk-onyx placeholder:text-ink-3 focus:outline-none"
          />
        </form>
      ) : null}
    </div>
  )
}

function QueueSlot({ card, index, onPromote }: { card: FocusCard; index: number; onPromote: (id: string) => void }) {
  const { isOver, setNodeRef } = useDroppable({ id: `qbefore:${card.id}`, data: { zone: "qbefore", id: card.id, index } })
  return (
    <div ref={setNodeRef} className={cn("rounded-sm", isOver && "pt-2 shadow-[inset_0_2px_0_0_rgb(var(--accent-ink-rgb))]")}>
      <QueueNote card={card} index={index} onPromote={onPromote} />
    </div>
  )
}
