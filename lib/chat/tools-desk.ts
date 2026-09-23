import { eq } from "drizzle-orm"
import { db } from "@/db"
import { chatMessages, chatThreads, clients, tasks } from "@/db/schema"
import { packKindOf } from "@/lib/chat/pack-lines"
import { PERSONAS, personaByName } from "@/lib/chat/personas"
import { parseCommand } from "@/lib/chat/skills"
import { startTaskThread } from "@/lib/chat/task-thread"
import { str, type ToolSpec, type ToolContext } from "@/lib/chat/tool-helpers"
import { send } from "@/lib/chat/turns"
import { insertTaskRow, resolveTaskTarget } from "@/lib/task-insert"

/**
 * The handoff, made real. A thread that says "this is the copywriter's", "this
 * is a CRM change" or "that is a /follow-up" can open the thread that does it:
 * a brief, previewed, and on Confirm a new thread — addressed to a desk,
 * running a command, or solving a task — with the brief as its first
 * message. The card's Confirm opens the new thread. When that thread is
 * done, `hand_back` posts what it did into the thread it came from.
 *
 * Any desk reaches any desk (Karol, 2026-09-23: the chat should be able to do
 * whatever a Claude Code session can, and route work where it belongs). The
 * gate is not the org chart but Karol's Confirm on every card; the org
 * chart's other two meanings — who reads whose memory, and escalation —
 * stand. A conversation travels with a brief; work products never do, and
 * the `me` pack never leaves the coach: the brief on the card is all that
 * crosses.
 */

/** `clients/zemvelo` → `zemvelo` when the receiving desk loads the same kind of pack. */
function carriedSlug(pack: string, kind: string | null): string | null {
  if (!pack || !kind || kind === "me") return null
  if (packKindOf(pack) !== kind) return null
  return pack.split("/")[1] ?? null
}

async function fromThread(ctx: ToolContext) {
  const thread = await db.query.chatThreads.findFirst({
    where: eq(chatThreads.id, ctx.threadId),
    columns: { agent: true, pack: true, fromThreadId: true, taskId: true },
  })
  const from = thread?.agent ?? ""
  const label = from ? PERSONAS[from]?.label ?? from : thread?.taskId ? "Solver" : "Assistant"
  return { thread, from, label }
}

/** Where the handoff goes: a desk or a command, never both. */
function target(args: Record<string, unknown>) {
  const command = str(args, "command")
  const deskName = str(args, "desk")
  if (command && deskName) throw new Error("Pass `desk` or `command`, not both.")
  if (command) {
    const line = command.startsWith("/") ? command : `/${command}`
    const parsed = parseCommand(line)
    if (!parsed) throw new Error(`No command ${line.split(/\s/)[0]} — the Skills tab lists the ones the chat runs.`)
    return { kind: "command" as const, line, name: parsed.name }
  }
  const desk = personaByName(deskName ?? "")
  if (!desk) throw new Error(deskName ? `No desk named "${deskName}".` : "Pass `desk` or `command`.")
  return { kind: "desk" as const, desk }
}

