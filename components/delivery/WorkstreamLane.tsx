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
import { setWorkstreamStageAction } from "@/app/(admin)/delivery/actions"
import { AddWorkstream } from "@/components/delivery/ModalControls"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { WORKSTREAM_STAGES, ordinal } from "@/lib/pipeline"
import type { WorkstreamStage } from "@/db/schema"

export type LaneStream = { id: string; title: string; stage: string; pass: number }

export type LaneData = {
  projectId: string
  projectName: string
  projectSlug: string
  clientSlug: string
  meta: string
  streams: LaneStream[]
}

/**
 * One project's workstreams as a board. The delivery ledger collapses these
 * into a rail and changes them from a menu; this stays for the project page,
 * where dragging one track along five stages is the thing you came to do.
 */
export function WorkstreamLane({ lane }: { lane: LaneData }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [streams, setStreams] = useState(lane.streams)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  useEffect(() => setStreams(lane.streams), [lane.streams])

  const color = clientColor(lane.clientSlug)
  const active = streams.find((s) => s.id === activeId) ?? null

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const stage = event.over?.id as WorkstreamStage | undefined
    const stream = streams.find((s) => s.id === event.active.id)
    if (!stage || !stream || !WORKSTREAM_STAGES.some((s) => s.id === stage)) return
    if (stream.stage === stage) return

    const before = streams
    // Feedback → review is a new review round, and the server counts it too.
    const bump = stream.stage === "feedback" && stage === "review"
    setStreams((rows) =>
      rows.map((r) => (r.id === stream.id ? { ...r, stage, pass: bump ? r.pass + 1 : r.pass } : r))
    )
    startTransition(async () => {
      const result = await setWorkstreamStageAction(stream.id, stage)
      if (!result.ok) {
        setStreams(before)
        setError(result.error)
        return
      }
      setError(null)
      router.refresh()
    })
  }

  return (
    <section className="rounded-2xl border border-tk-slate/15 bg-white/50 p-3.5">
      <div className="flex flex-wrap items-center gap-2.5 px-1 pb-1">
        <span className="size-2 rounded-full" style={{ background: color }} />
        <h3 className="text-sm font-semibold text-tk-onyx">{lane.projectName}</h3>
        <span className="text-xs text-tk-slate/60">{lane.meta}</span>
        <span className="ml-auto">
          <AddWorkstream projectId={lane.projectId} />
        </span>
      </div>
      {error ? (
        <p role="status" className="px-1 pb-1 text-[11.5px] font-semibold text-[#B4322A]">
          {error}
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="mt-2 grid gap-2.5 overflow-x-auto pb-1 [grid-template-columns:repeat(5,minmax(170px,1fr))]">
          {WORKSTREAM_STAGES.map((stage) => {
            const inStage = streams.filter((s) => s.stage === stage.id)
            return (
              <Column key={stage.id} id={stage.id} label={stage.label} count={inStage.length}>
                {inStage.map((s) => (
                  <Card key={s.id} id={s.id} edge={color} dragging={s.id === activeId}>
                    <p className="text-[13px] font-semibold text-tk-onyx">{s.title}</p>
                    <span className="mt-1.5 inline-flex rounded-full bg-tk-teal/10 px-2 py-0.5 text-[11px] font-semibold text-tk-teal">
                      {ordinal(s.pass)} pass
                    </span>
                  </Card>
                ))}
              </Column>
            )
          })}
        </div>
        <DragOverlay>
          {active ? (
            <div
              className="w-56 rotate-2 rounded-xl border border-tk-slate/15 bg-white p-3 shadow-xl"
              style={{ borderLeftWidth: 3, borderLeftColor: color }}
            >
              <p className="text-[13px] font-semibold text-tk-onyx">{active.title}</p>
              <span className="mt-1.5 inline-flex rounded-full bg-tk-teal/10 px-2 py-0.5 text-[11px] font-semibold text-tk-teal">
                {ordinal(active.pass)} pass
              </span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  )
}

function Column({
  id,
  label,
  count,
  children,
}: {
  id: string
  label: string
  count: number
  children: React.ReactNode
}) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[140px] flex-col rounded-2xl border bg-[#FAF6EE] transition-colors",
        isOver ? "border-tk-teal bg-tk-teal/5" : "border-tk-slate/15"
      )}
    >
      <div className="px-3.5 pb-1 pt-3">
        <h4 className="flex items-baseline justify-between text-[13px] font-semibold text-tk-onyx">
          {label}
          <span className="text-xs font-medium text-tk-slate/60">{count || ""}</span>
        </h4>
      </div>
      <ul className="flex flex-1 flex-col gap-2 px-2.5 pb-3 pt-1.5">{children}</ul>
    </div>
  )
}

function Card({
  id,
  edge,
  dragging,
  children,
}: {
  id: string
  edge: string
  dragging: boolean
  children: React.ReactNode
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id })
  return (
    <li
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab touch-none rounded-xl border border-tk-slate/15 bg-white p-3 shadow-sm active:cursor-grabbing",
        dragging && "opacity-35"
      )}
      style={{ borderLeftWidth: 3, borderLeftColor: edge }}
    >
      {children}
    </li>
  )
}
