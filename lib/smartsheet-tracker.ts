import { createHash } from "node:crypto"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import {
  appSettings,
  clients,
  deliverables,
  projects,
  retainers,
  type ProjectStatus,
} from "@/db/schema"
import { smartsheetApi, smartsheetTokenPresent } from "@/lib/smartsheet"

/**
 * The Mineralife/Zemvelo marketing tracker — a second Smartsheet, unrelated to
 * the support sheet. It is the client's own board: they own the rows, the
 * wording and the sections. We mirror the rows assigned to Karol so the work
 * shows up here, and (once switched on) push back only the three cells that
 * are genuinely ours to move.
 */

const CONFIG_KEY = "smartsheet_tracker"
export const TRACKER_SOURCE = "smartsheet_tracker"

/** The address the sheet knows Karol by. Rows are claimed by this, not by name. */
const ME = "kbuczek@mineralifeonline.com"

/**
 * The Category picklist. Anything else in that cell is a formula spilling into
 * it — the "Vacation/Unavailable" rows carry a task count there — so requiring
 * one of these three is also what keeps calendar rows out of the CRM.
 */
const CATEGORY_MINERALIFE = "Mineralife"
const CATEGORY_ZEMVELO = "Zemvelo"
const CATEGORY_BOTH = "ML & ZV"
const CATEGORIES = [CATEGORY_MINERALIFE, CATEGORY_ZEMVELO, CATEGORY_BOTH]

const CLIENT_SLUG = { mineralife: "mineralife", zemvelo: "zemvelo" } as const

export type TrackerConfig = {
  sheetId: string
  webhookId: string | null
  lastSyncAt: string | null
  /**
   * Off until the first import has been eyeballed. While false the write-back
   * path runs its checks and returns without touching the sheet.
   */
  writeBack: boolean
}

export async function getTrackerConfig(): Promise<TrackerConfig> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, CONFIG_KEY),
  })
  const v = (row?.value ?? {}) as Partial<TrackerConfig>
  return {
    sheetId: typeof v.sheetId === "string" ? v.sheetId : "",
    webhookId: typeof v.webhookId === "string" && v.webhookId ? v.webhookId : null,
    lastSyncAt: typeof v.lastSyncAt === "string" ? v.lastSyncAt : null,
    writeBack: v.writeBack === true,
  }
}

export async function saveTrackerConfig(patch: Partial<TrackerConfig>) {
  const next = { ...(await getTrackerConfig()), ...patch }
  await db
    .insert(appSettings)
    .values({ key: CONFIG_KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: next, updatedAt: new Date() },
    })
  return next
}

/* ------------------------------------------------------------------ reading */

const COLUMNS = {
  category: /^category/i,
  title: /^project title/i,
  assignedOn: /^assigned date/i,
  dueOn: /^due date/i,
  completedOn: /^completed date/i,
  serviceType: /^service type/i,
  assignedTo: /^assigned to/i,
  status: /^status/i,
  priority: /^priority/i,
  notes: /^notes/i,
  modifiedAt: /^modified$/i,
} as const

type Field = keyof typeof COLUMNS

/** Cells arrive as scalars or as typed objects, depending on the column. */
function readCell(raw: unknown): string {
  if (raw == null) return ""
  if (typeof raw !== "object") return String(raw).trim()
  const o = raw as Record<string, unknown>
  if (o.objectType === "DATE" || o.objectType === "DATETIME") return String(o.value ?? "")
  if (o.objectType === "MULTI_CONTACT") {
    const values = Array.isArray(o.values) ? o.values : []
    return values
      .map((c) => String((c as Record<string, unknown>).email ?? ""))
      .filter(Boolean)
      .join("; ")
  }
  if (o.objectType === "CONTACT") return String(o.email ?? o.name ?? "")
  return ""
}

function toDate(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

/** The sheet's Status picklist, flattened onto ours. */
const STATUS_IN: Record<string, ProjectStatus> = {
  "not started": "not_started",
  "in progress": "in_progress",
  "needs review": "in_progress",
  "on hold": "on_hold",
  complete: "complete",
}

function inboundStatus(sheetStatus: string): ProjectStatus {
  return STATUS_IN[sheetStatus.trim().toLowerCase()] ?? "not_started"
}

/** Our status, in the sheet's own wording. */
const STATUS_OUT: Record<ProjectStatus, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  waiting_on_content: "In Progress",
  on_hold: "ON HOLD",
  complete: "Complete",
}

