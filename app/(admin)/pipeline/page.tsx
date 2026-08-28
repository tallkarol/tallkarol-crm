import { asc, desc } from "drizzle-orm"
import { PageHeader } from "@/components/PageHeader"
import {
  DeliveryLane,
  SalesBoard,
  type BoardLead,
  type DeliveryLaneData,
} from "@/components/pipeline/Boards"
import { db } from "@/db"
import { inquiries } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { readPipeline } from "@/lib/pipeline"
import { plural } from "@/lib/work"

export const metadata = { title: "Pipeline" }
export const dynamic = "force-dynamic"

export default async function PipelinePage() {
  const [rows, projects] = await Promise.all([
    db.select().from(inquiries).orderBy(desc(inquiries.createdAt)),
    db.query.projects.findMany({
      with: { client: true, workstreams: { orderBy: (w) => [asc(w.sort), asc(w.createdAt)] } },
    }),
  ])

  const leads: BoardLead[] = rows.map((row) => {
    const p = readPipeline(row)
    return {
      id: row.id,
      name: row.name,
      company: row.company,
      projectTypes: row.projectTypes,
      stage: p.stage,
      valueCents: p.valueCents,
      ageIso: p.stageChangedAt ?? row.createdAt.toISOString(),
    }
  })

  const lanes: DeliveryLaneData[] = projects
    .filter((p) => p.status === "in_progress")
    .map((p) => ({
      projectId: p.id,
      projectName: p.name,
      projectSlug: p.slug,
      clientSlug: p.client.slug,
      meta: [plural(p.workstreams.length, "workstream"), p.notes].filter(Boolean).join(" · "),
      streams: p.workstreams.map((w) => ({
        id: w.id,
        title: w.title,
        stage: w.stage,
        pass: w.pass,
      })),
    }))

  const waiting = projects.filter((p) => p.status === "waiting_on_content")

  return (
    <>
      <PageHeader title="Pipeline" />

      <SalesBoard leads={leads} />

      <div className="mt-10">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="text-[17px] font-bold tracking-tight text-tk-onyx">Delivery</h2>
          <span className="text-xs text-tk-slate/60">
            one board per project in progress — generated, not curated
          </span>
        </div>
        {lanes.length === 0 ? (
          <p className="mt-3 text-sm text-tk-slate/70">No projects in progress.</p>
        ) : (
          lanes.map((lane) => <DeliveryLane key={lane.projectId} lane={lane} />)
        )}
        {waiting.map((p) => (
          <div
            key={p.id}
            className="mt-3 flex flex-wrap items-center gap-2.5 rounded-2xl border border-dashed border-tk-slate/20 px-4 py-3 text-sm text-tk-slate/60"
          >
            <span className="size-2 rounded-full" style={{ background: clientColor(p.client.slug) }} />
            <b className="font-semibold text-tk-slate">{p.name}</b>
            waiting on content — its board appears here when the project flips to in progress
          </div>
        ))}
      </div>
    </>
  )
}
