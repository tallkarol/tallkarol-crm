"use client"

import { useMemo, useState, useTransition } from "react"
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
import {
  addWorkstream,
  setLeadStage,
  setLeadValue,
  setWorkstreamStage,
} from "@/app/(admin)/pipeline/actions"
import { clientColor } from "@/lib/client-colors"
import { cn } from "@/lib/cn"
import { SALES_STAGES, WORKSTREAM_STAGES, ordinal, type SalesStageId } from "@/lib/pipeline"
import { formatMoney } from "@/lib/work"

/* ---------- shared bits ---------- */

function ageLabel(iso: string | null) {
  if (!iso) return null
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
  if (days === 0) return "today"
  if (days < 60) return `${days}d`
  return new Date(iso).toLocaleDateString("en-US", { month: "short" })
}

function Column({
  id,
  header,
  sub,
  children,
  minH = "min-h-[300px]",
}: {
  id: string
  header: React.ReactNode
  sub?: React.ReactNode
  children: React.ReactNode
  minH?: string
}) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-2xl border bg-[#FAF6EE] transition-colors",
        minH,
        isOver ? "border-tk-teal bg-tk-teal/5" : "border-tk-slate/15"
      )}
    >
      <div className="px-3.5 pb-1 pt-3">
        <h3 className="flex items-baseline justify-between text-[13px] font-semibold text-tk-onyx">
          {header}
        </h3>
        {sub ? <p className="mt-0.5 text-[11.5px] text-tk-slate/60 tabular-nums">{sub}</p> : null}
      </div>
      <ul className="flex flex-1 flex-col gap-2 px-2.5 pb-3 pt-1.5">{children}</ul>
    </div>
  )
}

