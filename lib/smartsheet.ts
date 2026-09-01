import { eq, sql } from "drizzle-orm"
import { db } from "@/db"
import { appSettings, supportTickets } from "@/db/schema"

const API = "https://api.smartsheet.com/2.0"
const CONFIG_KEY = "smartsheet_support"

export type SmartsheetConfig = {
  sheetId: string
  clientId: string | null
  webhookId: string | null
  lastSyncAt: string | null
}

function token() {
  return process.env.SMARTSHEET_ACCESS_TOKEN || process.env.SMARTSHEET_API_KEY || ""
}

export function smartsheetTokenPresent() {
  return Boolean(token())
}

export async function getSmartsheetConfig(): Promise<SmartsheetConfig> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, CONFIG_KEY),
  })
  const v = (row?.value ?? {}) as Partial<SmartsheetConfig>
  return {
    sheetId: typeof v.sheetId === "string" ? v.sheetId : "",
    clientId: typeof v.clientId === "string" && v.clientId ? v.clientId : null,
    webhookId: typeof v.webhookId === "string" && v.webhookId ? v.webhookId : null,
    lastSyncAt: typeof v.lastSyncAt === "string" ? v.lastSyncAt : null,
  }
}

export async function saveSmartsheetConfig(patch: Partial<SmartsheetConfig>) {
  const current = await getSmartsheetConfig()
  const next = { ...current, ...patch }
  await db
    .insert(appSettings)
    .values({ key: CONFIG_KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedAt: new Date() } })
  return next
}

async function api(path: string, init?: RequestInit) {
  const key = token()
  if (!key) throw new Error("SMARTSHEET_ACCESS_TOKEN / SMARTSHEET_API_KEY is not set")
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`Smartsheet ${res.status} on ${path}${body ? ` — ${body.slice(0, 200)}` : ""}`)
  }
  return res.json()
}

/** Same credentials, same base URL — the tracker sync calls through this too. */
export { api as smartsheetApi }

/* Column-title → ticket-field mapping, tolerant of exact sheet wording. */
const FIELD_PATTERNS: [keyof TicketFields, RegExp][] = [
  ["number", /ticket number/i],
  ["priority", /^priority/i],
  ["dueOn", /due date/i],
  ["submittedBy", /submitted by/i],
  ["submittedOn", /submission date/i],
  ["department", /department/i],
  ["title", /title of request/i],
  ["status", /^status/i],
  ["resolution", /final resolution/i],
  ["contactEmail", /follow.?up contact email/i],
  ["requestType", /request type/i],
  ["description", /detailed description/i],
  ["customerContact", /customer contact/i],
  ["completed", /^completed/i],
]

type TicketFields = {
  number: string
  priority: string
  dueOn: string | null
  submittedBy: string
  submittedOn: string | null
  department: string
  title: string
  status: string
  resolution: string
  contactEmail: string
  requestType: string
  description: string
  customerContact: string
  completed: boolean
}

function toDate(value: unknown): string | null {
  if (typeof value !== "string") return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(value)
  if (us) {
    const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3])
    return `${year}-${String(us[1]).padStart(2, "0")}-${String(us[2]).padStart(2, "0")}`
  }
  return null
}

/** Pull the whole sheet and upsert every row. Sheets this size sync in one call. */
export async function syncSupportTickets(): Promise<{ ok: boolean; synced: number; error?: string }> {
  try {
    const config = await getSmartsheetConfig()
    if (!config.sheetId) return { ok: false, synced: 0, error: "No sheet ID configured yet." }

    const sheet = await api(`/sheets/${config.sheetId}`)
    const colField = new Map<number, keyof TicketFields>()
    for (const col of sheet.columns ?? []) {
      const hit = FIELD_PATTERNS.find(([, pattern]) => pattern.test(String(col.title ?? "")))
      if (hit) colField.set(col.id, hit[0])
    }

    let synced = 0
    for (const row of sheet.rows ?? []) {
      const fields: Partial<TicketFields> = {}
      for (const cell of row.cells ?? []) {
        const field = colField.get(cell.columnId)
        if (!field) continue
        const value = cell.value ?? cell.displayValue ?? ""
        if (field === "completed") fields.completed = value === true || value === "true"
        else if (field === "dueOn" || field === "submittedOn")
          fields[field] = toDate(value)
        else (fields as Record<string, unknown>)[field] = String(value ?? "").trim()
      }
      // Skip rows with nothing recognizable (formatting/spacer rows).
      if (!fields.number && !fields.title && !fields.description) continue

      const values = {
        source: "smartsheet",
        externalId: String(row.id),
        number: fields.number ?? "",
        title: fields.title ?? "",
        status: fields.status ?? "",
        priority: fields.priority ?? "",
        requestType: fields.requestType ?? "",
        department: fields.department ?? "",
        submittedBy: fields.submittedBy ?? "",
        submittedOn: fields.submittedOn ?? null,
        dueOn: fields.dueOn ?? null,
        description: fields.description ?? "",
        resolution: fields.resolution ?? "",
        contactEmail: fields.contactEmail ?? "",
        customerContact: fields.customerContact ?? "",
        completed: fields.completed ?? false,
        clientId: config.clientId,
        raw: { rowNumber: row.rowNumber },
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      }
      await db
        .insert(supportTickets)
        .values(values)
        .onConflictDoUpdate({
          target: [supportTickets.source, supportTickets.externalId],
          set: {
            ...values,
            // A state moved by hand in the CRM sticks until the sheet itself
            // says something different — then the sheet wins again.
            state: sql`case when ${supportTickets.status} is distinct from ${values.status}
              then '' else ${supportTickets.state} end`,
          },
        })
      synced++
    }
    await saveSmartsheetConfig({ lastSyncAt: new Date().toISOString() })
    return { ok: true, synced }
  } catch (err) {
    return { ok: false, synced: 0, error: err instanceof Error ? err.message : "Sync failed." }
  }
}

