import Link from "next/link"
import { asc, eq } from "drizzle-orm"
import { EntityLink, Fact, Facts, PeekSection } from "@/components/peek/bits"
import {
  DueDateControl,
  NotesControl,
  PickButtons,
  PrimaryAction,
} from "@/components/peek/controls"
import { TaskChecklist } from "@/components/tasks/TaskChecklist"
import { TaskTargetPicker } from "@/components/tasks/TaskTargetPicker"
import { db } from "@/db"
import { clients, deliverables, projects, tasks } from "@/db/schema"
import { clientColor } from "@/lib/client-colors"
import { ROUTES } from "@/lib/nav"
import { completionHistory, taskChecklist } from "@/lib/tasks"
import {
  setTaskCadenceAction,
  setTaskDueAction,
  setTaskNotesAction,
  setTaskPriorityAction,
  setTaskSnoozeAction,
  setTaskStageAction,
  setTaskStatusAction,
} from "@/lib/task-peek-actions"
import { PRIORITY_LABEL } from "@/lib/task-view"
import { formatDay } from "@/lib/work"

function dueLabel(dueOn: string | null) {
  if (!dueOn) return null
  const [y, m, d] = dueOn.split("-").map(Number)
  const due = Date.UTC(y, m - 1, d)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((due - today) / 86_400_000)
  if (diff < 0) {
    return { text: `overdue by ${-diff} ${diff === -1 ? "day" : "days"}`, tone: "bad" as const }
  }
  if (diff === 0) return { text: "due today", tone: "warn" as const }
  if (diff === 1) return { text: "due tomorrow", tone: "warn" as const }
  return { text: `due in ${diff} days`, tone: "ok" as const }
}

const SOURCE_NOTE: Record<string, string> = {
  manual: "Added by hand",
  renewal: "Auto-created from a retainer window",
  api: "Captured from a device",
  ticket: "Made from a support ticket",
  meeting: "Made from a meeting",
}

