import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"
import { db } from "@/db"
import {
  agentSessions,
  clients,
  projects,
  punchlistItems,
  punchlistTestRuns,
  punchlists,
  tasks,
} from "@/db/schema"
import type {
  Punchlist,
  PunchlistItem,
  PunchlistTestRun,
  PunchlistTestSpec,
  PunchlistTestReport,
} from "@/db/schema"
import { notify } from "@/lib/notify"
import { ROUTES } from "@/lib/nav"
import {
  canTransition,
  isTerminal,
  itemState,
  listStatus,
  parseTestSpec,
  progress,
  slugify,
  type ItemView,
  type RunStatus,
} from "@/lib/punchlist"
import { insertTaskRow, resolveTaskTarget } from "@/lib/task-insert"

/**
 * The db half of punch lists. `lib/punchlist.ts` is the pure half — keep
 * anything a client component needs over there.
 */

export const PUNCHLIST_SOURCE = "punchlist"
export const ITEM_REF_KIND = "punchlist_item"
const MAX_SOURCE_TEXT = 200_000
const MAX_ITEMS = 200

type Failure = { ok: false; status: number; error: string }
type Success<T> = { ok: true; data: T }
export type PunchlistResult<T> = Success<T> | Failure

/* ------------------------------------------------------------------ */
/* create                                                               */
/* ------------------------------------------------------------------ */

export type NewPunchlistItem = {
  section?: string
  title: string
  kind?: string
  reported?: string
  outcome?: string
  test?: unknown
}

export type NewPunchlist = {
  title: string
  clientId?: string | null
  clientSlug?: string | null
  projectId?: string | null
  projectSlug?: string | null
  intro?: string
  sourceKind?: string
  sourceRef?: string
  sourceText?: string
  generatedBy?: string
  sessionRef?: string | null
  status?: "open" | "draft"
  refKind?: string | null
  refId?: string | null
  items: NewPunchlistItem[]
  /** Who owns the tasks — the device token's user. */
  userId: string | null
}

export type CreatedPunchlist = {
  id: string
  slug: string
  replayed: boolean
  items: { itemId: string; taskId: string | null }[]
}

async function uniqueSlug(base: string) {
  const root = slugify(base) || "punch-list"
  const taken = await db
    .select({ slug: punchlists.slug })
    .from(punchlists)
    .where(sql`${punchlists.slug} = ${root} or ${punchlists.slug} like ${root + "-%"}`)
  const set = new Set(taken.map((r) => r.slug))
  if (!set.has(root)) return root
  for (let n = 2; n < 1000; n++) {
    if (!set.has(`${root}-${n}`)) return `${root}-${n}`
  }
  return `${root}-${Date.now()}`
}

/** A session id the Mac reported. The full row arrives later from `session-log`. */
export async function ensureSessionStub(
  writer: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  sessionRef: string,
  facts: { clientId?: string | null; projectId?: string | null; surface?: string; name?: string }
) {
  await writer
    .insert(agentSessions)
    .values({
      sessionRef,
      surface: facts.surface ?? "claude",
      name: facts.name ?? "",
      clientId: facts.clientId ?? null,
      projectId: facts.projectId ?? null,
    })
    .onConflictDoNothing()
}

function taskNotes(item: { reported?: string; outcome?: string }) {
  const parts: string[] = []
  if (item.reported?.trim()) parts.push(`Reported:\n${item.reported.trim()}`)
  if (item.outcome?.trim()) parts.push(`Fix:\n${item.outcome.trim()}`)
  return parts.join("\n\n").slice(0, 4000)
}

