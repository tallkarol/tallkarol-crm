import { and, desc, eq, isNull } from "drizzle-orm"
import { db } from "@/db"
import { chatMessages, chatThreads, chatTurns, tasks } from "@/db/schema"
import type { ChatTurnStatus } from "@/db/schema"
import { taskBrief, type TaskBriefInput } from "@/lib/chat/task-brief"
import { send } from "@/lib/chat/turns"
import { ROUTES } from "@/lib/nav"
import { punchlistForTask } from "@/lib/punchlists"
import { taskChecklist } from "@/lib/tasks"

/**
 * A task taken into chat.
 *
 * Its own file so `turns.ts` stays free of the task and punch-list modules:
 * this side loads the task, the funnel in `turns.ts` does the queueing. The
 * thread remembers the task (`chat_threads.task_id`) and `send()` reads that
 * to keep every later message on the `task` ladder — see "Task threads" in
 * CHAT.md.
 */

export type LoadedTask = TaskBriefInput & { clientId: string | null }

export async function loadTaskBrief(taskId: string): Promise<LoadedTask | null> {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    with: { client: true, project: true, product: true, retainer: true, deliverable: true },
  })
  if (!task) return null

  const [items, onList] = await Promise.all([
    taskChecklist(task.id),
    task.source === "punchlist" ? punchlistForTask(task.id) : Promise.resolve(null),
  ])

  return {
    id: task.id,
    clientId: task.clientId,
    title: task.title,
    notes: task.notes,
    labels: task.labels,
    dueOn: task.dueOn,
    priority: task.priority,
    boardStage: task.boardStage,
    status: task.status,
    cadence: task.cadence,
    source: task.source,
    client: task.client ? { slug: task.client.slug, name: task.client.name } : null,
    project: task.project ? { slug: task.project.slug, name: task.project.name } : null,
    product: task.product ? { slug: task.product.slug, name: task.product.name } : null,
    retainer: task.retainer ? { name: task.retainer.name } : null,
    deliverable: task.deliverable
      ? { label: task.deliverable.label, title: task.deliverable.title ?? "" }
      : null,
    checklist: items.map((i) => ({ title: i.title, done: i.done })),
    punchlist: onList
      ? {
          listTitle: onList.punchlist.title,
          reported: onList.item.reported,
          outcome: onList.item.outcome,
        }
      : null,
    url: ROUTES.task(task.id),
  }
}

/**
 * Open the thread for a task, or return the one already open. One live
 * thread per task: a second click lands in the same conversation instead of
 * starting a twin, the way a second "Request test" returns the run already
 * queued. An archived thread does not count — archiving is "start over".
 */
export async function startTaskThread(
  userId: string,
  taskId: string
): Promise<{ threadId: string; created: boolean }> {
  const existing = await db.query.chatThreads.findFirst({
    where: and(
      eq(chatThreads.taskId, taskId),
      eq(chatThreads.userId, userId),
      isNull(chatThreads.archivedAt)
    ),
    orderBy: [desc(chatThreads.lastMessageAt)],
    columns: { id: true },
  })
  if (existing) return { threadId: existing.id, created: false }

  const brief = await loadTaskBrief(taskId)
  if (!brief) throw new Error("That task does not exist.")

  const [thread] = await db
    .insert(chatThreads)
    .values({ userId, title: "", taskId, clientId: brief.clientId })
    .returning({ id: chatThreads.id })

  await send({ userId, threadId: thread.id, text: taskBrief(brief) })
  return { threadId: thread.id, created: true }
}

export type TaskThreadState = {
  threadId: string
  archived: boolean
  /** An assistant has answered at least once. */
  replied: boolean
  /** The newest turn, whatever state it is in. */
  latest: { status: ChatTurnStatus; error: string } | null
  lastMessageAt: Date
}

/** What the task card shows: the live thread if there is one, else the newest. */
export async function threadForTask(taskId: string): Promise<TaskThreadState | null> {
  const threads = await db.query.chatThreads.findMany({
    where: eq(chatThreads.taskId, taskId),
    orderBy: [desc(chatThreads.lastMessageAt)],
    columns: { id: true, archivedAt: true, lastMessageAt: true },
  })
  const thread = threads.find((t) => t.archivedAt === null) ?? threads[0]
  if (!thread) return null

  const [latest, reply] = await Promise.all([
    db.query.chatTurns.findFirst({
      where: eq(chatTurns.threadId, thread.id),
      orderBy: [desc(chatTurns.createdAt)],
      columns: { status: true, error: true },
    }),
    db.query.chatMessages.findFirst({
      where: and(eq(chatMessages.threadId, thread.id), eq(chatMessages.role, "assistant")),
      columns: { id: true },
    }),
  ])

  return {
    threadId: thread.id,
    archived: thread.archivedAt !== null,
    replied: Boolean(reply),
    latest: latest ? { status: latest.status, error: latest.error } : null,
    lastMessageAt: thread.lastMessageAt,
  }
}
