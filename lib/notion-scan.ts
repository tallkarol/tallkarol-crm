import { createHash } from "node:crypto"
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { notionPages, notionProposals } from "@/db/schema"
import type { NotionLink, NotionPage } from "@/db/schema"

/** Cheapest capable model by default; override with NOTION_SCAN_MODEL. */
const MODEL = process.env.NOTION_SCAN_MODEL || "claude-haiku-4-5"

const ScanResult = z.object({
  items: z.array(
    z.object({
      blockIndex: z.number().int(),
      title: z.string(),
      detail: z.string(),
      quote: z.string(),
    })
  ),
})

const SYSTEM = `You extract action items from the client notebooks of a solo web-development consultancy (TALLKAROL). Each request gives you one notebook page as numbered blocks.

Propose an item only when the page records something that still needs doing or following up: a commitment made to the client, a request from the client, an unanswered question, a decision awaiting execution, an unchecked to-do. Skip completed work, checked to-dos, pure reference material, and vague ideas with no implied action.

For each item: title is a short imperative (max 80 chars); detail is one sentence of context from the page (empty string if the title says it all); quote is the exact text of the single block that best evidences the item, copied verbatim; blockIndex is that block's number.

Return an empty items array when nothing on the page is actionable. Fewer, higher-confidence items beat exhaustive lists.`

/** Notion block anchor: page URL + block id without dashes. */
export function blockDeepLink(pageUrl: string, blockId: string): string {
  if (!pageUrl) return ""
  return blockId ? `${pageUrl}#${blockId.replace(/-/g, "")}` : pageUrl
}

/** Same title on the same page never re-proposes, whatever was decided. */
function fingerprint(pageNotionId: string, title: string): string {
  const normalized = title.toLowerCase().replace(/\W+/g, " ").trim()
  return createHash("sha256")
    .update(`${pageNotionId}|${normalized}`)
    .digest("hex")
    .slice(0, 32)
}

export type PageScan = { created: number; found: number }

export async function scanPage(
  anthropic: Anthropic,
  link: NotionLink,
  page: NotionPage,
  clientName: string
): Promise<PageScan> {
  const blocks = page.blocks.filter((b) => b.text.trim())
  const markDone = () =>
    db
      .update(notionPages)
      .set({ scannedAt: new Date() })
      .where(eq(notionPages.id, page.id))

  if (!blocks.length) {
    await markDone()
    return { created: 0, found: 0 }
  }

  const lines = blocks.map((b, i) => {
    const indent = "  ".repeat(b.depth)
    const marker =
      b.type === "to_do" ? (b.checked ? " (todo, done)" : " (todo)") : ""
    return `[${i}]${marker} ${indent}${b.text}`
  })

  const response = await anthropic.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: `Client: ${clientName}\nNotebook page: "${page.title}"\n\nNumbered blocks:\n${lines.join("\n")}`,
      },
    ],
    output_config: { format: zodOutputFormat(ScanResult) },
  })

  if (response.stop_reason === "refusal") {
    throw new Error(`Scan of "${page.title}" was refused by the model`)
  }
  const parsed = response.parsed_output
  if (!parsed) {
    throw new Error(`Scan of "${page.title}" returned unparseable output`)
  }

  let created = 0
  for (const item of parsed.items) {
    const block = blocks[item.blockIndex]
    const inserted = await db
      .insert(notionProposals)
      .values({
        linkId: link.id,
        pageId: page.id,
        blockId: block?.id ?? "",
        title: item.title.slice(0, 200),
        detail: item.detail,
        quote: item.quote,
        fingerprint: fingerprint(page.notionId, item.title),
      })
      .onConflictDoNothing()
      .returning({ id: notionProposals.id })
    created += inserted.length
  }

  await markDone()
  return { created, found: parsed.items.length }
}

export type LinkScan = {
  pagesScanned: number
  pagesSkipped: number
  created: number
}

/**
 * Scans a notebook's mirrored pages for actionables. By default only pages
 * new or edited since their last scan; `all` rescans everything (dismissed
 * and accepted fingerprints still never re-propose).
 */
export async function scanLink(
  link: NotionLink & { client?: { name: string } | null },
  opts: { all?: boolean; limit?: number; log?: (line: string) => void } = {}
): Promise<LinkScan> {
  const log = opts.log ?? (() => {})
  const anthropic = new Anthropic()
  const clientName = link.client?.name ?? "Unknown"

  const pages = await db.query.notionPages.findMany({
    where: eq(notionPages.linkId, link.id),
  })
  let targets = pages.filter((p) => !p.archived)
  if (!opts.all) {
    targets = targets.filter(
      (p) =>
        !p.scannedAt ||
        (p.notionEditedAt && p.notionEditedAt > p.scannedAt)
    )
  }
  const skipped = pages.filter((p) => !p.archived).length - targets.length
  if (opts.limit) targets = targets.slice(0, opts.limit)

  const stats: LinkScan = { pagesScanned: 0, pagesSkipped: skipped, created: 0 }
  for (const page of targets) {
    const result = await scanPage(anthropic, link, page, clientName)
    stats.pagesScanned++
    stats.created += result.created
    log(`  ~ ${page.title}: ${result.found} found, ${result.created} new`)
  }
  return stats
}