type TrackerRow = {
  rowId: string
  rowNumber: number
  section: string
  fields: Partial<Record<Field, string>>
}

/**
 * Sections are plain rows in bold — a title with no category, status or
 * assignee. Indentation is inconsistent (some rows under "Current Projects"
 * lost their parent link), so the section is read from sheet order rather
 * than from parentId, which is how it reads on screen anyway.
 */
function withSections(rows: Record<string, unknown>[], colField: Map<number, Field>) {
  const out: TrackerRow[] = []
  let section = ""
  for (const row of rows) {
    const fields: Partial<Record<Field, string>> = {}
    for (const cell of (row.cells ?? []) as Record<string, unknown>[]) {
      const field = colField.get(cell.columnId as number)
      if (!field) continue
      const value = readCell(cell.objectValue ?? cell.value ?? cell.displayValue)
      // The sheet uses "." as a visual spacer in otherwise empty date cells.
      if (value && value !== ".") fields[field] = value
    }
    const title = fields.title ?? ""
    const isHeader =
      Boolean(title) &&
      !fields.status &&
      !fields.assignedTo &&
      !CATEGORIES.includes(fields.category ?? "")
    if (isHeader) {
      section = title
      continue
    }
    out.push({
      rowId: String(row.id),
      rowNumber: Number(row.rowNumber ?? 0),
      section,
      fields,
    })
  }
  return out
}

function isMine(row: TrackerRow) {
  return (row.fields.assignedTo ?? "").toLowerCase().includes(ME)
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u2018\u2019\u201c\u201d]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || "row"
  )
}

/**
 * A stable UUID for a synced child record, so re-running the sync updates the
 * row it made last time and never touches one added by hand here.
 */
function derivedId(seed: string) {
  const h = createHash("sha1").update(seed).digest("hex")
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `5${h.slice(13, 16)}`,
    ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16) + h.slice(18, 20),
    h.slice(20, 32),
  ].join("-")
}

/* ------------------------------------------------------------------- syncing */

type Plan = {
  externalId: string
  clientKey: keyof typeof CLIENT_SLUG
  name: string
  slug: string
  status: ProjectStatus
  sourceStatus: string
  notes: string
  links: { label: string; url: string }[]
  dueOn: string | null
  completedAt: Date | null
  updatedAt: Date
}

function buildNotes(row: TrackerRow, mirrored: boolean) {
  const bits: string[] = []
  const note = (row.fields.notes ?? "").trim()
  if (note) bits.push(note)
  const meta = [
    `Tracker row ${row.rowNumber}`,
    row.section || null,
    row.fields.serviceType || null,
    row.fields.priority ? `${row.fields.priority} priority` : null,
    row.fields.assignedOn ? `assigned ${row.fields.assignedOn}` : null,
    mirrored ? "read-only copy — the Mineralife project owns write-back" : null,
  ]
    .filter(Boolean)
    .join(" · ")
  bits.push(meta)
  return bits.join("\n\n")
}

/**
 * One tracker row becomes one project, except a row categorised "ML & ZV",
 * which is work for both companies and becomes one project per client. The
 * Mineralife copy keeps the plain row id and owns write-back; the Zemvelo
 * copy is suffixed and never writes, so the shared cell has a single author.
 */
function plans(row: TrackerRow, permalink: string): Plan[] {
  const category = row.fields.category ?? ""
  const name = (row.fields.title ?? "").trim()
  if (!name) return []

  const status = inboundStatus(row.fields.status ?? "")
  const completedOn = toDate(row.fields.completedOn ?? "")
  const modified = row.fields.modifiedAt ? new Date(row.fields.modifiedAt) : null
  const links = [
    { label: "Tracker row", url: `${permalink}?rowId=${row.rowId}` },
  ]
  const base = {
    status,
    sourceStatus: (row.fields.status ?? "").trim(),
    links,
    dueOn: toDate(row.fields.dueOn ?? ""),
    completedAt: completedOn ? new Date(`${completedOn}T12:00:00Z`) : null,
    updatedAt: modified && !Number.isNaN(modified.valueOf()) ? modified : new Date(),
  }

  const targets: { clientKey: keyof typeof CLIENT_SLUG; mirrored: boolean }[] =
    category === CATEGORY_BOTH
      ? [
          { clientKey: "mineralife", mirrored: false },
          { clientKey: "zemvelo", mirrored: true },
        ]
      : category === CATEGORY_ZEMVELO
        ? [{ clientKey: "zemvelo", mirrored: false }]
        : [{ clientKey: "mineralife", mirrored: false }]

  return targets.map(({ clientKey, mirrored }) => ({
    ...base,
    externalId: mirrored ? `${row.rowId}#${clientKey}` : row.rowId,
    clientKey,
    name,
    slug: `${clientKey}-${slugify(name)}-${row.rowId.slice(-6)}`,
    notes: buildNotes(row, mirrored),
  }))
}