export async function TaskDetailBody({ id }: { id: string }) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, id),
    with: { client: true, retainer: true, project: true, deliverable: true },
  })
  if (!task) return null

  const [clientRows, projectRows, deliverableRows, items, history] =
    await Promise.all([
      db.query.clients.findMany({ orderBy: [asc(clients.name)] }),
      db
        .select({ id: projects.id, name: projects.name, clientId: projects.clientId })
        .from(projects)
        .orderBy(asc(projects.name)),
      db
        .select({
          id: deliverables.id,
          label: deliverables.label,
          title: deliverables.title,
          projectId: deliverables.projectId,
        })
        .from(deliverables)
        .orderBy(asc(deliverables.sort)),
      taskChecklist(task.id),
      task.cadence !== "none" ? completionHistory(task.id, 8) : Promise.resolve([]),
    ])

  const due = dueLabel(task.dueOn)
  const done = task.status === "done"
  const snoozed =
    task.snoozedUntil && task.snoozedUntil > new Date().toISOString().slice(0, 10)

  return (
    <>
      <div className="px-6 pb-5 pt-4">
        <h2 className="text-lg font-semibold leading-snug text-tk-onyx">
          {task.title}
        </h2>
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
          {due && !done ? (
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
          {snoozed ? (
            <span className="font-medium text-tk-slate/55">
              hidden until {formatDay(task.snoozedUntil!)}
            </span>
          ) : null}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PrimaryAction
            label={done ? "Reopen" : "Mark done"}
            doneLabel={done ? "Reopened" : "Done ✓"}
            action={setTaskStatusAction.bind(null, task.id, !done)}
          />
          {done ? <p className="text-xs font-semibold text-tk-teal">Done ✓</p> : null}
        </div>
      </div>

      <PeekSection title="Where it belongs">
        <TaskTargetPicker
          taskId={task.id}
          clientId={task.clientId}
          projectId={task.projectId}
          deliverableId={task.deliverableId}
          clients={clientRows.map((c) => ({ id: c.id, name: c.name, slug: c.slug }))}
          projects={projectRows}
          deliverables={deliverableRows}
        />
        {task.retainer ? (
          <p className="mt-2 text-[11px] text-tk-slate/55">
            Billing to{" "}
            <Link
              href={ROUTES.retainer(task.retainer.slug)}
              className="font-semibold text-tk-teal hover:underline"
            >
              {task.retainer.name}
            </Link>
          </p>
        ) : null}
      </PeekSection>

      {!done ? (
        <PeekSection title="Stage">
          <PickButtons
            size="sm"
            current={task.boardStage}
            action={setTaskStageAction.bind(null, task.id)}
            options={[
              { value: "queue", label: "Queue", tone: "neutral" },
              { value: "doing", label: "In progress", tone: "teal" },
              { value: "waiting", label: "Waiting", tone: "neutral" },
            ]}
          />
        </PeekSection>
      ) : null}

      <PeekSection title="Priority">
        <PickButtons
          size="sm"
          current={String(task.priority)}
          action={setTaskPriorityAction.bind(null, task.id)}
          options={[
            { value: "1", label: PRIORITY_LABEL[1], tone: "teal" },
            { value: "2", label: PRIORITY_LABEL[2], tone: "neutral" },
            { value: "3", label: PRIORITY_LABEL[3], tone: "neutral" },
          ]}
        />
      </PeekSection>

      <PeekSection title="Due">
        <DueDateControl
          value={task.dueOn}
          action={setTaskDueAction.bind(null, task.id)}
        />
      </PeekSection>

      <PeekSection title="Snooze">
        <DueDateControl
          value={task.snoozedUntil}
          action={setTaskSnoozeAction.bind(null, task.id)}
        />
        <p className="mt-2 text-[11px] text-tk-slate/55">
          Hides it from the list until that day without touching the due date —
          a faked deadline is how &ldquo;overdue&rdquo; stops meaning anything.
        </p>
      </PeekSection>

      <PeekSection title="Repeats">
        <PickButtons
          size="sm"
          current={task.cadence}
          action={setTaskCadenceAction.bind(null, task.id)}
          options={[
            { value: "none", label: "Once", tone: "neutral" },
            { value: "weekly", label: "Weekly", tone: "neutral" },
            { value: "monthly", label: "Monthly", tone: "neutral" },
            { value: "quarterly", label: "Quarterly", tone: "neutral" },
          ]}
        />
        {task.cadence !== "none" ? (
          <>
            <p className="mt-2 text-[11px] text-tk-slate/55">
              Reopens itself once the {task.cadence === "weekly" ? "week" : task.cadence === "monthly" ? "month" : "quarter"}{" "}
              it was completed in has passed.
            </p>
            {history.length > 0 ? (
              <div className="mt-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-tk-slate/50">
                  Filed
                </p>
                <ul className="mt-1 flex flex-wrap gap-1">
                  {history.map((row) => (
                    <li
                      key={row.id}
                      title={`Completed ${formatDay(row.completedOn)}`}
                      className="rounded bg-tk-teal/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-tk-teal"
                    >
                      {row.period}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-tk-slate/45">
                No periods filed yet.
              </p>
            )}
          </>
        ) : null}
      </PeekSection>

      <PeekSection title="Checklist">
        <TaskChecklist
          taskId={task.id}
          items={items.map((i) => ({ id: i.id, title: i.title, done: i.done }))}
        />
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
          <Fact label="Created">
            {formatDay(task.createdAt.toISOString().slice(0, 10))}
          </Fact>
          {task.completedAt ? (
            <Fact label="Completed">
              {formatDay(task.completedAt.toISOString().slice(0, 10))}
            </Fact>
          ) : (
            <Fact label="Last touched">
              {formatDay(task.updatedAt.toISOString().slice(0, 10))}
            </Fact>
          )}
          <Fact label="Origin">{SOURCE_NOTE[task.source] ?? task.source}</Fact>
          {task.project ? (
            <Fact label="Project">
              <EntityLink href={ROUTES.project(task.project.slug)}>
                {task.project.name}
              </EntityLink>
            </Fact>
          ) : null}
          {task.deliverable ? (
            <Fact label="Deliverable">
              {task.deliverable.title
                ? `${task.deliverable.label} · ${task.deliverable.title}`
                : task.deliverable.label}
            </Fact>
          ) : null}
        </Facts>
      </PeekSection>
    </>
  )
}