function DraggableCard({
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

function CardShell({ edge, children }: { edge: string; children: React.ReactNode }) {
  return (
    <div
      className="w-56 rotate-2 rounded-xl border border-tk-slate/15 bg-white p-3 shadow-xl"
      style={{ borderLeftWidth: 3, borderLeftColor: edge }}
    >
      {children}
    </div>
  )
}

/* ---------- sales board ---------- */

export type BoardLead = {
  id: string
  name: string
  company: string | null
  projectTypes: string[]
  stage: SalesStageId
  valueCents: number | null
  ageIso: string | null
}

function LeadCardBody({ lead }: { lead: BoardLead }) {
  return (
    <>
      <p className="text-[13px] font-semibold text-tk-onyx">{lead.name}</p>
      {lead.company ? <p className="text-xs text-tk-slate/60">{lead.company}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lead.valueCents != null ? (
          <span className="text-xs font-semibold tabular-nums text-tk-onyx">
            {formatMoney(lead.valueCents)}
          </span>
        ) : null}
        {lead.projectTypes.slice(0, 2).map((t) => (
          <span key={t} className="rounded-full bg-tk-linen px-2 py-0.5 text-[11px] text-tk-slate">
            {t}
          </span>
        ))}
        <span className="ml-auto text-[11px] text-tk-slate/60">{ageLabel(lead.ageIso)}</span>
      </div>
    </>
  )
}

export function SalesBoard({ leads: initial }: { leads: BoardLead[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [leads, setLeads] = useState(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const active = leads.find((l) => l.id === activeId) ?? null

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const stage = e.over?.id as SalesStageId | undefined
    const lead = leads.find((l) => l.id === e.active.id)
    if (!stage || !lead || !SALES_STAGES.some((s) => s.id === stage) || lead.stage === stage) return
    setLeads((rows) =>
      rows.map((r) =>
        r.id === lead.id ? { ...r, stage, ageIso: new Date().toISOString() } : r
      )
    )
    void setLeadStage(lead.id, stage).then(() => startTransition(() => router.refresh()))
  }

  function saveValue(lead: BoardLead, raw: string) {
    const n = Number(raw.replace(/[$,]/g, "").trim())
    const cents = raw.trim() === "" ? null : Number.isFinite(n) && n > 0 ? Math.round(n * 100) : undefined
    if (cents === undefined || cents === lead.valueCents) return
    setLeads((rows) => rows.map((r) => (r.id === lead.id ? { ...r, valueCents: cents } : r)))
    void setLeadValue(lead.id, cents).then(() => startTransition(() => router.refresh()))
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="mt-6 grid gap-3 overflow-x-auto pb-2 [grid-template-columns:repeat(5,minmax(200px,1fr))] max-lg:[grid-template-columns:repeat(5,230px)]">
        {SALES_STAGES.map((stage) => {
          const inStage = leads.filter((l) => l.stage === stage.id)
          const weighted = inStage.reduce(
            (s, l) => s + ((l.valueCents ?? 0) * stage.prob) / 100,
            0
          )
          return (
            <Column
              key={stage.id}
              id={stage.id}
              header={
                <>
                  {stage.label}
                  <em className="not-italic text-xs font-medium text-tk-slate/60">
                    {inStage.length || ""}
                  </em>
                </>
              }
              sub={
                stage.prob === 100
                  ? `${formatMoney(weighted)} won`
                  : `${formatMoney(Math.round(weighted))} weighted · ${stage.prob}%`
              }
            >
              {inStage.map((lead) => (
                <DraggableCard key={lead.id} id={lead.id} edge="#006965" dragging={lead.id === activeId}>
                  <LeadCardBody lead={lead} />
                  <input
                    defaultValue={lead.valueCents != null ? String(lead.valueCents / 100) : ""}
                    placeholder="$ value"
                    inputMode="decimal"
                    aria-label={`Estimated value for ${lead.name}`}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                    }}
                    onBlur={(e) => saveValue(lead, e.target.value)}
                    className="mt-2 w-full rounded-md border border-tk-slate/15 bg-tk-linen/60 px-2 py-1 text-xs tabular-nums outline-none focus:border-tk-teal"
                  />
                </DraggableCard>
              ))}
            </Column>
          )
        })}
      </div>
      <DragOverlay>
        {active ? (
          <CardShell edge="#006965">
            <LeadCardBody lead={active} />
          </CardShell>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

/* ---------- delivery boards ---------- */

export type LaneStream = {
  id: string
  title: string
  stage: string
  pass: number
}

export type DeliveryLaneData = {
  projectId: string
  projectName: string
  projectSlug: string
  clientSlug: string
  meta: string
  streams: LaneStream[]
}

export function DeliveryLane({ lane }: { lane: DeliveryLaneData }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [streams, setStreams] = useState(lane.streams)
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const color = clientColor(lane.clientSlug)
  const active = streams.find((s) => s.id === activeId) ?? null

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const stage = e.over?.id as string | undefined
    const stream = streams.find((s) => s.id === e.active.id)
    if (!stage || !stream || !WORKSTREAM_STAGES.some((s) => s.id === stage) || stream.stage === stage)
      return
    const bump = stream.stage === "feedback" && stage === "review"
    setStreams((rows) =>
      rows.map((r) =>
        r.id === stream.id ? { ...r, stage, pass: bump ? r.pass + 1 : r.pass } : r
      )
    )
    void setWorkstreamStage(stream.id, stage).then(() => startTransition(() => router.refresh()))
  }

  return (
    <section className="mt-3 rounded-2xl border border-tk-slate/15 bg-white/50 p-3.5">
      <div className="flex flex-wrap items-center gap-2.5 px-1 pb-1">
        <span className="size-2 rounded-full" style={{ background: color }} />
        <h3 className="text-sm font-semibold text-tk-onyx">{lane.projectName}</h3>
        <span className="text-xs text-tk-slate/60">{lane.meta}</span>
        <form
          action={addWorkstream}
          className="ml-auto flex items-center gap-1.5"
        >
          <input type="hidden" name="projectId" value={lane.projectId} />
          <input
            name="title"
            placeholder="Add workstream…"
            className="w-36 rounded-md border border-tk-slate/15 bg-white px-2 py-1 text-xs outline-none focus:border-tk-teal"
          />
          <button
            type="submit"
            className="rounded-full border border-tk-slate/20 px-2.5 py-1 text-[11px] font-semibold text-tk-slate hover:border-tk-teal hover:text-tk-teal"
          >
            Add
          </button>
        </form>
      </div>
      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="mt-2 grid gap-2.5 overflow-x-auto pb-1 [grid-template-columns:repeat(5,minmax(170px,1fr))] max-lg:[grid-template-columns:repeat(5,200px)]">
          {WORKSTREAM_STAGES.map((stage) => {
            const inStage = streams.filter((s) => s.stage === stage.id)
            return (
              <Column
                key={stage.id}
                id={stage.id}
                minH="min-h-[140px]"
                header={
                  <>
                    {stage.label}
                    <em className="not-italic text-xs font-medium text-tk-slate/60">
                      {inStage.length || ""}
                    </em>
                  </>
                }
              >
                {inStage.map((s) => (
                  <DraggableCard key={s.id} id={s.id} edge={color} dragging={s.id === activeId}>
                    <p className="text-[13px] font-semibold text-tk-onyx">{s.title}</p>
                    <span className="mt-1.5 inline-flex rounded-full bg-tk-teal/10 px-2 py-0.5 text-[11px] font-semibold text-tk-teal">
                      {ordinal(s.pass)} pass
                    </span>
                  </DraggableCard>
                ))}
              </Column>
            )
          })}
        </div>
        <DragOverlay>
          {active ? (
            <CardShell edge={color}>
              <p className="text-[13px] font-semibold text-tk-onyx">{active.title}</p>
              <span className="mt-1.5 inline-flex rounded-full bg-tk-teal/10 px-2 py-0.5 text-[11px] font-semibold text-tk-teal">
                {ordinal(active.pass)} pass
              </span>
            </CardShell>
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  )
}