export async function createPunchlist(
  input: NewPunchlist
): Promise<PunchlistResult<CreatedPunchlist>> {
  const title = input.title.trim().slice(0, 200)
  if (!title) return { ok: false, status: 400, error: "A punch list needs a title." }
  if (!Array.isArray(input.items) || input.items.length === 0) {
    return { ok: false, status: 400, error: "A punch list needs at least one item." }
  }
  if (input.items.length > MAX_ITEMS) {
    return { ok: false, status: 400, error: `At most ${MAX_ITEMS} items per list.` }
  }

  if (input.refKind && input.refId) {
    const existing = await db.query.punchlists.findFirst({
      where: and(eq(punchlists.refKind, input.refKind), eq(punchlists.refId, input.refId)),
      with: { items: { columns: { id: true, taskId: true } } },
    })
    if (existing) {
      return {
        ok: true,
        data: {
          id: existing.id,
          slug: existing.slug,
          replayed: true,
          items: existing.items.map((i) => ({ itemId: i.id, taskId: i.taskId })),
        },
      }
    }
  }

  let clientId = input.clientId ?? null
  let projectId = input.projectId ?? null
  if (!clientId && input.clientSlug) {
    const client = await db.query.clients.findFirst({ where: eq(clients.slug, input.clientSlug) })
    if (!client) return { ok: false, status: 404, error: `No client with slug "${input.clientSlug}".` }
    clientId = client.id
  }
  if (!projectId && input.projectSlug) {
    const project = await db.query.projects.findFirst({ where: eq(projects.slug, input.projectSlug) })
    if (!project) return { ok: false, status: 404, error: `No project with slug "${input.projectSlug}".` }
    projectId = project.id
  }
  const target = await resolveTaskTarget({ clientId, projectId })
  if ("error" in target) return { ok: false, status: 400, error: target.error }
  if (!target.clientId) {
    return { ok: false, status: 422, error: "A punch list always names a client." }
  }

  // Validate every item before touching the database.
  const sections: string[] = []
  const prepared: {
    section: string
    sectionSort: number
    sort: number
    title: string
    kind: string
    reported: string
    outcome: string
    test: PunchlistTestSpec | null
  }[] = []
  const perSection = new Map<string, number>()
  for (let index = 0; index < input.items.length; index++) {
    const raw = input.items[index]
    const itemTitle = String(raw.title ?? "").trim().slice(0, 300)
    if (!itemTitle) return { ok: false, status: 400, error: `Item ${index + 1} has no title.` }
    const section = String(raw.section ?? "").trim().slice(0, 120)
    if (!sections.includes(section)) sections.push(section)
    const test = parseTestSpec(raw.test ?? null)
    if (!test.ok) return { ok: false, status: 400, error: `Item ${index + 1}: ${test.error}` }
    const sort = perSection.get(section) ?? 0
    perSection.set(section, sort + 1)
    prepared.push({
      section,
      sectionSort: sections.indexOf(section),
      sort,
      title: itemTitle,
      kind: String(raw.kind ?? "").trim().slice(0, 60),
      reported: String(raw.reported ?? "").trim().slice(0, 8000),
      outcome: String(raw.outcome ?? "").trim().slice(0, 8000),
      test: test.spec,
    })
  }

  const status = input.status === "draft" ? "draft" : "open"
  const slug = await uniqueSlug(title)
  const sessionRef = input.sessionRef?.trim() || null

  const created = await db.transaction(async (tx) => {
    if (sessionRef) {
      await ensureSessionStub(tx, sessionRef, { clientId: target.clientId, projectId: target.projectId })
    }
    const [list] = await tx
      .insert(punchlists)
      .values({
        title,
        slug,
        clientId: target.clientId!,
        projectId: target.projectId,
        retainerId: target.retainerId,
        status,
        intro: (input.intro ?? "").trim().slice(0, 2000),
        sourceKind: (input.sourceKind ?? "doc").trim().slice(0, 20) || "doc",
        sourceRef: (input.sourceRef ?? "").trim().slice(0, 500),
        sourceText: (input.sourceText ?? "").slice(0, MAX_SOURCE_TEXT),
        generatedBy: (input.generatedBy ?? "").trim().slice(0, 120),
        sessionRef,
        refKind: input.refKind && input.refId ? input.refKind : null,
        refId: input.refKind && input.refId ? input.refId : null,
      })
      .returning({ id: punchlists.id })

    const items: { itemId: string; taskId: string | null }[] = []
    for (const item of prepared) {
      const [row] = await tx
        .insert(punchlistItems)
        .values({ punchlistId: list.id, ...item })
        .returning({ id: punchlistItems.id })
      let taskId: string | null = null
      if (status === "open") {
        taskId = await insertTaskRow(tx, {
          title: item.title,
          userId: input.userId,
          target,
          notes: taskNotes(item),
          labels: item.kind ? [item.kind] : [],
          source: PUNCHLIST_SOURCE,
          refKind: ITEM_REF_KIND,
          refId: row.id,
        })
        await tx.update(punchlistItems).set({ taskId }).where(eq(punchlistItems.id, row.id))
      }
      items.push({ itemId: row.id, taskId })
    }
    return { id: list.id, slug, items }
  })

  return { ok: true, data: { ...created, replayed: false } }
}