export const routeToTool: ToolSpec = {
  name: "route_to",
  description:
    "Hand this conversation to another desk, or to a slash command, in a new thread. Previewed; on Confirm the new thread opens with the brief as its first message and answers there. Any desk may hand to any desk (pm, coach, dreamer, client-manager, product-owner, developer, designer, marketer, copywriter). For a skill, pass `command` (\"/follow-up zemvelo\", \"/punchlist mineralife --from -\") and the brief rides along as its context. For a code change — to the CRM, a client site, anything in a repo — use solve_task, not this. Brief: what, why, acceptance, deadline, what is out of scope. A client or product slug pins the desk's pack; otherwise this thread's pack carries when the kinds match. The coach's `me` pack never carries: only the brief crosses.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      desk: { type: "string", description: "pm | coach | dreamer | client-manager | product-owner | developer | designer | marketer | copywriter. Omit when passing `command`." },
      command: { type: "string", description: "A slash command line to run in the new thread instead of a desk, e.g. \"/follow-up zemvelo\"." },
      brief: { type: "string", description: "The brief the new thread starts from. What, why, acceptance, deadline, out of scope." },
      slug: { type: "string", description: "Optional: a client or product slug to pin the desk's pack." },
    },
    required: ["brief"],
  },
  async preview(args, ctx) {
    const to = target(args)
    const brief = str(args, "brief")
    if (!brief) throw new Error("A handoff needs a brief.")
    const { thread, label } = await fromThread(ctx)
    if (to.kind === "command") {
      return {
        title: `Run ${to.line.split(/\s/)[0]}`,
        fields: [
          { label: "Run", value: to.line },
          { label: "From", value: label },
          { label: "Brief", value: brief.slice(0, 600) },
        ],
        note: "Opens a new thread that runs the command on the Mac, with the brief as its context.",
      }
    }
    const { desk } = to
    const slug = str(args, "slug") ?? carriedSlug(thread?.pack ?? "", desk.pack)
    return {
      title: `Hand to ${desk.label}`,
      fields: [
        { label: "To", value: `@${desk.name}` },
        { label: "From", value: label },
        { label: "Pack", value: desk.pack === "me" ? "me" : slug ? `${slug} (${desk.pack})` : desk.pack ? "not pinned — the desk will ask" : "—" },
        { label: "Brief", value: brief.slice(0, 600) },
      ],
      note: "Opens a new thread addressed to that desk; the brief is its first message and the desk answers there.",
    }
  },
  async run(args, ctx) {
    const to = target(args)
    const brief = str(args, "brief")
    if (!brief) throw new Error("A handoff needs a brief.")
    const { thread, label } = await fromThread(ctx)
    const handed = `Handed from ${label} (thread ${ctx.threadId.slice(0, 8)}): ${brief}`
    let text: string
    if (to.kind === "command") {
      text = `${to.line}\n\n${handed}`
    } else {
      const slug = str(args, "slug") ?? carriedSlug(thread?.pack ?? "", to.desk.pack)
      text = `@${to.desk.name}${slug ? ` ${slug}` : ""} ${handed}`
    }
    const result = await send({ userId: ctx.userId, text, as: label, fromThreadId: ctx.threadId })
    return {
      threadId: result.threadId,
      url: `/chat?thread=${result.threadId}`,
      ...(to.kind === "command" ? { command: to.name } : { desk: to.desk.name }),
      model: result.turn.model,
    }
  },
}

/**
 * A change that needs a repo — the CRM itself, a client site — goes to Solve:
 * a task on the board and its thread, where the worker cuts a worktree and
 * builds. One card files the task (or takes one that exists) and opens the
 * thread, pointing back here so the solver can `hand_back`.
 */
