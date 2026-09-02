import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { db } from "@/db"
import { tasks } from "@/db/schema"
import type { Cadence } from "@/db/schema"
import { parseTaskInput } from "@/lib/task-parse"
import { taskTargets } from "@/lib/tasks"
import {
  authenticateTimeRequest,
  readJson,
  readString,
  unauthorized,
} from "@/lib/time-api"

export const dynamic = "force-dynamic"

/**
 * Capture a task from anything holding a device token — a phone shortcut, a
 * watch, a script. Accepts either structured fields or one `text` line in the
 * same grammar the composer uses, so a shortcut can just forward what you said.
 *
 *   { "text": "chase hero images @caps fieldhouse website !fri" }
 *   { "title": "...", "clientId": "...", "dueOn": "2026-09-04" }
 *
 * `refKind` + `refId` (a uuid) name what the task was made from. Sending the
 * same pair twice returns the task already made, with 200 — so a script that
 * retries after a dropped connection cannot file the same follow-up twice.
 */
export async function POST(request: Request) {
  const caller = await authenticateTimeRequest(request)
  if (!caller) return unauthorized()

  const body = await readJson(request)

  const refKind = readString(body, "refKind")
  const refId = readString(body, "refId")
  if (refId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refId)) {
    return NextResponse.json({ error: "`refId` must be a uuid." }, { status: 400 })
  }
  if (refKind && refId) {
    const existing = await db.query.tasks.findFirst({
      where: and(eq(tasks.refKind, refKind), eq(tasks.refId, refId)),
    })
    if (existing) {
      return NextResponse.json(
        {
          task: {
            id: existing.id,
            title: existing.title,
            clientId: existing.clientId,
            projectId: existing.projectId,
            productId: existing.productId,
            dueOn: existing.dueOn,
            cadence: existing.cadence,
            priority: existing.priority,
          },
          replayed: true,
        },
        { status: 200 }
      )
    }
  }
  const text = readString(body, "text")
  const targets = await taskTargets()

  let title = readString(body, "title") ?? ""
  let clientId = readString(body, "clientId")
  let projectId = readString(body, "projectId")
  let productId = readString(body, "productId")
  let dueOn = readString(body, "dueOn")
  let cadence = (readString(body, "cadence") ?? "none") as Cadence
  let snoozedUntil = readString(body, "snoozedUntil")

  if (text) {
    const parsed = parseTaskInput(text, targets)
    title = title || parsed.title
    clientId = clientId ?? parsed.target?.clientId ?? null
    projectId = projectId ?? parsed.target?.projectId ?? null
    productId = productId ?? parsed.target?.productId ?? null
    dueOn = dueOn ?? parsed.dueOn
    snoozedUntil = snoozedUntil ?? parsed.snoozedUntil
    if (parsed.cadence !== "none") cadence = parsed.cadence
  }

  title = title.trim().slice(0, 300)
  if (!title) {
    return NextResponse.json(
      { error: "Send `title`, or `text` with something left after the tokens." },
      { status: 400 }
    )
  }

  // A project or product implies its client — the same resolution the composer does.
  let retainerId: string | null = null
  if (projectId) {
    const project = await db.query.projects.findFirst({
      where: (p, { eq }) => eq(p.id, projectId!),
    })
    if (!project) {
      return NextResponse.json({ error: "That project does not exist." }, { status: 400 })
    }
    clientId = project.clientId
    retainerId = project.retainerId
    productId = null
  } else if (productId) {
    const product = await db.query.products.findFirst({
      where: (p, { eq }) => eq(p.id, productId!),
    })
    if (!product) {
      return NextResponse.json({ error: "That product does not exist." }, { status: 400 })
    }
    clientId = product.clientId
  } else if (clientId) {
    const client = await db.query.clients.findFirst({
      where: (c, { eq }) => eq(c.id, clientId!),
      with: { retainers: true },
    })
    if (!client) {
      return NextResponse.json({ error: "That client does not exist." }, { status: 400 })
    }
    retainerId = client.retainers.find((r) => r.status === "active")?.id ?? null
  }

  const priorityRaw = body.priority
  const priority =
    typeof priorityRaw === "number" && [1, 2, 3].includes(priorityRaw)
      ? priorityRaw
      : 2

  const [created] = await db
    .insert(tasks)
    .values({
      title,
      userId: caller.userId,
      clientId,
      projectId,
      productId,
      retainerId,
      dueOn: dueOn && /^\d{4}-\d{2}-\d{2}$/.test(dueOn) ? dueOn : null,
      snoozedUntil:
        snoozedUntil && /^\d{4}-\d{2}-\d{2}$/.test(snoozedUntil) ? snoozedUntil : null,
      cadence,
      priority,
      notes: (readString(body, "notes") ?? "").slice(0, 4000),
      labels: Array.isArray(body.labels)
        ? body.labels.filter((v): v is string => typeof v === "string" && !!v.trim()).slice(0, 10)
        : [],
      source: readString(body, "source") ?? "api",
      refKind: refKind && refId ? refKind : null,
      refId: refKind && refId ? refId : null,
    })
    .returning({ id: tasks.id })

  revalidatePath("/tasks")
  revalidatePath("/")

  return NextResponse.json(
    {
      task: {
        id: created.id,
        title,
        clientId,
        projectId,
        productId,
        dueOn,
        cadence,
        priority,
      },
      replayed: false,
    },
    { status: 201 }
  )
}