/** A draft's items become tasks; the list opens. Idempotent per item. */
export async function acceptDraft(
  id: string,
  userId: string | null
): Promise<PunchlistResult<{ created: number }>> {
  const list = await db.query.punchlists.findFirst({
    where: eq(punchlists.id, id),
    with: { items: true },
  })
  if (!list) return { ok: false, status: 404, error: "That punch list does not exist." }
  if (list.status === "void") return { ok: false, status: 409, error: "That punch list is void." }
  const target = await resolveTaskTarget({ clientId: list.clientId, projectId: list.projectId })
  if ("error" in target) return { ok: false, status: 400, error: target.error }

  let created = 0
  await db.transaction(async (tx) => {
    for (const item of list.items) {
      if (item.taskId) continue
      const taskId = await insertTaskRow(tx, {
        title: item.title,
        userId,
        target,
        notes: taskNotes(item),
        labels: item.kind ? [item.kind] : [],
        source: PUNCHLIST_SOURCE,
        refKind: ITEM_REF_KIND,
        refId: item.id,
      })
      await tx
        .update(punchlistItems)
        .set({ taskId, updatedAt: new Date() })
        .where(eq(punchlistItems.id, item.id))
      created += 1
    }
    if (list.status === "draft") {
      await tx
        .update(punchlists)
        .set({ status: "open", updatedAt: new Date() })
        .where(eq(punchlists.id, id))
    }
  })
  return { ok: true, data: { created } }
}

export async function setListStatus(id: string, status: "open" | "void") {
  await db
    .update(punchlists)
    .set({ status, updatedAt: new Date() })
    .where(eq(punchlists.id, id))
}

/* ------------------------------------------------------------------ */
/* read                                                                 */
/* ------------------------------------------------------------------ */

export type PunchlistView = Punchlist & {
  client: { id: string; name: string; slug: string }
  project: { id: string; name: string; slug: string } | null
  items: ItemView[]
  effectiveStatus: "draft" | "open" | "done" | "void"
  progress: { done: number; total: number; pct: number }
  latestRuns: Record<string, PunchlistTestRun>
}

function toItemView(
  item: PunchlistItem & { task: { status: "open" | "done"; boardStage: "queue" | "doing" | "waiting" } | null }
): ItemView {
  return {
    id: item.id,
    section: item.section,
    sectionSort: item.sectionSort,
    sort: item.sort,
    title: item.title,
    kind: item.kind,
    reported: item.reported,
    outcome: item.outcome,
    taskId: item.taskId,
    state: itemState(item.task),
    test: item.test ?? null,
    lastTestStatus: item.lastTestStatus,
  }
}