/**
 * Register + enable the sheet webhook so new rows land here within seconds.
 * Enabling triggers Smartsheet's challenge against /api/smartsheet/webhook,
 * which the route answers automatically.
 */
export async function enableSmartsheetWebhook(): Promise<{ ok: boolean; error?: string }> {
  try {
    const config = await getSmartsheetConfig()
    if (!config.sheetId) return { ok: false, error: "Configure the sheet ID first." }
    const appUrl = process.env.APP_URL || "https://crm.tallkarol.com"
    if (!appUrl.startsWith("https://"))
      return { ok: false, error: "Webhooks need the public HTTPS URL — enable from production." }

    let webhookId = config.webhookId
    if (!webhookId) {
      const created = await api("/webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: "TK CRM support tickets",
          callbackUrl: `${appUrl}/api/smartsheet/webhook`,
          scope: "sheet",
          scopeObjectId: Number(config.sheetId),
          events: ["*.*"],
          version: 1,
        }),
      })
      webhookId = String(created.result.id)
      await saveSmartsheetConfig({ webhookId })
    }
    await api(`/webhooks/${webhookId}`, {
      method: "PUT",
      body: JSON.stringify({ enabled: true }),
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Webhook setup failed." }
  }
}

/* ------------------------------------------------------------ write-back */

const WRITEBACK_PATTERNS: [string, RegExp][] = [
  ["status", /^status/i],
  ["completed", /^completed/i],
  ["resolution", /final resolution/i],
  ["assignee", /^assigned to/i],
  ["followUpNotes", /follow.?up notes/i],
]

/** CRM triage state → the sheet's own Status picklist wording. */
const STATE_TO_SHEET: Record<string, string> = {
  open: "New",
  progress: "In Progress",
  waiting: "Waiting for Information",
  closed: "Closed",
}

/**
 * Push the CRM-owned fields of one ticket back to its Smartsheet row:
 * Status, Completed, Final Resolution, Assigned To, Follow-Up Notes.
 * Everything submitters own (title, description, priority, contacts) is
 * never written. The webhook echo re-reads what we wrote — idempotent.
 */
export async function writeTicketBack(ticketId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const config = await getSmartsheetConfig()
    if (!config.sheetId || !smartsheetTokenPresent()) return { ok: true } // nothing to sync to

    const { supportTickets, ticketMessages } = await import("@/db/schema")
    const { eq: eqOp, and: andOp, asc } = await import("drizzle-orm")
    const ticket = await db.query.supportTickets.findFirst({
      where: eqOp(supportTickets.id, ticketId),
    })
    if (!ticket || ticket.source !== "smartsheet" || !ticket.externalId) return { ok: true }

    const notes = await db
      .select()
      .from(ticketMessages)
      .where(andOp(eqOp(ticketMessages.ticketId, ticketId), eqOp(ticketMessages.role, "me")))
      .orderBy(asc(ticketMessages.sentAt))
    let followUp = notes
      .map((n) => {
        const d = n.sentAt
        return `${d.getMonth() + 1}/${d.getDate()}: ${n.body}`
      })
      .join("\n")
    while (followUp.length > 3800 && notes.length) {
      followUp = followUp.slice(followUp.indexOf("\n") + 1) // drop oldest lines first
    }

    // level=2 exposes real column types (contact columns masquerade as TEXT_NUMBER at level 0)
    const cols = (await api(`/sheets/${config.sheetId}/columns?level=2&pageSize=100`)).data ?? []
    const findCol = (key: string) => {
      const pattern = WRITEBACK_PATTERNS.find(([k]) => k === key)?.[1]
      return pattern
        ? (cols.find((c: { title?: string }) => pattern.test(String(c.title ?? ""))) ?? null)
        : null
    }

    const state = (ticket.state && STATE_TO_SHEET[ticket.state]) || null
    const cells: Record<string, unknown>[] = []
    const push = (key: string, value: unknown) => {
      const col = findCol(key)
      if (!col) return
      // Contact columns (e.g. Assigned To) reject plain strings.
      if (String(col.type).includes("CONTACT") && typeof value === "string" && value) {
        const contact: Record<string, string> = { objectType: "CONTACT", name: value }
        if (/karol/i.test(value)) contact.email = "kbuczek@mineralifeonline.com"
        cells.push({ columnId: col.id, objectValue: contact, strict: false })
        return
      }
      cells.push({ columnId: col.id, value, strict: false })
    }
    if (state) push("status", state)
    push("completed", ticket.completed)
    push("resolution", ticket.resolution ?? "")
    push("assignee", ticket.assignee || "Karol Buczek")
    if (notes.length) push("followUpNotes", followUp)
    if (cells.length === 0) return { ok: true }

    await api(`/sheets/${config.sheetId}/rows`, {
      method: "PUT",
      body: JSON.stringify([{ id: Number(ticket.externalId), cells }]),
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Smartsheet write failed." }
  }
}