export async function syncTracker(options: { dryRun?: boolean } = {}): Promise<{
  ok: boolean
  synced: number
  skipped: number
  planned?: Plan[]
  error?: string
}> {
  try {
    const config = await getTrackerConfig()
    if (!config.sheetId) return { ok: false, synced: 0, skipped: 0, error: "No tracker sheet ID configured." }
    if (!smartsheetTokenPresent())
      return { ok: false, synced: 0, skipped: 0, error: "SMARTSHEET_ACCESS_TOKEN is not set." }

    // level=2 gives contact columns as objects, so assignment is matched on
    // email rather than on however someone typed the name.
    const sheet = await smartsheetApi(
      `/sheets/${config.sheetId}?level=2&include=objectValue`
    )
    const permalink = String(sheet.permalink ?? "https://app.smartsheet.com")

    const colField = new Map<number, Field>()
    for (const col of sheet.columns ?? []) {
      const title = String(col.title ?? "")
      const hit = (Object.entries(COLUMNS) as [Field, RegExp][]).find(([, re]) =>
        re.test(title)
      )
      if (hit) colField.set(col.id, hit[0])
    }

    const rows = withSections(sheet.rows ?? [], colField)
    const mine = rows.filter(
      (r) => isMine(r) && CATEGORIES.includes(r.fields.category ?? "")
    )

    const clientRows = await db
      .select({ id: clients.id, slug: clients.slug })
      .from(clients)
      .where(inArray(clients.slug, Object.values(CLIENT_SLUG)))
    const clientId = new Map(clientRows.map((c) => [c.slug, c.id]))

    const retainerRows = await db
      .select({ id: retainers.id, clientId: retainers.clientId, status: retainers.status })
      .from(retainers)
    const retainerFor = new Map<string, string>()
    for (const r of retainerRows) {
      if (r.status === "active" && !retainerFor.has(r.clientId)) retainerFor.set(r.clientId, r.id)
    }

    let synced = 0
    let skipped = 0
    const planned: Plan[] = []

    for (const row of mine) {
      for (const plan of plans(row, permalink)) {
        const cid = clientId.get(CLIENT_SLUG[plan.clientKey])
        if (!cid) {
          skipped++
          continue
        }
        planned.push(plan)
        if (options.dryRun) {
          synced++
          continue
        }
        const values = {
          clientId: cid,
          retainerId: retainerFor.get(cid) ?? null,
          name: plan.name,
          slug: plan.slug,
          status: plan.status,
          links: plan.links,
          notes: plan.notes,
          source: TRACKER_SOURCE,
          externalId: plan.externalId,
          sourceStatus: plan.sourceStatus,
          completedAt: plan.completedAt,
          updatedAt: plan.updatedAt,
        }
        const [project] = await db
          .insert(projects)
          .values(values)
          .onConflictDoUpdate({
            target: [projects.source, projects.externalId],
            // Slug is left alone on update so any link already shared keeps
            // working even if the row gets retitled upstream.
            set: {
              clientId: values.clientId,
              retainerId: values.retainerId,
              name: values.name,
              status: values.status,
              links: values.links,
              notes: values.notes,
              sourceStatus: values.sourceStatus,
              completedAt: values.completedAt,
              updatedAt: values.updatedAt,
            },
          })
          .returning({ id: projects.id })

        // The tracker's due date has nowhere to live on a project, so it rides
        // on a single deliverable — which is also what makes it show up as
        // overdue in the ledger. Deterministic id: re-syncing updates this one
        // and leaves anything added here by hand alone.
        if (project && plan.dueOn) {
          const dId = derivedId(`tracker-deliverable:${plan.externalId}`)
          const dValues = {
            id: dId,
            projectId: project.id,
            label: "Tracker",
            title: plan.name,
            status: (plan.status === "complete" ? "done" : "pending") as "done" | "pending",
            dueOn: plan.dueOn,
          }
          await db
            .insert(deliverables)
            .values(dValues)
            .onConflictDoUpdate({
              target: deliverables.id,
              set: {
                title: dValues.title,
                status: dValues.status,
                dueOn: dValues.dueOn,
              },
            })
        }
        synced++
      }
    }

    if (!options.dryRun) await saveTrackerConfig({ lastSyncAt: new Date().toISOString() })
    return { ok: true, synced, skipped, planned }
  } catch (err) {
    return {
      ok: false,
      synced: 0,
      skipped: 0,
      error: err instanceof Error ? err.message : "Tracker sync failed.",
    }
  }
}

