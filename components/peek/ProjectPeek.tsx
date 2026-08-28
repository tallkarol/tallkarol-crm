import { eq } from "drizzle-orm"
import { db } from "@/db"
import { projects } from "@/db/schema"
import { EntityLink, GonePeek, PeekSection } from "@/components/peek/bits"
import { NotesControl, PickButtons, PrimaryAction } from "@/components/peek/controls"
import { clientColor } from "@/lib/client-colors"
import { ROUTES } from "@/lib/nav"
import {
  setDeliverableStatusAction,
  setProjectFeeStatusAction,
  setProjectNotesAction,
  setProjectStatusAction,
} from "@/lib/peek-actions"

export async function ProjectPeek({ slug }: { slug: string }) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.slug, slug),
    with: { client: true, deliverables: true, retainer: true },
  })
  if (!project) return <GonePeek />

  const rows = [...project.deliverables].sort((a, b) => a.sort - b.sort)
  const blocked = project.status === "waiting_on_content"

  return (
    <>
      <div className="px-6 pb-5 pt-4">
        <h2 className="text-lg font-semibold leading-snug text-tk-onyx">{project.name}</h2>
        <p className="mt-1.5 text-sm text-tk-slate/70">
          <EntityLink
            href={ROUTES.client(project.client.slug)}
            color={clientColor(project.client.slug)}
          >
            {project.client.name}
          </EntityLink>
          {project.retainer ? (
            <>
              {" · "}
              <EntityLink href={ROUTES.retainer(project.retainer.slug)}>
                {project.retainer.name}
              </EntityLink>
            </>
          ) : null}
        </p>

        {blocked ? (
          <div className="mt-4 rounded-xl border border-amber-700/20 bg-amber-700/[.06] px-4 py-3">
            <p className="text-xs font-bold text-amber-800">Blocked — waiting on content</p>
            <p className="mt-0.5 text-xs text-amber-900/70">
              The moment the client delivers, one click below puts it back in motion.
            </p>
            <div className="mt-2.5">
              <PrimaryAction
                label="Unblock — back in progress"
                doneLabel="In progress ✓"
                action={setProjectStatusAction.bind(null, project.id, "in_progress")}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-4 grid gap-3">
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/55">
              Status
            </p>
            <div className="mt-1.5">
              <PickButtons
                current={project.status}
                action={setProjectStatusAction.bind(null, project.id) as (v: string) => Promise<{ ok: boolean; error?: string }>}
                options={[
                  { value: "waiting_on_content", label: "Waiting", tone: "neutral" },
                  { value: "in_progress", label: "In progress" },
                  { value: "complete", label: "Complete" },
                ]}
              />
            </div>
          </div>
          <div>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-tk-slate/55">
              Fee
            </p>
            <div className="mt-1.5">
              <PickButtons
                current={project.feeStatus}
                action={setProjectFeeStatusAction.bind(null, project.id) as (v: string) => Promise<{ ok: boolean; error?: string }>}
                options={[
                  { value: "agreed", label: "Agreed", tone: "neutral" },
                  { value: "deposit_paid", label: "Deposit paid" },
                  { value: "paid", label: "Paid" },
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {rows.length > 0 ? (
        <PeekSection title="Deliverables — advance any of them right here">
          <ul className="space-y-2.5">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-tk-onyx">
                  {row.title || row.label}
                </span>
                <PickButtons
                  size="sm"
                  current={row.status}
                  action={setDeliverableStatusAction.bind(null, row.id) as (v: string) => Promise<{ ok: boolean; error?: string }>}
                  options={[
                    { value: "pending", label: "Pending", tone: "neutral" },
                    { value: "done", label: "Done" },
                    { value: "invoiced", label: "Invoiced" },
                    { value: "paid", label: "Paid" },
                  ]}
                />
              </li>
            ))}
          </ul>
        </PeekSection>
      ) : null}

      <PeekSection title="Notes">
        <NotesControl
          value={project.notes}
          action={setProjectNotesAction.bind(null, project.id)}
          placeholder="What's blocking, what was agreed, what's next…"
        />
      </PeekSection>
    </>
  )
}
