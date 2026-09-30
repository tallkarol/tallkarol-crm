import { sql, type SQL } from "drizzle-orm"
import { db } from "@/db"
import { readDocHtml } from "@/lib/docs"
import { ROUTES } from "@/lib/nav"

/**
 * One search over everything the CRM has written down: meeting notes and
 * their transcripts, proposals, reports and worksheets (bodies read from
 * content/docs), contracts, tickets and their threads, mail, tasks, punch
 * lists, brainstorm notes, invoices, time entries, past chats, agent sessions,
 * Notion, the calendar, leads, expenses, clients, projects and deliverables.
 *
 * Deliberately left out: the vault, users and auth tables, device tokens, and
 * private chat threads (the coach's). Nothing here writes.
 *
 * Matching is plain and predictable: every term must appear somewhere in the
 * record (case-insensitive substring), so slugs, invoice numbers and half a
 * name all work. Hits come back newest first. The data is small enough that a
 * scan per kind is faster than keeping a search index honest.
 */

export const SEARCH_KINDS = [
  "meeting",
  "meeting_item",
  "proposal",
  "report",
  "worksheet",
  "contract",
  "brainstorm",
  "ticket",
  "mail",
  "task",
  "punchlist",
  "chat",
  "session",
  "leftoff",
  "invoice",
  "time",
  "deliverable",
  "project",
  "product",
  "client",
  "site",
  "calendar",
  "inquiry",
  "expense",
  "notion",
  "notion_item",
  "codebase_doc",
  "inspiration",
] as const

export type SearchKind = (typeof SEARCH_KINDS)[number]

export type SearchHit = {
  kind: SearchKind
  id: string
  title: string
  client: string | null
  at: string | null
  snippet: string
  href?: string
}

/**
 * A table the scan reads. Fragments are constants written here, never user
 * input — terms and filters always travel as bound parameters.
 */
type Source = {
  table: string
  from: string
  id: string
  title: string
  text: string[]
  clientId: string | null
  at: string
  where?: string
}