export async function loadPunchlist(slug: string): Promise<PunchlistView | null> {
  const list = await db.query.punchlists.findFirst({
    where: eq(punchlists.slug, slug),
    with: {
      client: { columns: { id: true, name: true, slug: true } },
      project: { columns: { id: true, name: true, slug: true } },
      items: {
        with: { task: { columns: { status: true, boardStage: true } } },
        orderBy: [asc(punchlistItems.sectionSort), asc(punchlistItems.sort)],
      },
    },
  })
  if (!list) return null
  const items = list.items.map(toItemView)
  const ids = items.map((i) => i.id)
  const runs = ids.length
    ? await db.query.punchlistTestRuns.findMany({
        where: inArray(punchlistTestRuns.itemId, ids),
        orderBy: [desc(punchlistTestRuns.requestedAt)],
      })
    : []
  const latestRuns: Record<string, PunchlistTestRun> = {}
  for (const run of runs) if (!latestRuns[run.itemId]) latestRuns[run.itemId] = run
  return {
    ...list,
    items,
    effectiveStatus: listStatus(list.status, items),
    progress: progress(items),
    latestRuns,
  }
}

export type PunchlistSummary = Punchlist & {
  client: { id: string; name: string; slug: string }
  project: { id: string; name: string; slug: string } | null
  effectiveStatus: "draft" | "open" | "done" | "void"
  progress: { done: number; total: number; pct: number }
  testSummary: { pass: number; fail: number; pending: number }
}

function summarize(
  list: Punchlist & {
    client: { id: string; name: string; slug: string }
    project: { id: string; name: string; slug: string } | null
    items: (PunchlistItem & { task: { status: "open" | "done"; boardStage: "queue" | "doing" | "waiting" } | null })[]
  }
): PunchlistSummary {
  const items = list.items.map(toItemView)
  const testSummary = { pass: 0, fail: 0, pending: 0 }
  for (const item of list.items) {
    if (item.lastTestStatus === "pass") testSummary.pass++
    else if (item.lastTestStatus === "fail" || item.lastTestStatus === "blocked") testSummary.fail++
    else if (item.lastTestStatus === "queued" || item.lastTestStatus === "running") testSummary.pending++
  }
  const { items: _items, ...rest } = list
  void _items
  return {
    ...rest,
    effectiveStatus: listStatus(list.status, items),
    progress: progress(items),
    testSummary,
  }
}

const summaryWith = {
  client: { columns: { id: true, name: true, slug: true } },
  project: { columns: { id: true, name: true, slug: true } },
  items: { with: { task: { columns: { status: true, boardStage: true } } } },
} as const

export async function listPunchlists(): Promise<PunchlistSummary[]> {
  const rows = await db.query.punchlists.findMany({
    with: summaryWith,
    orderBy: [desc(punchlists.createdAt)],
  })
  return rows.map(summarize)
}

/** Lists filed against one client or one project — the entity-page blocks. */
export async function punchlistsFor(scope: {
  clientId?: string
  projectId?: string
}): Promise<PunchlistSummary[]> {
  const where = scope.projectId
    ? eq(punchlists.projectId, scope.projectId)
    : scope.clientId
      ? eq(punchlists.clientId, scope.clientId)
      : undefined
  if (!where) return []
  const rows = await db.query.punchlists.findMany({
    where,
    with: summaryWith,
    orderBy: [desc(punchlists.createdAt)],
  })
  return rows.map(summarize)
}

/** The punch list an item's task belongs to, for the task detail card. */
export async function punchlistForTask(taskId: string) {
  const item = await db.query.punchlistItems.findFirst({
    where: eq(punchlistItems.taskId, taskId),
    with: { punchlist: { columns: { id: true, title: true, slug: true } } },
  })
  return item ? { item, punchlist: item.punchlist } : null
}

/* ------------------------------------------------------------------ */
/* tests                                                                */
/* ------------------------------------------------------------------ */

export async function setItemTest(
  itemId: string,
  raw: unknown
): Promise<PunchlistResult<{ spec: PunchlistTestSpec | null }>> {
  const parsed = parseTestSpec(raw)
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error }
  const [row] = await db
    .update(punchlistItems)
    .set({ test: parsed.spec, updatedAt: new Date() })
    .where(eq(punchlistItems.id, itemId))
    .returning({ id: punchlistItems.id })
  if (!row) return { ok: false, status: 404, error: "That item does not exist." }
  return { ok: true, data: { spec: parsed.spec } }
}

