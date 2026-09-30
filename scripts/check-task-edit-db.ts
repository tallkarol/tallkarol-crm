/**
 * The chat's edit_task against the real database, on a task this script
 * plants (with a chat thread bound to it) and then deletes: title, priority,
 * notes appended once and only once, labels added, a move to another client
 * (retainer and the bound thread follow, the old project clears), a project
 * that names its own client, stage changes, reopening a done task through a
 * stage, and the refusals. The shared core is the same one the board's
 * updateTask runs.
 *
 *   npm run check:task:edit:db
 */

import { loadLocalEnv } from "../lib/load-env"

loadLocalEnv()

let failures = 0
function check(label: string, ok: boolean, detail = "") {
  if (ok) console.log(`✓ ${label}${detail ? ` — ${detail}` : ""}`)
  else {
    failures += 1
    console.log(`✗ ${label}${detail ? ` — ${detail}` : ""}`)
  }
}

async function main() {
  const { db } = await import("../db")
  const { chatThreads, clients, projects, tasks, users } = await import("../db/schema")
  const { eq, like } = await import("drizzle-orm")
  const { toolByName } = await import("../lib/chat/tools")
  const { completeTask } = await import("../lib/task-complete")

  const tag = `chktask${Math.random().toString(36).slice(2, 8)}`
  const admin = await db.query.users.findFirst({ where: eq(users.role, "admin") })
  if (!admin) throw new Error("no admin user")
  const ctx = (key: string) => ({ userId: admin.id, threadId: "check", idempotencyKey: `${tag}-${key}` })
  const tool = toolByName("edit_task")
  if (!tool?.preview) throw new Error("edit_task missing")
  const gdi = await db.query.clients.findFirst({ where: eq(clients.slug, "gdi"), with: { retainers: true } })
  const mineralife = await db.query.clients.findFirst({ where: eq(clients.slug, "mineralife"), with: { retainers: true } })
  if (!gdi || !mineralife) throw new Error("gdi and mineralife clients are needed")
  const mineralifeProject = await db.query.projects.findFirst({ where: eq(projects.clientId, mineralife.id) })
  const gdiProject = await db.query.projects.findFirst({ where: eq(projects.clientId, gdi.id) })

  const [planted] = await db
    .insert(tasks)
    .values({
      title: `${tag} original`,
      userId: admin.id,
      clientId: gdi.id,
      projectId: gdiProject?.id ?? null,
      retainerId: gdi.retainers.find((r) => r.status === "active")?.id ?? null,
      notes: "first line",
      labels: ["seo"],
      priority: 2,
      source: "check",
    })
    .returning({ id: tasks.id })
  const id = planted.id
  const [thread] = await db
    .insert(chatThreads)
    .values({ userId: admin.id, title: `${tag} solve thread`, clientId: gdi.id, taskId: id })
    .returning({ id: chatThreads.id })
  const read = () => db.query.tasks.findFirst({ where: eq(tasks.id, id) })
  const field = (fields: { label: string; value: string }[], label: string) => fields.find((f) => f.label === label)?.value

  try {
    /* ---------- title, priority, notes, labels ---------- */
    const args = { taskId: id, title: `${tag} renamed`, priority: "high", appendNotes: "second line", addLabels: "follow-up, seo" }
    const preview = await tool.preview(args, ctx("e1"))
    check("preview lists only what moves", field(preview.fields, "Title") === `${tag} original → ${tag} renamed` && field(preview.fields, "Priority") === "normal → high" && field(preview.fields, "Notes") === "+ second line" && field(preview.fields, "Labels") === "seo → seo, follow-up" && !field(preview.fields, "Client"), JSON.stringify(preview.fields))
    await tool.run(args, ctx("e1"))
    let t = await read()
    check("title, priority, notes and labels written", t?.title === `${tag} renamed` && t.priority === 1 && t.notes === "first line\n\nsecond line" && t.labels.join(",") === "seo,follow-up", JSON.stringify({ notes: t?.notes, labels: t?.labels }))
    const again = (await tool.run(args, ctx("e1"))) as { changed: boolean }
    t = await read()
    check("confirming the same edit twice appends nothing twice", !again.changed && t?.notes === "first line\n\nsecond line")
    let refused = ""
    try {
      await tool.preview(args, ctx("e2"))
    } catch (e) {
      refused = (e as Error).message
    }
    check("an edit that changes nothing is refused on the card", refused.includes("already there"), refused)

    /* ---------- move client: retainer, project and the bound thread follow ---------- */
    const move = await tool.preview({ taskId: id, clientSlug: "mineralife" }, ctx("m1"))
    check("moving client shows client and project", field(move.fields, "Client") === `GDI → ${mineralife.name}` && (!gdiProject || (move.note ?? "").includes("project was cleared")), JSON.stringify(move))
    await tool.run({ taskId: id, clientSlug: "mineralife" }, ctx("m1"))
    t = await read()
    const bound = await db.query.chatThreads.findFirst({ where: eq(chatThreads.id, thread.id) })
    const mRetainer = mineralife.retainers.find((r) => r.status === "active")?.id ?? null
    check("the task moved with the new client's retainer", t?.clientId === mineralife.id && t.projectId === null && t.retainerId === mRetainer)
    check("the bound chat thread follows the client", bound?.clientId === mineralife.id)

    if (mineralifeProject) {
      await tool.run({ taskId: id, projectSlug: mineralifeProject.slug }, ctx("p1"))
      t = await read()
      check("a project files the task under it", t?.projectId === mineralifeProject.id && t.clientId === mineralife.id)
      let mismatch = ""
      try {
        await tool.preview({ taskId: id, clientSlug: "gdi", projectSlug: mineralifeProject.slug }, ctx("p2"))
      } catch (e) {
        mismatch = (e as Error).message
      }
      check("a project from another client is refused", mismatch.includes("different client"), mismatch)
      await tool.run({ taskId: id, projectSlug: "none" }, ctx("p3"))
      t = await read()
      check("projectSlug none clears the project, keeps the client", t?.projectId === null && t.clientId === mineralife.id)
    } else {
      check("no Mineralife project to test with — skipped", true)
    }

    /* ---------- stage, done, reopen ---------- */
    await tool.run({ taskId: id, stage: "doing" }, ctx("s1"))
    t = await read()
    check("stage moves on the board", t?.boardStage === "doing" && t.status === "open")
    await completeTask(id, admin.id, true)
    const reopenPreview = await tool.preview({ taskId: id, stage: "waiting" }, ctx("s2"))
    check("a stage on a done task says it reopens", field(reopenPreview.fields, "Status") === "done → open" && (reopenPreview.note ?? "").includes("reopens"), JSON.stringify(reopenPreview))
    await tool.run({ taskId: id, stage: "waiting" }, ctx("s2"))
    t = await read()
    check("it reopened into that stage", t?.status === "open" && t.boardStage === "waiting" && t.completedAt === null)
    await completeTask(id, admin.id, true)
    await tool.run({ taskId: id, reopen: true }, ctx("s3"))
    t = await read()
    check("reopen goes back to queue", t?.status === "open" && t.boardStage === "queue")

    let done = ""
    try {
      await tool.preview({ taskId: id, stage: "done" }, ctx("s4"))
    } catch (e) {
      done = (e as Error).message
    }
    check("stage done points to complete_task", done.includes("complete_task"), done)

    await tool.run({ taskId: id, labels: "none", notes: "" }, ctx("c1"))
    t = await read()
    check("labels none and empty notes clear them", t?.labels.length === 0 && t.notes === "")
  } finally {
    await db.delete(chatThreads).where(eq(chatThreads.id, thread.id))
    await db.delete(tasks).where(eq(tasks.id, id))
    const left = [
      ...(await db.select({ id: tasks.id }).from(tasks).where(like(tasks.title, `${tag}%`))),
      ...(await db.select({ id: chatThreads.id }).from(chatThreads).where(like(chatThreads.title, `${tag}%`))),
    ]
    check("cleanup: nothing planted is left", left.length === 0)
  }

  console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed")
  process.exit(failures ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