const SOURCES: Record<Exclude<SearchKind, "proposal" | "report" | "worksheet">, Source> = {
  meeting: {
    table: "meeting_notes",
    from: "meeting_notes",
    id: "meeting_notes.id",
    title: "meeting_notes.title",
    text: ["meeting_notes.title", "meeting_notes.summary", "meeting_notes.analysis::text", "meeting_notes.transcript_text"],
    clientId: "meeting_notes.client_id",
    at: "coalesce(meeting_notes.started_at, meeting_notes.created_at)",
  },
  meeting_item: {
    table: "meeting_note_items",
    from: "meeting_note_items join meeting_notes on meeting_notes.id = meeting_note_items.note_id",
    id: "meeting_note_items.id",
    title: "meeting_note_items.kind || ': ' || meeting_note_items.title",
    text: ["meeting_note_items.title", "meeting_note_items.detail", "meeting_note_items.quote", "meeting_note_items.owner"],
    clientId: "meeting_notes.client_id",
    at: "coalesce(meeting_notes.started_at, meeting_note_items.created_at)",
  },
  contract: {
    table: "contracts",
    from: "contracts",
    id: "contracts.id",
    title: "contracts.title",
    text: ["contracts.title", "contracts.slug", "contracts.counterparty", "contracts.governing_law", "contracts.venue", "contracts.notes", "contracts.terms::text"],
    clientId: "contracts.client_id",
    at: "coalesce(contracts.effective_on::timestamptz, contracts.updated_at)",
  },
  brainstorm: {
    table: "brainstorm_notes",
    from: "brainstorm_notes",
    id: "brainstorm_notes.id",
    title: "coalesce(nullif(brainstorm_notes.topic, ''), left(brainstorm_notes.body, 80))",
    text: ["brainstorm_notes.topic", "brainstorm_notes.body"],
    clientId: "brainstorm_notes.client_id",
    at: "brainstorm_notes.created_at",
  },
  ticket: {
    table: "support_tickets",
    from: "support_tickets",
    id: "support_tickets.id",
    title: "concat_ws(' ', support_tickets.number, support_tickets.title)",
    text: [
      "support_tickets.number",
      "support_tickets.title",
      "support_tickets.description",
      "support_tickets.resolution",
      "support_tickets.submitted_by",
      "support_tickets.contact_email",
      "(select string_agg(m.body, ' ') from ticket_messages m where m.ticket_id = support_tickets.id)",
    ],
    clientId: "support_tickets.client_id",
    at: "coalesce(support_tickets.submitted_on::timestamptz, support_tickets.created_at)",
  },
  mail: {
    table: "inbox_mail",
    from: "inbox_mail",
    id: "inbox_mail.id",
    title: "coalesce(nullif(inbox_mail.subject, ''), '(no subject)')",
    text: ["inbox_mail.subject", "inbox_mail.from_name", "inbox_mail.from_email", "inbox_mail.to_email", "inbox_mail.body"],
    clientId: "inbox_mail.client_id",
    at: "inbox_mail.received_at",
  },
  task: {
    table: "tasks",
    from: "tasks",
    id: "tasks.id",
    title: "tasks.title || case when tasks.status = 'done' then ' (done)' else '' end",
    text: ["tasks.title", "tasks.notes", "array_to_string(tasks.labels, ' ')"],
    clientId: "tasks.client_id",
    at: "tasks.updated_at",
  },
  punchlist: {
    table: "punchlists",
    from: "punchlists",
    id: "punchlists.id",
    title: "punchlists.title",
    text: [
      "punchlists.title",
      "punchlists.intro",
      "punchlists.source_text",
      "(select string_agg(concat_ws(' ', i.title, i.reported, i.outcome), ' ') from punchlist_items i where i.punchlist_id = punchlists.id)",
    ],
    clientId: "punchlists.client_id",
    at: "punchlists.updated_at",
  },
  chat: {
    table: "chat_messages",
    from: "chat_messages join chat_threads on chat_threads.id = chat_messages.thread_id",
    id: "chat_messages.id",
    title: "coalesce(nullif(chat_threads.title, ''), 'Chat') || ' — ' || chat_messages.agent",
    text: ["chat_messages.body"],
    clientId: "chat_threads.client_id",
    at: "chat_messages.created_at",
    where: "not chat_threads.private",
  },
  session: {
    table: "agent_sessions",
    from: "agent_sessions",
    id: "agent_sessions.session_ref",
    title: "coalesce(nullif(agent_sessions.name, ''), agent_sessions.session_ref)",
    text: ["agent_sessions.name", "agent_sessions.summary", "agent_sessions.highlights::text", "agent_sessions.cwd", "agent_sessions.files_touched::text"],
    clientId: "agent_sessions.client_id",
    at: "coalesce(agent_sessions.started_at, agent_sessions.created_at)",
  },
  leftoff: {
    table: "session_notes",
    from: "session_notes",
    id: "session_notes.id",
    title: "coalesce(nullif(session_notes.title, ''), session_notes.session_ref)",
    text: ["session_notes.title", "session_notes.body", "session_notes.last_prompt", "session_notes.last_reply", "session_notes.blocked_on", "session_notes.reply"],
    clientId: "session_notes.client_id",
    at: "session_notes.event_at",
  },
  invoice: {
    table: "invoices",
    from: "invoices",
    id: "invoices.id",
    title: "invoices.number || ' (' || invoices.status || ')'",
    text: ["invoices.number", "invoices.bill_to", "invoices.description", "invoices.notes"],
    clientId: "invoices.client_id",
    at: "invoices.issued_on::timestamptz",
  },
  time: {
    table: "time_entries",
    from: "time_entries",
    id: "time_entries.id",
    title: "time_entries.occurred_on::text || ' · ' || time_entries.hours::text || ' h'",
    text: ["time_entries.summary"],
    clientId: "time_entries.client_id",
    at: "time_entries.occurred_on::timestamptz",
  },
  deliverable: {
    table: "deliverables",
    from: "deliverables join projects on projects.id = deliverables.project_id",
    id: "deliverables.id",
    title: "projects.name || ' · ' || deliverables.label || coalesce(' — ' || nullif(deliverables.title, ''), '') || ' (' || deliverables.status || ')'",
    text: ["deliverables.label", "deliverables.title", "projects.name"],
    clientId: "projects.client_id",
    at: "coalesce(deliverables.due_on::timestamptz, projects.updated_at)",
  },
  project: {
    table: "projects",
    from: "projects",
    id: "projects.id",
    title: "projects.name",
    text: ["projects.name", "projects.slug", "projects.notes", "projects.links::text"],
    clientId: "projects.client_id",
    at: "projects.updated_at",
  },
  product: {
    table: "products",
    from: "products",
    id: "products.id",
    title: "products.name",
    text: ["products.name", "products.slug", "products.tagline", "products.notes"],
    clientId: "products.client_id",
    at: "products.updated_at",
  },
  client: {
    table: "clients",
    from: "clients",
    id: "clients.id",
    title: "clients.name",
    text: ["clients.name", "clients.slug", "array_to_string(clients.domains, ' ')", "clients.notes", "clients.billing::text"],
    clientId: "clients.id",
    at: "clients.updated_at",
  },
  site: {
    table: "sites",
    from: "sites",
    id: "sites.id",
    title: "sites.name",
    text: ["sites.name", "sites.slug", "sites.origin"],
    clientId: "sites.client_id",
    at: "sites.updated_at",
  },
  calendar: {
    table: "calendar_events",
    from: "calendar_events",
    id: "calendar_events.id",
    title: "calendar_events.title",
    text: ["calendar_events.title", "calendar_events.description", "calendar_events.location", "calendar_events.attendees::text"],
    clientId: "calendar_events.client_id",
    at: "calendar_events.starts_at",
    where: "not calendar_events.cancelled",
  },
  inquiry: {
    table: "inquiries",
    from: "inquiries",
    id: "inquiries.id",
    title: "concat_ws(' · ', inquiries.name, nullif(inquiries.company, ''))",
    text: ["inquiries.name", "inquiries.email", "inquiries.company", "array_to_string(inquiries.project_types, ' ')", "inquiries.payload::text"],
    clientId: null,
    at: "inquiries.created_at",
  },
  expense: {
    table: "expenses",
    from: "expenses",
    id: "expenses.id",
    title: "concat_ws(' · ', expenses.vendor, nullif(expenses.description, ''))",
    text: ["expenses.vendor", "expenses.description", "expenses.category"],
    clientId: "expenses.client_id",
    at: "expenses.occurred_on::timestamptz",
  },
  notion: {
    table: "notion_pages",
    from: "notion_pages",
    id: "notion_pages.id",
    title: "notion_pages.title",
    text: ["notion_pages.title", "notion_pages.plain_text"],
    clientId: null,
    at: "coalesce(notion_pages.notion_edited_at, notion_pages.synced_at)",
    where: "not notion_pages.archived",
  },
  notion_item: {
    table: "notion_proposals",
    from: "notion_proposals",
    id: "notion_proposals.id",
    title: "notion_proposals.title",
    text: ["notion_proposals.title", "notion_proposals.detail", "notion_proposals.quote"],
    clientId: null,
    at: "notion_proposals.created_at",
  },
  codebase_doc: {
    table: "codebase_docs",
    from: "codebase_docs",
    id: "codebase_docs.id",
    title: "codebase_docs.codebase || ' · ' || codebase_docs.title",
    text: ["codebase_docs.codebase", "codebase_docs.kind", "codebase_docs.title", "codebase_docs.summary", "codebase_docs.data::text"],
    clientId: "codebase_docs.client_id",
    at: "coalesce(codebase_docs.generated_at, codebase_docs.created_at)",
  },
  inspiration: {
    table: "inspiration_pins",
    from: "inspiration_pins",
    id: "inspiration_pins.id",
    title: "coalesce(nullif(inspiration_pins.title, ''), inspiration_pins.url)",
    text: ["inspiration_pins.title", "inspiration_pins.note", "inspiration_pins.description", "inspiration_pins.url", "inspiration_pins.site_name"],
    clientId: null,
    at: "inspiration_pins.created_at",
  },
}