/**
 * Queue a run for an item's test and wake a phone. The spec is copied onto
 * the run so a later edit does not rewrite what was actually tested.
 */
export async function requestTestRun(
  itemId: string,
  userId: string | null
): Promise<PunchlistResult<{ runId: string }>> {
  const item = await db.query.punchlistItems.findFirst({
    where: eq(punchlistItems.id, itemId),
    with: { punchlist: { columns: { slug: true, title: true } } },
  })
  if (!item) return { ok: false, status: 404, error: "That item does not exist." }
  if (!item.test) return { ok: false, status: 422, error: "That item has no test attached." }
  const open = await db.query.punchlistTestRuns.findFirst({
    where: and(
      eq(punchlistTestRuns.itemId, itemId),
      inArray(punchlistTestRuns.status, ["queued", "running"])
    ),
  })
  if (open) return { ok: true, data: { runId: open.id } }

  const [run] = await db
    .insert(punchlistTestRuns)
    .values({ itemId, status: "queued", spec: item.test, requestedBy: userId })
    .returning({ id: punchlistTestRuns.id })
  await db
    .update(punchlistItems)
    .set({ lastTestStatus: "queued", updatedAt: new Date() })
    .where(eq(punchlistItems.id, itemId))

  await notify({
    kind: "punchlist.test",
    dedupeKey: `run:${run.id}`,
    body: `${item.title} — ${item.punchlist.title}`,
    url: `${ROUTES.punchlist(item.punchlist.slug)}?peek=run:${run.id}`,
  }).catch(() => {})

  return { ok: true, data: { runId: run.id } }
}

export type RunView = PunchlistTestRun & {
  item: {
    id: string
    title: string
    outcome: string
    reported: string
    taskId: string | null
    punchlist: {
      id: string
      title: string
      slug: string
      client: { slug: string; name: string }
      project: { slug: string; name: string } | null
    }
  }
}

const runWith = {
  item: {
    columns: { id: true, title: true, outcome: true, reported: true, taskId: true },
    with: {
      punchlist: {
        columns: { id: true, title: true, slug: true },
        with: {
          client: { columns: { slug: true, name: true } },
          project: { columns: { slug: true, name: true } },
        },
      },
    },
  },
} as const

export async function listRuns(filter: {
  status?: RunStatus | null
  clientSlug?: string | null
  limit?: number
}): Promise<RunView[]> {
  const rows = (await db.query.punchlistTestRuns.findMany({
    where: filter.status ? eq(punchlistTestRuns.status, filter.status) : undefined,
    with: runWith,
    orderBy: [asc(punchlistTestRuns.requestedAt)],
    limit: filter.limit ?? 100,
  })) as RunView[]
  if (!filter.clientSlug) return rows
  return rows.filter((r) => r.item.punchlist.client.slug === filter.clientSlug)
}

/** The wire shape of a run — what the Mac reads and what a report echoes back. */
export function runJson(run: RunView) {
  return {
    id: run.id,
    status: run.status,
    spec: run.spec,
    requestedAt: run.requestedAt,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    runner: run.runner,
    verdict: run.verdict,
    report: run.report,
    sessionRef: run.sessionRef,
    item: {
      id: run.item.id,
      title: run.item.title,
      outcome: run.item.outcome,
      reported: run.item.reported,
      taskId: run.item.taskId,
    },
    punchlist: {
      id: run.item.punchlist.id,
      title: run.item.punchlist.title,
      slug: run.item.punchlist.slug,
      url: ROUTES.punchlist(run.item.punchlist.slug),
    },
    client: run.item.punchlist.client,
    project: run.item.punchlist.project,
  }
}

