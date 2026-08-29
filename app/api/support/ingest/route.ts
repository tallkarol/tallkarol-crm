import { and, eq, or } from "drizzle-orm"
import { NextRequest, NextResponse } from "next/server"
import { db } from "@/db"
import {
  clients,
  supportTickets,
  ticketAttachments,
  ticketPayloads,
  type AppSource,
} from "@/db/schema"
import { authenticateApp } from "@/lib/app-source"
import { logEvent } from "@/lib/monitors"
import { PRIORITIES, TICKET_STATES, ticketPriority } from "@/lib/support"
import { appendMessage, attachPayloads, createTicket, type PayloadInput } from "@/lib/tickets"

/**
 * Tickets from the things we maintain: an app's error handler, a site's
 * "report a problem" form, a monitor, or a maintenance agent that audited
 * something and wants it on the board. Smartsheet stays a source, not the source.
 *
 *   POST /api/support/ingest
 *   Authorization: Bearer tk_<app>_<secret>     ← preferred: identifies the client
 *                  Bearer $SUPPORT_INGEST_SECRET ← shared key, client in the body
 *
 * Accepts JSON, or multipart/form-data when there are screenshots to carry.
 * Send `externalId` to make the call idempotent — the same id updates the same
 * ticket instead of opening a second one.
 */

export const dynamic = "force-dynamic"

const MAX_ATTACHMENTS = 3
const MAX_ATTACHMENT_BYTES = 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 3 * 1024 * 1024
const KINDS = ["incident", "request", "question"] as const
type Kind = (typeof KINDS)[number]

/** The widget's categories, in our words. */
const CATEGORY_KIND: Record<string, Kind> = {
  bug: "incident",
  question: "question",
  feedback: "request",
  other: "request",
  incident: "incident",
  request: "request",
}

function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function str(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : ""
}

type Attachment = { name: string; mime: string; bytes: number; data: Buffer }

/** JSON body, or the multipart form the Artist House widget already builds. */
async function readBody(request: NextRequest): Promise<{
  fields: Record<string, unknown>
  attachments: Attachment[]
} | null> {
  const type = request.headers.get("content-type") || ""
  if (!type.includes("multipart/form-data")) {
    try {
      return { fields: (await request.json()) as Record<string, unknown>, attachments: [] }
    } catch {
      return null
    }
  }

  const form = await request.formData()
  const fields: Record<string, unknown> = {}
  const attachments: Attachment[] = []
  let total = 0

  for (const [key, value] of Array.from(form.entries())) {
    if (typeof value === "string") {
      if (key === "tags" || key === "payloads" || key === "env") {
        try {
          fields[key] = JSON.parse(value)
          continue
        } catch {
          /* fall through to the raw string */
        }
      }
      fields[key] = value
      continue
    }
    if (attachments.length >= MAX_ATTACHMENTS) continue
    if (value.size <= 0 || value.size > MAX_ATTACHMENT_BYTES) continue
    if (total + value.size > MAX_TOTAL_ATTACHMENT_BYTES) continue
    total += value.size
    attachments.push({
      name: value.name.slice(0, 200) || "attachment",
      mime: value.type || "application/octet-stream",
      bytes: value.size,
      data: Buffer.from(await value.arrayBuffer()),
    })
  }
  return { fields, attachments }
}

/** Base64 attachments for callers that would rather send JSON. */
function jsonAttachments(input: unknown): Attachment[] {
  if (!Array.isArray(input)) return []
  const out: Attachment[] = []
  let total = 0
  for (const raw of input.slice(0, MAX_ATTACHMENTS)) {
    const item = raw as Record<string, unknown>
    const b64 = typeof item.dataBase64 === "string" ? item.dataBase64 : ""
    if (!b64) continue
    const data = Buffer.from(b64, "base64")
    if (!data.length || data.length > MAX_ATTACHMENT_BYTES) continue
    if (total + data.length > MAX_TOTAL_ATTACHMENT_BYTES) continue
    total += data.length
    out.push({
      name: str(item.name, 200) || "attachment",
      mime: str(item.mime, 100) || "application/octet-stream",
      bytes: data.length,
      data,
    })
  }
  return out
}

