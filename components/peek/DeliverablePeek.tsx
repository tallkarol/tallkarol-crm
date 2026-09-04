import { eq } from "drizzle-orm"
import { db } from "@/db"
import { deliverables } from "@/db/schema"
import { Badge } from "@/components/work/Badge"
import { EntityLink, GonePeek, PeekSection } from "@/components/peek/bits"
import { PickButtons } from "@/components/peek/controls"
import { clientColor } from "@/lib/client-colors"
import { ROUTES } from "@/lib/nav"
import { setDeliverableStatusAction } from "@/lib/peek-actions"
import { DELIVERABLE_STATUS_LABEL, PROJECT_STATUS_LABEL } from "@/lib/work"

export async function DeliverablePeek({ id }: { id: string }) {
  const deliverable = await db.query.deliverables.findFirst({
    where: eq(deliverables.id, id),
    with: {
      project: {
        with: { client: true, deliverables: true },
      },
    },
  })
  if (!deliverable) return <GonePeek />

  const project = deliverable.project
  const siblings = [...project.deliverables].sort((a, b) => a.sort - b.sort)
  const doneCount = siblings.filter((d) => d.status !== "pending").length

  return (
    <>
      <div className="px-6 pb-5 pt-4">
        <h2 className="text-lg font-semibold leading-snug text-tk-onyx">
          {deliverable.title || deliverable.label}
        </h2>
        <p className="mt-1.5 text-sm text-ink-3">
          <EntityLink
            href={ROUTES.project(project.slug)}
            color={clientColor(project.client.slug)}
          >
            {project.name}
          </EntityLink>{" "}
          · {project.client.name} ·{" "}
          <span className="text-ink-3">{PROJECT_STATUS_LABEL[project.status]}</span>
        </p>

        <div className="mt-4">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">
            Where it stands — pending → done → invoiced → paid
          </p>
          <div className="mt-1.5">
            <PickButtons
              current={deliverable.status}
              action={setDeliverableStatusAction.bind(null, deliverable.id) as (v: string) => Promise<{ ok: boolean; error?: string }>}
              options={[
                { value: "pending", label: "Pending", tone: "neutral" },
                { value: "done", label: "Done" },
                { value: "invoiced", label: "Invoiced" },
                { value: "paid", label: "Paid" },
              ]}
            />
          </div>
        </div>
      </div>

      <PeekSection title={`Everything in ${project.name} · ${doneCount}/${siblings.length} moving`}>
        <ul className="space-y-1.5">
          {siblings.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span
                className={
                  row.id === deliverable.id
                    ? "min-w-0 truncate font-semibold text-tk-onyx"
                    : "min-w-0 truncate text-tk-slate"
                }
              >
                {row.title || row.label}
              </span>
              <Badge tone={row.status === "pending" ? "neutral" : row.status === "paid" ? "muted" : "teal"}>
                {DELIVERABLE_STATUS_LABEL[row.status]}
              </Badge>
            </li>
          ))}
        </ul>
      </PeekSection>
    </>
  )
}