/* ---------------------------------------------------------------- write-back */

type WriteResult = { ok: boolean; wrote?: string[]; skipped?: string; error?: string }

async function trackerColumns(sheetId: string) {
  const cols =
    (await smartsheetApi(`/sheets/${sheetId}/columns?level=2&pageSize=100`)).data ?? []
  const find = (re: RegExp) =>
    cols.find((c: { title?: string }) => re.test(String(c.title ?? ""))) ?? null
  return {
    status: find(COLUMNS.status),
    completedOn: find(COLUMNS.completedOn),
    notes: find(COLUMNS.notes),
  }
}

/**
 * Push the three cells we own back to the row: Status, Completed Date, and a
 * dated line appended to Notes. Everything else on that row belongs to the
 * client and is never written.
 *
 * Notes is append-only on purpose — it is a shared cell holding the client's
 * own commentary, so the existing text is read and preserved rather than
 * replaced.
 */
export async function writeTrackerRowBack(
  projectId: string,
  note?: string
): Promise<WriteResult> {
  try {
    const config = await getTrackerConfig()
    if (!config.sheetId || !smartsheetTokenPresent()) return { ok: true, skipped: "not configured" }
    if (!config.writeBack) return { ok: true, skipped: "write-back is off" }

    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) })
    if (!project) return { ok: true, skipped: "no project" }
    if (project.source !== TRACKER_SOURCE || !project.externalId)
      return { ok: true, skipped: "not a tracker project" }
    // The mirrored half of an "ML & ZV" row. One row, one author.
    if (project.externalId.includes("#"))
      return { ok: true, skipped: "mirror copy — Mineralife owns this row" }

    const cols = await trackerColumns(config.sheetId)
    const cells: Record<string, unknown>[] = []
    const wrote: string[] = []

    // Only write Status if it actually moved here. Our enum is narrower than
    // the sheet's picklist, so re-writing an unchanged row would quietly
    // rename the client's "Needs Review" to "In Progress".
    if (cols.status && inboundStatus(project.sourceStatus) !== project.status) {
      cells.push({ columnId: cols.status.id, value: STATUS_OUT[project.status], strict: false })
      wrote.push("Status")
    }

    if (cols.completedOn && project.status === "complete") {
      const on = (project.completedAt ?? new Date()).toISOString().slice(0, 10)
      cells.push({ columnId: cols.completedOn.id, value: on, strict: false })
      wrote.push("Completed Date")
    }

    const text = (note ?? "").trim()
    if (cols.notes && text) {
      const row = await smartsheetApi(
        `/sheets/${config.sheetId}/rows/${project.externalId}`
      )
      const cell = (row.cells ?? []).find(
        (c: { columnId: number }) => c.columnId === cols.notes.id
      )
      const existing = String(cell?.value ?? "").trim()
      const today = new Date().toISOString().slice(0, 10)
      const line = `[${today}] ${text}`
      cells.push({
        columnId: cols.notes.id,
        value: existing ? `${existing}\n${line}` : line,
        strict: false,
      })
      wrote.push("Notes")
    }

    if (cells.length === 0) return { ok: true, skipped: "nothing to write" }

    await smartsheetApi(`/sheets/${config.sheetId}/rows`, {
      method: "PUT",
      body: JSON.stringify([{ id: Number(project.externalId), cells }]),
    })

    // Keep our record of the sheet's status in step, so the next save does not
    // write the same change twice.
    if (wrote.includes("Status")) {
      await db
        .update(projects)
        .set({ sourceStatus: STATUS_OUT[project.status] })
        .where(and(eq(projects.id, projectId), eq(projects.source, TRACKER_SOURCE)))
    }
    return { ok: true, wrote }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tracker write failed." }
  }
}
