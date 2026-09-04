"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { setLeadStageAction, setLeadValueAction } from "@/app/(admin)/leads/actions"
import { cn } from "@/lib/cn"
import { hideMoney, MASK_DIGITS } from "@/lib/money-privacy"
import {
  SALES_STAGES,
  leadStage,
  type LeadListItem,
  type SalesStageId,
} from "@/lib/lead"
import { formatMoney } from "@/lib/work"

const EDGE = "#006965"

function ageLabel(iso: string | null) {
  if (!iso) return null
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
  if (days === 0) return "today"
  if (days < 60) return `${days}d`
  return new Date(iso).toLocaleDateString("en-US", { month: "short" })
}

function meetingLabel(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

function CardBody({ lead }: { lead: LeadListItem }) {
  const stage = leadStage(lead)
  const meeting = stage === "meeting" ? meetingLabel(lead.lead.meetingAt) : null
  const lastSend = lead.lead.sends[lead.lead.sends.length - 1]

  return (
    <>
      <p className="text-[12.5px] font-semibold text-tk-onyx">{lead.name}</p>
      {lead.company ? <p className="text-[11px] text-ink-3">{lead.company}</p> : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {lead.pipeline.valueCents != null ? (
          <span className="font-mono text-[11.5px] font-semibold tabular-nums text-tk-onyx">
            {formatMoney(lead.pipeline.valueCents)}
          </span>
        ) : null}
        {meeting ? (
          <span className="rounded-full bg-well px-2 py-0.5 text-[10.5px] text-tk-slate">
            {meeting}
          </span>
        ) : stage === "sent" && lastSend ? (
          <span className="rounded-full bg-well px-2 py-0.5 text-[10.5px] text-tk-slate">
            {lastSend.templateTitle}
          </span>
        ) : (
          lead.projectTypes.slice(0, 2).map((t) => (
            <span
              key={t}
              className="rounded-full bg-well px-2 py-0.5 text-[10.5px] text-tk-slate"
            >
              {t}
            </span>
          ))
        )}
        <span className="ml-auto font-mono text-[10px] text-ink-3">
          {ageLabel(lead.pipeline.stageChangedAt ?? lead.createdAt)}
        </span>
      </div>
    </>
  )
}

function Column({
  id,
  label,
  prob,
  count,
  weighted,
  children,
}: {
  id: string
  label: string
  prob: number
  count: number
  weighted: number
  children: React.ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[230px] flex-col rounded-2xl border bg-well transition-colors",
        isOver ? "border-tk-teal bg-tk-teal/5" : "border-line"
      )}
    >
      <div className="px-3 pb-1.5 pt-2.5">
        <h3 className="flex items-baseline justify-between gap-2 text-[12px] font-semibold text-tk-onyx">
          {label}
          <span className="text-[11px] font-medium tabular-nums text-ink-3">
            {count || ""}
          </span>
        </h3>
        <p className="mt-0.5 text-[10.5px] tabular-nums text-ink-3">
          {prob === 100
            ? `${formatMoney(weighted)} won`
            : `${formatMoney(Math.round(weighted))} weighted · ${prob}%`}
        </p>
      </div>
      <ul className="flex flex-1 flex-col gap-1.5 px-2 pb-2.5">{children}</ul>
    </div>
  )
}

function DraggableCard({
  id,
  dragging,
  onOpen,
  children,
}: {
  id: string
  dragging: boolean
  onOpen: () => void
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id })
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onDoubleClick={onOpen}
      className={cn(
        "cursor-grab touch-none rounded-xl border border-line bg-card p-2.5 shadow-card active:cursor-grabbing",
        dragging && "opacity-35"
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: EDGE }}
    >
      {children}
    </li>
  )
}

/**
 * The sales board, moved off the delivery page. Drag changes a stage; the
 * value field writes straight through. Double-clicking a card selects the
 * lead so the workspace below it fills in.
 */
