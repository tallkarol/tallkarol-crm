import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { chatMessages, chatThreads } from "@/db/schema"
import { asc } from "drizzle-orm"
import { modelFor, type ModelKey } from "@/lib/chat/models"
import { parseCommand } from "@/lib/chat/skills"
import { solveBranch, taskBrief } from "@/lib/chat/task-brief"
import { loadTaskBrief } from "@/lib/chat/task-thread"
import { claimTurn, markRunning } from "@/lib/chat/turns"
import { toolSchemas } from "@/lib/chat/tools"
import {
  authenticateTimeRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/** What a task turn carries: the task as it is now, and what the worker maps to a repo. */
type TaskContext = {
  id: string
  title: string
  url: string
  brief: string
  branch: string
  client: { slug: string; name: string } | null
  project: { slug: string; name: string } | null
  product: { slug: string; name: string } | null
}

/**
 * The worker's door.
 *
 * POST claims the oldest queued turn and hands back everything needed to run
 * it: the thread so far, the tool list, and the model the CRM already chose.
 * The worker does not get to pick the model — routing, the ladder and the
 * budget gate all live on this side, where they can be audited.
 *
 * Auth is a device token, same as every other machine caller.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)
  const worker = readString(body, "worker") ?? "unknown"

  const turn = await claimTurn(worker)
  if (!turn) return NextResponse.json({ turn: null }, { status: 200 })

  const history = await db.query.chatMessages.findMany({
    where: eq(chatMessages.threadId, turn.threadId),
    orderBy: [asc(chatMessages.createdAt)],
    limit: 60,
  })

  await markRunning(turn.id)

  const spec = modelFor(turn.model as ModelKey)

  /**
   * A skill turn carries the command it was queued for, parsed here from the
   * message the turn answers, so the worker and the CRM agree on which
   * command file to open. Parsed on this side on purpose: the worker never
   * decides what it is allowed to run.
   */
  const asked = history.find((m) => m.id === turn.messageId)
  const command =
    turn.jobType === "skill" && asked ? parseCommand(asked.body) : null

  /**
   * A task turn carries the task as it is NOW — title, notes, checklist,
   * where it belongs — re-read on every claim rather than trusted to the
   * thread's first message, so a checklist ticked since still reaches the
   * worker. The client slug is what the worker maps to a repo; the branch
   * is named here so the card and `git branch` agree. Null means the task
   * was deleted under the thread, and the worker says so instead of guessing.
   */
  let task: TaskContext | null = null
  if (turn.jobType === "task") {
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, turn.threadId),
      columns: { taskId: true },
    })
    const loaded = thread?.taskId ? await loadTaskBrief(thread.taskId) : null
    task = loaded
      ? {
          id: loaded.id,
          title: loaded.title,
          url: loaded.url,
          brief: taskBrief(loaded),
          branch: solveBranch(loaded.id),
          client: loaded.client,
          project: loaded.project,
          product: loaded.product,
        }
      : null
  }

  return NextResponse.json({
    command,
    task,
    turn: {
      id: turn.id,
      threadId: turn.threadId,
      jobType: turn.jobType,
      rung: turn.rung,
      detector: turn.detector,
      escalatedFrom: turn.escalatedFrom,
      model: spec?.id ?? turn.model,
      modelKey: turn.model,
      effort: turn.effort,
      pool: turn.pool,
    },
    messages: history.map((m) => ({
      role: m.role,
      agent: m.agent,
      body: m.body,
      at: m.createdAt.toISOString(),
    })),
    tools: toolSchemas(),
  })
}
