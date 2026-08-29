/**
 * Notion notebook links and the local mirror.
 *
 *   npm run notion:discover          # pages shared with the integration
 *   npm run notion:link -- <clientSlug> <pageUrlOrId>
 *   npm run notion:list              # links + mirror counts
 *   npm run notion:sync              # sync every link
 *   npm run notion:sync -- <clientSlug> [--full]
 */
import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { clients, notionLinks, notionPages } from "../db/schema"
import {
  fetchPageMeta,
  getNotionWebhookToken,
  notionConfigured,
  notionPageId,
  searchSharedPages,
  syncLink,
} from "../lib/notion"

function requireToken() {
  if (!notionConfigured()) {
    throw new Error("NOTION_TOKEN is not set — add it to crm/.env.local")
  }
}

async function discover() {
  requireToken()
  const [pages, links] = await Promise.all([
    searchSharedPages(),
    db.query.notionLinks.findMany(),
  ])
  if (!pages.length) {
    return console.log(
      "The integration can't see any pages yet. In Notion: page ••• menu → Connections → add the integration."
    )
  }
  const linked = new Set(links.map((l) => l.notionPageId))
  for (const p of pages) {
    const mark = linked.has(p.id) ? "linked " : p.parentType === "workspace" || p.parentType === "" ? "top    " : "nested "
    console.log(`${mark} ${p.title.padEnd(36)} ${p.id}`)
  }
  console.log(
    `\n${pages.length} pages visible. Link a notebook with: npm run notion:link -- <clientSlug> <pageId>`
  )
}

async function link(clientSlug: string, pageInput: string) {
  requireToken()
  if (!clientSlug || !pageInput) {
    throw new Error("Usage: notion:link -- <clientSlug> <pageUrlOrId>")
  }
  const client = await db.query.clients.findFirst({
    where: eq(clients.slug, clientSlug),
  })
  if (!client) throw new Error(`No client with slug "${clientSlug}"`)

  const pageId = notionPageId(pageInput)
  const existing = await db.query.notionLinks.findFirst({
    where: eq(notionLinks.notionPageId, pageId),
  })
  if (existing) return console.log(`Already linked (link ${existing.id}).`)

  const meta = await fetchPageMeta(pageId)
  await db.insert(notionLinks).values({
    clientId: client.id,
    notionPageId: pageId,
    title: meta.title,
    url: meta.url,
  })
  console.log(`Linked "${meta.title}" → ${client.name}. Run npm run notion:sync to mirror it.`)
}

async function list() {
  const links = await db.query.notionLinks.findMany({
    with: { client: true, pages: { columns: { id: true, archived: true } } },
    orderBy: [asc(notionLinks.createdAt)],
  })
  if (!links.length) return console.log("No notebooks linked yet.")
  for (const l of links) {
    const live = l.pages.filter((p) => !p.archived).length
    const synced = l.lastSyncedAt
      ? l.lastSyncedAt.toISOString().slice(0, 16).replace("T", " ")
      : "never"
    const error = l.lastError ? `  ERROR: ${l.lastError}` : ""
    console.log(
      `${(l.client?.slug ?? "?").padEnd(14)} ${l.title.padEnd(32)} pages=${String(live).padEnd(4)} synced=${synced}${error}`
    )
  }
}

async function sync(clientSlug?: string, full = false) {
  requireToken()
  let links = await db.query.notionLinks.findMany({ with: { client: true } })
  if (clientSlug) {
    links = links.filter((l) => l.client?.slug === clientSlug)
    if (!links.length) throw new Error(`No linked notebook for "${clientSlug}"`)
  }
  if (!links.length) return console.log("No notebooks linked yet.")

  for (const l of links) {
    console.log(`Syncing ${l.client?.name ?? "?"} — ${l.title}${full ? " (full)" : ""}`)
    try {
      const stats = await syncLink(l, { full, log: (line) => console.log(line) })
      console.log(
        `  done: ${stats.seen} pages, ${stats.updated} updated, ${stats.skipped} unchanged, ${stats.archived} archived`
      )
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db
        .update(notionLinks)
        .set({ lastError: message.slice(0, 500) })
        .where(eq(notionLinks.id, l.id))
      console.error(`  FAILED: ${message}`)
    }
  }
}

async function webhookToken() {
  const token = await getNotionWebhookToken()
  if (!token) {
    return console.log(
      "No verification token captured yet — create the subscription in Notion first (it POSTs the token to the deployed endpoint)."
    )
  }
  console.log(`Paste this into the Notion verification dialog:\n\n${token}`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const args = rest.filter((a) => !a.startsWith("--"))
  const full = rest.includes("--full")
  if (command === "discover") return discover()
  if (command === "link") return link(args[0], args[1])
  if (command === "list") return list()
  if (command === "sync") return sync(args[0], full)
  if (command === "webhook-token") return webhookToken()
  throw new Error("Usage: notion.ts <discover|link|list|sync|webhook-token>")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