export function SalesBoard({
  leads,
  onSelect,
}: {
  leads: LeadListItem[]
  onSelect: (id: string) => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [rows, setRows] = useState(leads)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => setRows(leads), [leads])

  const active = rows.find((l) => l.id === activeId) ?? null

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const stage = event.over?.id as SalesStageId | undefined
    const lead = rows.find((l) => l.id === event.active.id)
    if (!stage || !lead || !SALES_STAGES.some((s) => s.id === stage)) return
    if (leadStage(lead) === stage) return

    const before = rows
    setRows((list) =>
      list.map((l) =>
        l.id === lead.id
          ? { ...l, pipeline: { ...l.pipeline, stage, stageChangedAt: new Date().toISOString() } }
          : l
      )
    )
    startTransition(async () => {
      const result = await setLeadStageAction(lead.id, stage)
      if (!result.ok) {
        setRows(before)
        setError(result.error)
        return
      }
      setError(null)
      router.refresh()
    })
  }

  function saveValue(lead: LeadListItem, raw: string) {
    const trimmed = raw.replace(/[$,]/g, "").trim()
    const parsed = Number(trimmed)
    const cents =
      trimmed === "" ? null : Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : undefined
    if (cents === undefined) {
      setError("That isn't a value.")
      return
    }
    if (cents === lead.pipeline.valueCents) return

    const before = rows
    setRows((list) =>
      list.map((l) => (l.id === lead.id ? { ...l, pipeline: { ...l.pipeline, valueCents: cents } } : l))
    )
    startTransition(async () => {
      const result = await setLeadValueAction(lead.id, cents)
      if (!result.ok) {
        setRows(before)
        setError(result.error)
        return
      }
      setError(null)
      router.refresh()
    })
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {error ? (
        <p role="status" className="mt-3 text-[11.5px] font-semibold text-bad">
          {error}
        </p>
      ) : null}
      <div className="mt-3 grid gap-2.5 overflow-x-auto pb-2 [grid-template-columns:repeat(5,minmax(196px,1fr))]">
        {SALES_STAGES.map((stage) => {
          const inStage = rows.filter((l) => leadStage(l) === stage.id)
          const weighted = inStage.reduce(
            (sum, l) => sum + ((l.pipeline.valueCents ?? 0) * stage.prob) / 100,
            0
          )
          return (
            <Column
              key={stage.id}
              id={stage.id}
              label={stage.label}
              prob={stage.prob}
              count={inStage.length}
              weighted={weighted}
            >
              {inStage.map((lead) => (
                <DraggableCard
                  key={lead.id}
                  id={lead.id}
                  dragging={lead.id === activeId}
                  onOpen={() => onSelect(lead.id)}
                >
                  <CardBody lead={lead} />
                  {hideMoney() ? (
                    // Demo mode: no value in the DOM and no save on blur.
                    <input
                      readOnly
                      value={lead.pipeline.valueCents != null ? MASK_DIGITS : ""}
                      placeholder="$ value"
                      aria-label={`Estimated value for ${lead.name} (hidden)`}
                      onPointerDown={(e) => e.stopPropagation()}
                      className="mt-1.5 w-full rounded-md border border-line bg-well px-2 py-1 text-[11px] tabular-nums outline-none"
                    />
                  ) : (
                    <input
                      defaultValue={
                        lead.pipeline.valueCents != null ? String(lead.pipeline.valueCents / 100) : ""
                      }
                      placeholder="$ value"
                      inputMode="decimal"
                      aria-label={`Estimated value for ${lead.name}`}
                      onPointerDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                      }}
                      onBlur={(e) => saveValue(lead, e.target.value)}
                      className="mt-1.5 w-full rounded-md border border-line bg-well px-2 py-1 text-[11px] tabular-nums outline-none focus:border-tk-teal"
                    />
                  )}
                </DraggableCard>
              ))}
            </Column>
          )
        })}
      </div>
      <DragOverlay>
        {active ? (
          <div
            className="w-56 rotate-2 rounded-xl border border-line bg-card p-2.5 shadow-overlay"
            style={{ borderLeftWidth: 3, borderLeftColor: EDGE }}
          >
            <CardBody lead={active} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