/** Documents whose body is an HTML file under content/docs. */
const DOC_TABLES = {
  proposal: { table: "proposals", extra: "series", href: ROUTES.proposalDoc },
  report: { table: "reports", extra: "period_label", href: ROUTES.reportDoc },
  worksheet: { table: "worksheets", extra: "instrument", href: ROUTES.worksheetDoc },
} as const

type DocKind = keyof typeof DOC_TABLES

function isDocKind(kind: string): kind is DocKind {
  return kind in DOC_TABLES
}

/* ------------------------------------------------------------ text */

/** Readable text out of a report or proposal's HTML. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|table|ul|ol)>/gi, "\n")
    .replace(/<(td|th)[^>]*>/gi, " | ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

/** `mineralife "ad spend" q3` → ["mineralife", "ad spend", "q3"]. */
export function searchTerms(q: string): string[] {
  const out: string[] = []
  for (const m of q.matchAll(/"([^"]+)"|(\S+)/g)) {
    const term = (m[1] ?? m[2] ?? "").trim().toLowerCase()
    if (term.length >= 2 && !out.includes(term)) out.push(term)
  }
  return out.slice(0, 6)
}

function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, "\\$&")}%`
}

function snippetAround(text: string, term: string, width = 280): string {
  const flat = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
  const at = flat.toLowerCase().indexOf(term)
  const start = Math.max(0, at - 100)
  const cut = flat.slice(start, start + width)
  return `${start > 0 ? "…" : ""}${cut}${start + width < flat.length ? "…" : ""}`
}

/* ------------------------------------------------------------ search */

export type SearchInput = {
  q: string
  clientId?: string
  kinds?: SearchKind[]
  from?: string
  to?: string
  limit?: number
}

export type SearchResult = {
  terms: string[]
  hits: SearchHit[]
  /** Matches per kind, capped at `perKind` — "12+" means there are more. */
  counts: Record<string, string>
}

type Row = { id: string; title: string | null; client: string | null; at: string | Date | null; snippet: string | null }

async function searchSource(kind: SearchKind, src: Source, terms: string[], input: SearchInput, perKind: number): Promise<SearchHit[]> {
  if (input.clientId && !src.clientId) return []
  const txt = sql.raw(`concat_ws(' ', ${src.text.join(", ")})`)
  const filters: SQL[] = terms.map((t) => sql`s.txt ilike ${likePattern(t)}`)
  if (input.clientId) filters.push(sql`s.client_id = ${input.clientId}::uuid`)
  if (input.from) filters.push(sql`s.at >= ${input.from}::date`)
  if (input.to) filters.push(sql`s.at < (${input.to}::date + 1)`)
  const query = sql`
    select s.id, s.title, c.name as client, s.at,
      substr(s.txt, greatest(strpos(lower(s.txt), ${terms[0]}) - 100, 1), 300) as snippet
    from (
      select ${sql.raw(src.id)}::text as id, ${sql.raw(src.title)} as title,
        ${sql.raw(src.clientId ?? "null::uuid")} as client_id,
        (${sql.raw(src.at)})::timestamptz as at, ${txt} as txt
      from ${sql.raw(src.from)}
      ${src.where ? sql.raw(`where ${src.where}`) : sql``}
    ) s
    left join clients c on c.id = s.client_id
    where ${sql.join(filters, sql` and `)}
    order by s.at desc nulls last
    limit ${perKind}`
  const rows = (await db.execute(query)) as unknown as Row[]
  return rows.map((r) => ({
    kind,
    id: r.id,
    title: r.title ?? "(untitled)",
    client: r.client,
    at: r.at ? new Date(r.at).toISOString() : null,
    snippet: snippetAround(r.snippet ?? "", terms[0]),
    ...(kind === "meeting" ? { href: ROUTES.meetingNote(r.id) } : {}),
  }))
}

type DocRow = { id: string; title: string; slug: string; body_path: string; notes: string; extra: string; client_id: string | null; client: string | null; at: string | Date }

async function docRows(kind: DocKind, clientId?: string): Promise<DocRow[]> {
  const doc = DOC_TABLES[kind]
  const t = sql.raw(doc.table)
  const rows = (await db.execute(sql`
    select d.id::text as id, d.title, d.slug, d.body_path, d.notes, coalesce(d.${sql.raw(doc.extra)}, '') as extra,
      d.client_id::text as client_id, c.name as client, d.updated_at as at
    from ${t} d left join clients c on c.id = d.client_id
    ${clientId ? sql`where d.client_id = ${clientId}::uuid` : sql``}
    order by d.updated_at desc`)) as unknown as DocRow[]
  return rows
}

function docBody(bodyPath: string): string {
  const html = readDocHtml(bodyPath)
  return html ? htmlToText(html) : ""
}

async function searchDocs(kind: DocKind, terms: string[], input: SearchInput, perKind: number): Promise<SearchHit[]> {
  const hits: SearchHit[] = []
  for (const row of await docRows(kind, input.clientId)) {
    const at = new Date(row.at)
    if (input.from && at < new Date(`${input.from}T00:00:00Z`)) continue
    if (input.to && at >= new Date(new Date(`${input.to}T00:00:00Z`).getTime() + 86_400_000)) continue
    const head = [row.title, row.slug, row.notes, row.extra].join(" ")
    const text = `${head}\n${docBody(row.body_path)}`
    const lower = text.toLowerCase()
    if (!terms.every((t) => lower.includes(t))) continue
    hits.push({
      kind,
      id: row.id,
      title: row.title,
      client: row.client,
      at: at.toISOString(),
      snippet: snippetAround(text, terms[0]),
      href: DOC_TABLES[kind].href(row.slug),
    })
    if (hits.length >= perKind) break
  }
  return hits
}

export async function searchCrm(input: SearchInput): Promise<SearchResult> {
  const terms = searchTerms(input.q)
  if (terms.length === 0) throw new Error("Send at least one search term of two or more characters.")
  const kinds = input.kinds?.length ? input.kinds : [...SEARCH_KINDS]
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 60)
  const perKind = Math.max(8, Math.min(limit, 20))

  const results = await Promise.all(
    kinds.map((kind) =>
      isDocKind(kind)
        ? searchDocs(kind, terms, input, perKind + 1)
        : searchSource(kind, SOURCES[kind], terms, input, perKind + 1)
    )
  )

  const counts: Record<string, string> = {}
  const all: SearchHit[] = []
  kinds.forEach((kind, i) => {
    const found = results[i]
    if (found.length === 0) return
    counts[kind] = found.length > perKind ? `${perKind}+` : String(found.length)
    all.push(...found.slice(0, perKind))
  })
  all.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
  return { terms, hits: all.slice(0, limit), counts }
}

/* ------------------------------------------------------------ read */

/** Heavy columns no answer needs: audio levels, raw payloads, block trees. */
const DROP = new Set(["segments", "levels", "tracks", "blocks", "raw", "analysis_usage", "metadata", "password_hash"])

/** Long text is paged so a two-hour transcript cannot flood a turn. */
const PAGE = 12_000

function paged(value: string, offset: number) {
  if (value.length <= PAGE && offset === 0) return { text: value, more: null }
  const text = value.slice(offset, offset + PAGE)
  const next = offset + PAGE < value.length ? offset + PAGE : null
  return { text, more: { total: value.length, offset, next } }
}

type Record_ = Record<string, unknown>

function trimRow(row: Record_, offset: number) {
  const out: Record_ = {}
  const truncated: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (DROP.has(key) || value === null || value === "") continue
    if (typeof value === "string" && value.length > PAGE) {
      const p = paged(value, offset)
      out[key] = p.text
      if (p.more) truncated[key] = p.more
    } else {
      out[key] = value instanceof Date ? value.toISOString() : value
    }
  }
  if (Object.keys(truncated).length) out._truncated = truncated
  return out
}

async function one(query: SQL): Promise<Record_ | null> {
  const rows = (await db.execute(query)) as unknown as Record_[]
  return rows[0] ?? null
}

async function many(query: SQL): Promise<Record_[]> {
  return (await db.execute(query)) as unknown as Record_[]
}

async function clientNameOf(row: Record_): Promise<string | null> {
  const id = row.client_id
  if (typeof id !== "string") return null
  const c = await one(sql`select name from clients where id = ${id}::uuid`)
  return (c?.name as string) ?? null
}

/**
 * The whole record behind a search hit, with what hangs off it: a meeting's
 * items, a ticket's thread, a document's body, a chat message's neighbours.
 * `offset` pages through the one long field (transcript, body) when the first
 * read says `_truncated`.
 */
export async function readRecord(kind: SearchKind, id: string, offset = 0): Promise<Record_> {
  if (!/^\S{1,200}$/.test(id)) throw new Error("That id does not look right — use one from search_crm.")
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)

  if (isDocKind(kind)) {
    if (!isUuid) throw new Error("No such record.")
    const doc = DOC_TABLES[kind]
    const row = await one(sql`select * from ${sql.raw(doc.table)} where id = ${id}::uuid`)
    if (!row) throw new Error("No such record.")
    const body = docBody(String(row.body_path ?? ""))
    const p = paged(body, offset)
    const meta = trimRow(row, 0)
    delete meta.body_path
    return {
      kind,
      ...meta,
      client: await clientNameOf(row),
      href: doc.href(String(row.slug)),
      body: p.text || "(the document file is missing)",
      ...(p.more ? { _truncated: { body: p.more } } : {}),
    }
  }

  const src = SOURCES[kind]
  if (!src) throw new Error(`Unknown kind "${kind}".`)
  if (kind !== "session" && !isUuid) throw new Error("No such record.")
  const idCol = kind === "session" ? "session_ref" : "id"
  const row = await one(sql`select * from ${sql.raw(src.table)} where ${sql.raw(idCol)} = ${id}${isUuid ? sql`::uuid` : sql``}`)
  if (!row) throw new Error("No such record.")

  const out: Record_ = { kind, ...trimRow(row, offset), client: await clientNameOf(row) }

  if (kind === "meeting") {
    out.href = ROUTES.meetingNote(id)
    out.items = await many(sql`
      select kind, title, detail, owner, due_on, state from meeting_note_items
      where note_id = ${id}::uuid order by sort`)
  }
  if (kind === "meeting_item") {
    const note = await one(sql`select id, title, started_at, summary, client_id from meeting_notes where id = ${row.note_id as string}::uuid`)
    if (note) {
      out.meeting = { id: note.id, title: note.title, startedAt: note.started_at, summary: note.summary }
      out.client = await clientNameOf(note)
    }
  }
  if (kind === "ticket") {
    out.messages = await many(sql`
      select role, author, author_email, body, coalesce(sent_at, created_at) as at
      from ticket_messages where ticket_id = ${id}::uuid order by coalesce(sent_at, created_at)`)
  }
  if (kind === "task") {
    out.items = await many(sql`select title, done from task_items where task_id = ${id}::uuid order by created_at`)
  }
  if (kind === "punchlist") {
    out.items = await many(sql`
      select section, title, kind, reported, outcome, last_test_status from punchlist_items
      where punchlist_id = ${id}::uuid order by section_sort, sort`)
  }
  if (kind === "deliverable") {
    const project = await one(sql`select name, slug, client_id from projects where id = ${row.project_id as string}::uuid`)
    if (project) {
      out.project = project.name
      out.client = await clientNameOf(project)
    }
    const invoice = await one(sql`select number, status from invoices where deliverable_id = ${id}::uuid`)
    out.invoice = invoice ? `${invoice.number} (${invoice.status})` : null
  }
  if (kind === "chat") {
    const thread = await one(sql`select title, private, client_id from chat_threads where id = ${row.thread_id as string}::uuid`)
    if (!thread || thread.private) throw new Error("No such record.")
    out.thread = thread.title
    out.client = await clientNameOf(thread)
    const at = new Date(row.created_at as string | Date).toISOString()
    out.around = await many(sql`
      (select role, agent, left(body, 1500) as body, created_at from chat_messages
        where thread_id = ${row.thread_id as string}::uuid and created_at < ${at}::timestamptz
        order by created_at desc limit 3)
      union all
      (select role, agent, left(body, 1500) as body, created_at from chat_messages
        where thread_id = ${row.thread_id as string}::uuid and created_at > ${at}::timestamptz
        order by created_at asc limit 3)
      order by created_at`)
  }
  if (kind === "invoice") out.href = ROUTES.invoice(String(row.number))
  return out
}