export async function loadRun(id: string): Promise<RunView | null> {
  const row = (await db.query.punchlistTestRuns.findFirst({
    where: eq(punchlistTestRuns.id, id),
    with: runWith,
  })) as RunView | undefined
  return row ?? null
}

export type RunTransition = {
  status: RunStatus
  runner?: string | null
  verdict?: string | null
  report?: PunchlistTestReport | null
  sessionRef?: string | null
  force?: boolean
}

/**
 * queued → running → pass | fail | blocked (a report may skip the claim). A
 * second `running` from another runner is a 409 unless forced, so two
 * sessions cannot both think they own a run. Terminal states roll up onto
 * the item; a corrected verdict on a terminal run is kept.
 */
export async function transitionRun(
  id: string,
  input: RunTransition
): Promise<PunchlistResult<{ run: PunchlistTestRun; replayed: boolean }>> {
  const run = await db.query.punchlistTestRuns.findFirst({ where: eq(punchlistTestRuns.id, id) })
  if (!run) return { ok: false, status: 404, error: "That run does not exist." }
  const from = run.status as RunStatus
  const to = input.status
  const runner = (input.runner ?? "").trim().slice(0, 120)

  if (from === to && to === "running") {
    if (runner && run.runner && runner !== run.runner && !input.force) {
      return { ok: false, status: 409, error: `Run is already claimed by ${run.runner}.` }
    }
    return { ok: true, data: { run, replayed: true } }
  }
  if (from === to) {
    // A corrected verdict or report on an already-terminal run is kept —
    // a replay with nothing new is the only true no-op.
    const hasNews = (input.verdict != null && input.verdict.trim() !== run.verdict) || input.report != null
    if (!hasNews) return { ok: true, data: { run, replayed: true } }
    const [row] = await db
      .update(punchlistTestRuns)
      .set({
        verdict: input.verdict != null ? input.verdict.trim().slice(0, 2000) : run.verdict,
        report: input.report ?? run.report,
      })
      .where(eq(punchlistTestRuns.id, id))
      .returning()
    return { ok: true, data: { run: row, replayed: false } }
  }
  if (!canTransition(from, to)) {
    return { ok: false, status: 409, error: `A ${from} run cannot become ${to}.` }
  }
  if (to === "running" && run.runner && runner && run.runner !== runner && !input.force) {
    return { ok: false, status: 409, error: `Run is already claimed by ${run.runner}.` }
  }

  const now = new Date()
  const terminal = isTerminal(to)
  const sessionRef = input.sessionRef?.trim() || null

  const updated = await db.transaction(async (tx) => {
    if (sessionRef) await ensureSessionStub(tx, sessionRef, {})
    const [row] = await tx
      .update(punchlistTestRuns)
      .set({
        status: to,
        runner: runner || run.runner,
        startedAt: run.startedAt ?? now,
        finishedAt: terminal ? now : run.finishedAt,
        verdict: input.verdict != null ? input.verdict.trim().slice(0, 2000) : run.verdict,
        report: input.report ?? run.report,
        sessionRef: sessionRef ?? run.sessionRef,
      })
      .where(eq(punchlistTestRuns.id, id))
      .returning()
    await tx
      .update(punchlistItems)
      .set({ lastTestStatus: to === "cancelled" ? "" : to, updatedAt: now })
      .where(eq(punchlistItems.id, run.itemId))
    return row
  })

  return { ok: true, data: { run: updated, replayed: false } }
}

/** Runs still queued after `olderThanMinutes` — for the cron nudge. */
export async function staleQueuedRuns(now: Date, olderThanMinutes: number) {
  const cutoff = new Date(now.getTime() - olderThanMinutes * 60_000)
  return (await db.query.punchlistTestRuns.findMany({
    where: and(
      eq(punchlistTestRuns.status, "queued"),
      sql`${punchlistTestRuns.requestedAt} < ${cutoff}`
    ),
    with: runWith,
  })) as RunView[]
}

// `tasks` is imported for the relation type only.
void tasks