export const solveTaskTool: ToolSpec = {
  name: "solve_task",
  description:
    "Open a Solve thread for a change that needs code or a repo — the CRM itself, a client site, a plugin. Files a task (or takes an existing `taskId`) and opens its Solve thread, where the worker builds in a worktree and reports back. Previewed; one Confirm does both and opens the thread. For a change to the tallkarol CRM pass clientSlug \"tallkarol\" and say \"crm\" in the notes so the solver picks that repo. Notes: what, why, acceptance, Karol's own words when he gave them.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      title: { type: "string", description: "The task title, as it will show on the board." },
      notes: { type: "string", description: "What, why, acceptance. Quote Karol where he said it." },
      clientSlug: { type: "string", description: "The client the work is for; \"tallkarol\" for the CRM and Karol's own sites." },
      taskId: { type: "string", description: "An existing task to solve instead of filing a new one." },
    },
  },
  async preview(args, ctx) {
    const { label } = await fromThread(ctx)
    const taskId = str(args, "taskId")
    if (taskId) {
      const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId), columns: { title: true } })
      if (!task) throw new Error(`No task ${taskId}.`)
      return {
        title: "Solve in chat",
        fields: [
          { label: "Task", value: task.title },
          { label: "From", value: label },
        ],
        note: "Opens the task's Solve thread (or the one already open) and points it back here.",
      }
    }
    const title = str(args, "title")
    if (!title) throw new Error("`title` is required when no `taskId` is given.")
    const slug = str(args, "clientSlug")
    const client = slug ? await db.query.clients.findFirst({ where: eq(clients.slug, slug) }) : null
    if (slug && !client) throw new Error(`No client with slug "${slug}". Call list_clients and use a slug from it.`)
    return {
      title: "File and solve",
      fields: [
        { label: "Task", value: title },
        { label: "Client", value: client?.name ?? "—" },
        { label: "From", value: label },
        { label: "Notes", value: (str(args, "notes") ?? "—").slice(0, 600) },
      ],
      note: "Files the task, opens its Solve thread, and the solver hands back here when it is done.",
    }
  },
  async run(args, ctx) {
    let taskId = str(args, "taskId")
    let title = ""
    if (!taskId) {
      title = str(args, "title") ?? ""
      if (!title) throw new Error("`title` is required when no `taskId` is given.")
      const slug = str(args, "clientSlug")
      const client = slug ? await db.query.clients.findFirst({ where: eq(clients.slug, slug) }) : null
      const where = await resolveTaskTarget({ clientId: client?.id ?? null })
      if ("error" in where) throw new Error(where.error)
      taskId = await insertTaskRow(db, {
        title: title.slice(0, 300),
        userId: ctx.userId,
        target: where,
        dueOn: null,
        notes: str(args, "notes") ?? "",
        priority: 2,
        source: "chat",
        refKind: "chat",
        refId: ctx.idempotencyKey,
      })
    }
    const opened = await startTaskThread(ctx.userId, taskId, ctx.threadId)
    return {
      taskId,
      ...(title ? { title } : {}),
      threadId: opened.threadId,
      url: `/chat?thread=${opened.threadId}`,
      created: opened.created,
    }
  },
}

/**
 * The other half of a handoff: the thread that was handed work posts what it
 * did into the thread that handed it, under its own name — so the coach
 * hears that the confirm-all change shipped without Karol carrying it back.
 * A note, not a turn: nothing answers it until Karol writes there.
 */
export const handBackTool: ToolSpec = {
  name: "hand_back",
  description:
    "Post what this thread did back into the thread that handed it the work (only in a thread opened by route_to or solve_task). Previewed. Use when the work is done or blocked: what was done, where it is (commit, branch, task, file), what is left and who it is waiting on. Plain and short; the thread it lands in reads it as a note from you, not from Karol.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      summary: { type: "string", description: "What was done, where it is, what is left." },
    },
    required: ["summary"],
  },
  async preview(args, ctx) {
    const summary = str(args, "summary")
    if (!summary) throw new Error("`summary` is required.")
    const { thread, label } = await fromThread(ctx)
    if (!thread?.fromThreadId) throw new Error("This thread was not handed its work by another thread; there is nothing to hand back to.")
    const origin = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, thread.fromThreadId),
      columns: { title: true, agent: true },
    })
    if (!origin) throw new Error("The thread this was handed from no longer exists.")
    return {
      title: "Hand back",
      fields: [
        { label: "To", value: `${origin.agent ? PERSONAS[origin.agent]?.label ?? origin.agent : "Assistant"} — ${origin.title.slice(0, 80)}` },
        { label: "From", value: label },
        { label: "Summary", value: summary.slice(0, 800) },
      ],
      note: "Posts the summary into that thread as a note. Nothing runs there until you write.",
    }
  },
  async run(args, ctx) {
    const summary = str(args, "summary")
    if (!summary) throw new Error("`summary` is required.")
    const { thread, label } = await fromThread(ctx)
    if (!thread?.fromThreadId) throw new Error("Nothing to hand back to.")
    const originId = thread.fromThreadId
    const now = new Date()
    await db.transaction(async (tx) => {
      await tx.insert(chatMessages).values({
        threadId: originId,
        role: "user",
        agent: label,
        body: `Handed back from ${label} (thread ${ctx.threadId.slice(0, 8)}): ${summary}`,
      })
      await tx.update(chatThreads).set({ lastMessageAt: now, archivedAt: null }).where(eq(chatThreads.id, originId))
    })
    return { threadId: originId, url: `/chat?thread=${originId}` }
  },
}

export const DESK_TOOLS: readonly ToolSpec[] = [routeToTool, solveTaskTool, handBackTool]
