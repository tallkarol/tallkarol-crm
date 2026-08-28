import { eq } from "drizzle-orm"
import { db } from "@/db"
import { tasks } from "@/db/schema"
import { EntityLink, Fact, Facts, GonePeek, PeekSection } from "@/components/peek/bits"
import {
  DueDateControl,
  NotesControl,
  PickButtons,
  PrimaryAction,
} from "@/components/peek/controls"
import { clientColor } from "@/lib/client-colors"
import { ROUTES } from "@/lib/nav"
import {
  setTaskCadenceAction,
  setTaskDueAction,
  setTaskNotesAction,
  setTaskStatusAction,
} from "@/lib/peek-actions"
import { formatDay } from "@/lib/work"

function dueLabel(dueOn: string | null) {
  if (!dueOn) return null
  const [y, m, d] = dueOn.split("-").map(Number)
  const due = Date.UTC(y, m - 1, d)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((due - today) / 86_400_000)
  if (diff < 0) return { text: `overdue by ${-diff} ${diff === -1 ? "day" : "days"}`, tone: "bad" as const }
  if (diff === 0) return { text: "due today", tone: "warn" as const }
  if (diff === 1) return { text: "due tomorrow", tone: "warn" as const }
  return { text: `due in ${diff} days`, tone: "ok" as const }
}

export async function TaskPeek({ id }: { id: string }) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: { client: true, retainer: true, project: true },
  })
  if (!task) return <GonePeek />

  const due = dueLabel(task.dueOn)
  const done = task.status === "done"

  return (
    <>
      <div className="px-6 pb-5 pt-4">
        <h2 className="text-lg font-semibold leading-snug text-tk-onyx">{task.title}</h2>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-tk-slate/70">
          {task.client ? (
            <EntityLink
              href={ROUTES.client(task.client.slug)}
              color={clientColor(task.client.slug)}
            >
              {task.client.name}
            </EntityLink>
          ) : (
            <span className="text-tk-slate/55">No client</span>
          )}
          {due ? (
            <span
              className={
                due.tone === "bad"
                  ? "font-bold text-[#A62228]"
                  : due.tone === "warn"
                    ? "font-bold text-amber-800"
                    : "font-medium text-tk-slate/60"
              }
            >
              {due.text}
            </span>
          ) : null}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {!done ? (
            <PrimaryAction
              label="Mark done"
              doneLabel="Done ✓"
              action={setTaskStatusAction.bind(null, task.id, true)}
            />
          ) : (
            <PrimaryAction
              label="Reopen"
              doneLabel="Reopened"
              action={setTaskStatusAction.bind(null, task.id, false)}
            />
          )}
          {done ? (
            <p className="text-xs font-semibold text-tk-teal">Done ✓</p>
          ) : null}
        </div>
      </div>

      <PeekSection title="Due">
        <DueDateControl value={task.dueOn} action={setTaskDueAction.bind(null, task.id)} />
      </PeekSection>

      <PeekSection title="Repeats">
        <PickButtons
          size="sm"
          current={task.cadence}
          action={setTaskCadenceAction.bind(null, task.id) as (v: string) => Promise<{ ok: boolean; error?: string }>}
          options={[
            { value: "none", label: "Once", tone: "neutral" },
            { value: "weekly", label: "Weekly", tone: "neutral" },
            { value: "monthly", label: "Monthly", tone: "neutral" },
          ]}
        />
        {task.cadence !== "none" ? (
          <p className="mt-2 text-[11px] text-tk-slate/55">
            Recurring tasks re-open themselves each {task.cadence === "weekly" ? "week" : "month"} after
            being marked done.
          </p>
        ) : null}
      </PeekSection>

      <PeekSection title="Notes">
        <NotesControl
          value={task.notes}
          action={setTaskNotesAction.bind(null, task.id)}
          placeholder="What does finished look like?"
        />
      </PeekSection>

      <PeekSection title="Trail">
        <Facts>
          <Fact label="Created">{formatDay(task.createdAt.toISOString().slice(0, 10))}</Fact>
          <Fact label="Last touched">{formatDay(task.updatedAt.toISOString().slice(0, 10))}</Fact>
          {task.retainer ? (
            <Fact label="Retainer">
              <EntityLink href={ROUTES.retainer(task.retainer.slug)}>
                {task.retainer.name}
              </EntityLink>
            </Fact>
          ) : null}
          {task.project ? (
            <Fact label="Project">
              <EntityLink href={ROUTES.project(task.project.slug)}>
                {task.project.name}
              </EntityLink>
            </Fact>
          ) : null}
        </Facts>
      </PeekSection>
    </>
  )
}