export async function POST(request: NextRequest) {
  /* Two ways in: an app key, which carries the client with it, or the shared
     secret, where the body has to say who it's for. */
  const header = request.headers.get("authorization") || ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  let source: AppSource | null = null

  if (token.startsWith("tk_")) {
    const auth = await authenticateApp(request, "tickets")
    if (!auth.ok) return bad(auth.error, auth.status)
    source = auth.source
  } else {
    const secret = process.env.SUPPORT_INGEST_SECRET || process.env.INGEST_SECRET
    if (!secret) {
      console.error("SUPPORT_INGEST_SECRET / INGEST_SECRET is not set")
      return bad("Ingest not configured", 500)
    }
    if (!token || token !== secret) return bad("Unauthorized", 401)
  }

  const parsed = await readBody(request)
  if (!parsed) return bad("Body must be JSON or multipart/form-data")
  const { fields } = parsed
  const attachments = parsed.attachments.length
    ? parsed.attachments
    : jsonAttachments(fields.attachments)

  const title = str(fields.title ?? fields.subject, 300)
  if (!title) return bad("A title is required")

  /* The key decides the client when there is one — a payload can't reassign
     itself to someone else's account. */
  let clientId: string | null = source?.clientId ?? null
  let clientSlug: string | null = null
  if (source?.clientId) {
    const row = await db.query.clients.findFirst({
      where: eq(clients.id, source.clientId),
      columns: { slug: true },
    })
    clientSlug = row?.slug ?? null
  } else {
    const ref = str(fields.client, 120) || str(fields.clientId, 120)
    if (ref) {
      const match = await db.query.clients.findFirst({
        where: or(
          eq(clients.slug, ref.toLowerCase()),
          eq(clients.name, ref),
          ...(/^[0-9a-f-]{36}$/i.test(ref) ? [eq(clients.id, ref)] : [])
        ),
        columns: { id: true, slug: true },
      })
      if (!match) return bad(`No client matches "${ref}"`)
      clientId = match.id
      clientSlug = match.slug
    }
  }

  const category = str(fields.category, 40).toLowerCase()
  const kindInput = str(fields.kind, 40).toLowerCase()
  const kind: Kind =
    (KINDS as readonly string[]).includes(kindInput)
      ? (kindInput as Kind)
      : (CATEGORY_KIND[category] ?? "incident")

  const priorityInput = str(fields.priority, 20).toLowerCase()
  const priority = (PRIORITIES as readonly string[]).includes(priorityInput)
    ? priorityInput
    : kind === "request"
      ? "normal"
      : ticketPriority(priorityInput)

  const stateInput = str(fields.state, 20).toLowerCase()
  const state = (TICKET_STATES as readonly string[]).includes(stateInput) ? stateInput : "open"

  const sourceName = str(fields.source, 40).toLowerCase() || source?.slug || "app"
  const externalId = str(fields.externalId, 200) || `${sourceName}:${crypto.randomUUID()}`

  const tags = Array.isArray(fields.tags)
    ? (fields.tags as unknown[]).map((t) => str(t, 40)).filter(Boolean).slice(0, 8)
    : []

  const env =
    fields.env && typeof fields.env === "object" && !Array.isArray(fields.env)
      ? (fields.env as Record<string, unknown>)
      : {}
  const raw: Record<string, unknown> = { env }
  const url = str(fields.url ?? fields.pageUrl, 500)
  if (url) raw.url = url
  if (str(fields.userAgent, 300)) raw.userAgent = str(fields.userAgent, 300)

  /* An `error` object is the common case from an app — accept it as a payload
     so callers don't have to build the payload array themselves. */
  const payloads: PayloadInput[] = Array.isArray(fields.payloads)
    ? (fields.payloads as PayloadInput[])
    : []
  if (fields.error != null) {
    payloads.unshift({
      label: "Error",
      lang: typeof fields.error === "string" ? undefined : "json",
      body:
        typeof fields.error === "string"
          ? fields.error
          : JSON.stringify(fields.error, null, 2),
    })
  }

  try {
    const existing = await db.query.supportTickets.findFirst({
      where: and(
        eq(supportTickets.source, sourceName),
        eq(supportTickets.externalId, externalId)
      ),
      columns: { id: true, number: true },
    })

    const description = str(fields.description ?? fields.message, 20000)
    let ticketId: string
    let number: string

    if (existing) {
      await db
        .update(supportTickets)
        .set({
          title,
          kind,
          priority,
          status: state,
          state,
          description,
          tags,
          raw,
          platform: str(fields.platform, 60) || source?.platform || "",
          updatedAt: new Date(),
        })
        .where(eq(supportTickets.id, existing.id))
      ticketId = existing.id
      number = existing.number
      // Re-post replaces the payload set — the newest capture is the true one.
      await db.delete(ticketPayloads).where(eq(ticketPayloads.ticketId, ticketId))
    } else {
      const ticket = await createTicket({
        source: sourceName,
        externalId,
        clientId,
        clientSlug,
        sourceId: source?.id ?? null,
        title,
        description,
        kind,
        priority,
        state,
        platform: str(fields.platform, 60) || source?.platform || "",
        submittedBy: str(fields.submittedBy, 200),
        contactEmail: str(fields.contactEmail ?? fields.replyToEmail, 200),
        tags,
        raw,
      })
      ticketId = ticket.id
      number = ticket.number
    }

    if (payloads.length) await attachPayloads(ticketId, payloads)

    if (attachments.length) {
      await db.insert(ticketAttachments).values(
        attachments.map((a) => ({
          ticketId,
          name: a.name,
          mime: a.mime,
          bytes: a.bytes,
          data: a.data,
        }))
      )
    }

    const message = str(fields.message, 20000)
    if (message && !existing && message !== description) {
      await appendMessage({
        ticketId,
        role:
          sourceName === "monitor" || sourceName === "sentry" || sourceName === "uptime"
            ? "bot"
            : "client",
        author: str(fields.submittedBy, 200) || sourceName,
        authorEmail: str(fields.contactEmail ?? fields.replyToEmail, 200),
        body: message,
      })
    }

    if (source) {
      await logEvent({
        sourceId: source.id,
        clientId: source.clientId,
        kind: existing ? "ticket.updated" : "ticket.opened",
        severity: kind === "incident" ? "warn" : "info",
        actor: str(fields.submittedBy, 200) || str(fields.contactEmail ?? fields.replyToEmail, 200),
        summary: `${number} · ${title}`,
        meta: { kind, ticketId },
      })
    }

    const appUrl = process.env.APP_URL || "https://crm.tallkarol.com"
    return NextResponse.json({
      ok: true,
      id: ticketId,
      number,
      kind,
      url: `${appUrl}/support/${number}`,
      created: !existing,
      payloads: payloads.length,
      attachments: attachments.length,
    })
  } catch (err) {
    console.error("support ingest error:", err)
    return bad("Internal server error", 500)
  }
}
