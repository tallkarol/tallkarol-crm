import { eq } from "drizzle-orm"
import { db } from "@/db"
import { clients } from "@/db/schema"
import { ISO_DAY, num, range, str, type ToolSpec } from "@/lib/chat/tool-helpers"
import { readRecord, SEARCH_KINDS, searchCrm, type SearchKind } from "@/lib/crm-search"

/**
 * Search everything the CRM has written down, then open what it finds. Both
 * read-only; the logic and the list of what is searched live in
 * lib/crm-search.ts.
 */

function kindsArg(args: Record<string, unknown>): SearchKind[] | undefined {
  const raw = args.kinds
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(",") : []
  const kinds = list.map((k) => String(k).trim()).filter(Boolean)
  const unknown = kinds.filter((k) => !(SEARCH_KINDS as readonly string[]).includes(k))
  if (unknown.length) throw new Error(`Unknown kind(s): ${unknown.join(", ")}. Use: ${SEARCH_KINDS.join(", ")}.`)
  return kinds.length ? (kinds as SearchKind[]) : undefined
}

const searchCrmTool: ToolSpec = {
  name: "search_crm",
  description:
    "Search everything in the CRM at once: meeting notes and transcripts (and their decisions/action items), proposals, reports and worksheets (full document text), contracts, support tickets and their threads, mail, tasks, punch lists, brainstorm notes, invoices, timesheet lines, past chats, agent sessions, leftoff notes, deliverables, projects, products, clients, sites, calendar, leads, expenses, Notion and codebase docs. Every term must appear; quote a phrase to keep it together. Returns hits newest first with a snippet, plus counts per kind — narrow with `kinds` or `clientSlug` when a kind shows '+'. Open a hit with read_record. Use this before saying something is not in the CRM.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      q: { type: "string", description: "Words to find, e.g. 'D2 acceptance' or '\"ad spend\" budget'." },
      clientSlug: { type: "string", description: "Only this client's records." },
      kinds: {
        type: "string",
        description: `Only these kinds, comma-separated (e.g. 'meeting,proposal,contract'). Omit to search everything. Kinds: ${SEARCH_KINDS.join(", ")}.`,
      },
      from: { type: "string", description: "YYYY-MM-DD or YYYY-MM." },
      to: { type: "string", description: "YYYY-MM-DD." },
      limit: { type: "number", description: "Hits to return, default 25, max 60." },
    },
    required: ["q"],
  },
  async run(args) {
    const q = str(args, "q")
    if (!q) throw new Error("`q` is required.")
    const slug = str(args, "clientSlug")
    let clientId: string | undefined
    if (slug) {
      const client = await db.query.clients.findFirst({ where: eq(clients.slug, slug), columns: { id: true } })
      if (!client) throw new Error(`No client with slug "${slug}". Call list_clients.`)
      clientId = client.id
    }
    const span = range(str(args, "from"), str(args, "to"))
    if (str(args, "from") && !span.from) throw new Error("`from` must be YYYY-MM-DD or YYYY-MM.")
    if (str(args, "to") && !(span.to && ISO_DAY.test(span.to))) throw new Error("`to` must be YYYY-MM-DD.")
    return searchCrm({ q, clientId, kinds: kindsArg(args), from: span.from, to: span.to, limit: num(args, "limit") })
  },
}

const readRecordTool: ToolSpec = {
  name: "read_record",
  description:
    "Open one search_crm hit in full: a meeting note with its summary, analysis, action items and transcript; a proposal, report or worksheet's document text; a ticket with its thread; a mail body; a chat message with the messages around it; any other record's fields. Long text is paged — when the result has `_truncated`, call again with `offset` = its `next`.",
  mutating: false,
  parameters: {
    type: "object",
    properties: {
      kind: { type: "string", enum: [...SEARCH_KINDS], description: "The hit's kind." },
      id: { type: "string", description: "The hit's id." },
      offset: { type: "number", description: "Where to continue a long text from (`_truncated.<field>.next`)." },
    },
    required: ["kind", "id"],
  },
  async run(args) {
    const kind = str(args, "kind")
    const id = str(args, "id")
    if (!kind || !(SEARCH_KINDS as readonly string[]).includes(kind)) throw new Error(`\`kind\` must be one of: ${SEARCH_KINDS.join(", ")}.`)
    if (!id) throw new Error("`id` is required — take it from search_crm.")
    return readRecord(kind as SearchKind, id, Math.max(0, Math.floor(num(args, "offset") ?? 0)))
  },
}

export const SEARCH_TOOLS: readonly ToolSpec[] = [searchCrmTool, readRecordTool]
