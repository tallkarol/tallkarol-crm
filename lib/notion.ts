import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/db"
import { appSettings, notionLinks, notionPages } from "@/db/schema"
import type { NotionBlock, NotionLink } from "@/db/schema"

const NOTION_API = "https://api.notion.com/v1"
const NOTION_VERSION = "2022-06-28"

/** Notion allows ~3 requests/second; stay politely under it. */
const REQUEST_GAP_MS = 350

export function notionConfigured() {
  return Boolean(process.env.NOTION_TOKEN)
}

let lastRequestAt = 0

async function notionFetch(path: string, init?: RequestInit): Promise<any> {
  const token = process.env.NOTION_TOKEN
  if (!token) throw new Error("NOTION_TOKEN is not set — add it to .env.local")

  const wait = lastRequestAt + REQUEST_GAP_MS - Date.now()
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()

  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${NOTION_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    })
    if (res.status === 429) {
      const after = Number(res.headers.get("retry-after") || "1")
      await new Promise((r) => setTimeout(r, Math.min(after, 30) * 1000))
      continue
    }
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Notion ${res.status} on ${path}: ${body.slice(0, 300)}`)
    }
    return res.json()
  }
  throw new Error(`Notion kept rate-limiting ${path}`)
}

/** Accepts a Notion URL, a dashed id, or a bare 32-hex id. */
export function notionPageId(input: string): string {
  const bare = input.replace(/-/g, "")
  const match = bare.match(/[0-9a-f]{32}(?![0-9a-f])/gi)
  if (!match) throw new Error(`No Notion page id found in "${input}"`)
  const id = match[match.length - 1].toLowerCase()
  return [
    id.slice(0, 8),
    id.slice(8, 12),
    id.slice(12, 16),
    id.slice(16, 20),
    id.slice(20),
  ].join("-")
}

function plainText(richText: any[]): string {
  return (richText ?? []).map((t: any) => t?.plain_text ?? "").join("")
}

function pageTitle(page: any): string {
  for (const prop of Object.values<any>(page?.properties ?? {})) {
    if (prop?.type === "title") return plainText(prop.title)
  }
  return ""
}

export type SharedPage = {
  id: string
  title: string
  url: string
  parentType: string
}

/** Everything the integration has been granted. Grant a page, then run this. */
export async function searchSharedPages(): Promise<SharedPage[]> {
  const results: SharedPage[] = []
  let cursor: string | undefined
  do {
    const json = await notionFetch("/search", {
      method: "POST",
      body: JSON.stringify({
        filter: { property: "object", value: "page" },
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      }),
    })
    for (const page of json.results ?? []) {
      results.push({
        id: page.id,
        title: pageTitle(page) || "(untitled)",
        url: page.url ?? "",
        parentType: page.parent?.type ?? "",
      })
    }
    cursor = json.has_more ? json.next_cursor : undefined
  } while (cursor)
  return results
}

function blockText(block: any): string {
  const body = block?.[block?.type]
  if (!body) return ""
  if (block.type === "child_page" || block.type === "child_database") {
    return body.title ?? ""
  }
  if (block.type === "table_row") {
    return (body.cells ?? []).map((cell: any[]) => plainText(cell)).join(" | ")
  }
  if (block.type === "equation") return body.expression ?? ""
  if (Array.isArray(body.rich_text)) {
    const text = plainText(body.rich_text)
    if (text) return text
  }
  if (Array.isArray(body.caption)) return plainText(body.caption)
  return ""
}

type FetchedBlocks = {
  blocks: NotionBlock[]
  childPageIds: string[]
}

/**
 * Flattens a page's block tree. Child pages and databases are recorded as
 * blocks (so a skipped re-fetch can still walk to them) but not descended
 * into here — the walker syncs them as pages of their own.
 */
async function fetchBlocks(
  parentId: string,
  depth: number,
  out: FetchedBlocks
): Promise<void> {
  let cursor: string | undefined
  do {
    const qs = cursor ? `?page_size=100&start_cursor=${cursor}` : "?page_size=100"
    const json = await notionFetch(`/blocks/${parentId}/children${qs}`)
    for (const block of json.results ?? []) {
      const entry: NotionBlock = {
        id: block.id,
        type: block.type,
        text: blockText(block),
        depth,
      }
      if (block.type === "to_do") entry.checked = Boolean(block.to_do?.checked)
      out.blocks.push(entry)
      if (block.type === "child_page") {
        out.childPageIds.push(block.id)
      } else if (block.has_children && block.type !== "child_database") {
        await fetchBlocks(block.id, depth + 1, out)
      }
    }
    cursor = json.has_more ? json.next_cursor : undefined
  } while (cursor)
}

export type SyncStats = {
  seen: number
  updated: number
  skipped: number
  archived: number
}

/**
 * Walks a linked notebook and upserts the mirror. Unchanged pages (by
 * Notion's last_edited_time) keep their stored blocks but still contribute
 * their child pages to the walk, since edits do not bubble up to ancestors.
 */
export async function syncLink(
  link: NotionLink,
  opts: { full?: boolean; log?: (line: string) => void } = {}
): Promise<SyncStats> {
  const log = opts.log ?? (() => {})
  const stats: SyncStats = { seen: 0, updated: 0, skipped: 0, archived: 0 }

  const existing = await db.query.notionPages.findMany({
    where: eq(notionPages.linkId, link.id),
  })
  const byNotionId = new Map(existing.map((p) => [p.notionId, p]))

  const queue: { id: string; parentNotionId: string }[] = [
    { id: link.notionPageId, parentNotionId: "" },
  ]
  const seenIds = new Set<string>()

  while (queue.length) {
    const { id, parentNotionId } = queue.shift()!
    if (seenIds.has(id)) continue
    seenIds.add(id)
    stats.seen++

    const page = await notionFetch(`/pages/${id}`)
    if (page.archived || page.in_trash) {
      seenIds.delete(id)
      continue
    }
    const title = pageTitle(page) || "(untitled)"
    const editedAt = page.last_edited_time ? new Date(page.last_edited_time) : null
    const mirror = byNotionId.get(id)

    const unchanged =
      !opts.full &&
      mirror &&
      !mirror.archived &&
      editedAt &&
      mirror.notionEditedAt &&
      mirror.notionEditedAt.getTime() === editedAt.getTime()

    if (unchanged) {
      stats.skipped++
      for (const block of mirror.blocks) {
        if (block.type === "child_page") {
          queue.push({ id: block.id, parentNotionId: id })
        }
      }
      continue
    }

    const fetched: FetchedBlocks = { blocks: [], childPageIds: [] }
    await fetchBlocks(id, 0, fetched)
    for (const childId of fetched.childPageIds) {
      queue.push({ id: childId, parentNotionId: id })
    }

    const text = fetched.blocks
      .map((b) => b.text)
      .filter(Boolean)
      .join("\n")
    const row = {
      linkId: link.id,
      notionId: id,
      parentNotionId,
      title,
      url: page.url ?? "",
      blocks: fetched.blocks,
      plainText: text,
      notionEditedAt: editedAt,
      archived: false,
      syncedAt: new Date(),
    }
    if (mirror) {
      await db.update(notionPages).set(row).where(eq(notionPages.id, mirror.id))
    } else {
      await db.insert(notionPages).values(row)
    }
    stats.updated++
    log(`  ~ ${title} (${fetched.blocks.length} blocks)`)
  }

  const gone = existing.filter((p) => !seenIds.has(p.notionId) && !p.archived)
  if (gone.length) {
    await db
      .update(notionPages)
      .set({ archived: true, syncedAt: new Date() })
      .where(
        and(
          eq(notionPages.linkId, link.id),
          inArray(
            notionPages.id,
            gone.map((p) => p.id)
          )
        )
      )
    stats.archived = gone.length
  }

  await db
    .update(notionLinks)
    .set({ lastSyncedAt: new Date(), lastError: "" })
    .where(eq(notionLinks.id, link.id))

  return stats
}

const WEBHOOK_KEY = "notion_webhook"

/**
 * Notion sends { verification_token } to the endpoint when a subscription is
 * created; the same value later signs every event. Captured here so the
 * notion:webhook-token script can print it for pasting back into Notion.
 */
export async function getNotionWebhookToken(): Promise<string> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, WEBHOOK_KEY),
  })
  const v = (row?.value ?? {}) as { verificationToken?: string }
  return v.verificationToken ?? ""
}

export async function setNotionWebhookToken(token: string) {
  await db
    .insert(appSettings)
    .values({ key: WEBHOOK_KEY, value: { verificationToken: token }, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: { verificationToken: token }, updatedAt: new Date() },
    })
}

export type RefreshResult = {
  status: "updated" | "archived" | "ignored"
  title?: string
}

/**
 * Webhook path: re-mirror one page. A page outside every linked notebook is
 * ignored; a new page finds its notebook by climbing parents until it hits a
 * linked root or an already-mirrored page.
 */
export async function refreshPage(rawId: string): Promise<RefreshResult> {
  const id = notionPageId(rawId)
  const mirror = await db.query.notionPages.findFirst({
    where: eq(notionPages.notionId, id),
  })

  const archive = async (): Promise<RefreshResult> => {
    if (!mirror) return { status: "ignored" }
    await db
      .update(notionPages)
      .set({ archived: true, syncedAt: new Date() })
      .where(eq(notionPages.id, mirror.id))
    return { status: "archived", title: mirror.title }
  }

  let page: any
  try {
    page = await notionFetch(`/pages/${id}`)
  } catch {
    return archive() // deleted, or access revoked
  }
  if (page.archived || page.in_trash) return archive()

  let linkId = mirror?.linkId
  let parentNotionId = mirror?.parentNotionId ?? ""
  if (!linkId) {
    const selfLink = await db.query.notionLinks.findFirst({
      where: eq(notionLinks.notionPageId, id),
    })
    if (selfLink) {
      linkId = selfLink.id
      parentNotionId = ""
    }
  }
  if (!linkId) {
    let current = page
    for (let hops = 0; hops < 12 && !linkId; hops++) {
      const parent = current.parent
      if (parent?.type !== "page_id") break
      const pid: string = parent.page_id
      if (current.id === page.id) parentNotionId = pid
      const link = await db.query.notionLinks.findFirst({
        where: eq(notionLinks.notionPageId, pid),
      })
      if (link) {
        linkId = link.id
        break
      }
      const parentMirror = await db.query.notionPages.findFirst({
        where: eq(notionPages.notionId, pid),
      })
      if (parentMirror) {
        linkId = parentMirror.linkId
        break
      }
      current = await notionFetch(`/pages/${pid}`)
    }
  }
  if (!linkId) return { status: "ignored" }

  const fetched: FetchedBlocks = { blocks: [], childPageIds: [] }
  await fetchBlocks(id, 0, fetched)
  const title = pageTitle(page) || "(untitled)"
  const row = {
    linkId,
    notionId: id,
    parentNotionId,
    title,
    url: page.url ?? "",
    blocks: fetched.blocks,
    plainText: fetched.blocks
      .map((b) => b.text)
      .filter(Boolean)
      .join("\n"),
    notionEditedAt: page.last_edited_time ? new Date(page.last_edited_time) : null,
    archived: false,
    syncedAt: new Date(),
  }
  if (mirror) {
    await db.update(notionPages).set(row).where(eq(notionPages.id, mirror.id))
  } else {
    await db.insert(notionPages).values(row)
  }
  return { status: "updated", title }
}

export type UnlinkedNotebook = {
  id: string
  title: string
  url: string
  clientId: string
  clientName: string
}

const DISCOVER_KEY = "notion_shared_pages"
const DISCOVER_TTL_MS = 15 * 60 * 1000

/**
 * Top-level shared pages that match a client by name but aren't linked yet —
 * the "Connect notebook" cards. Search results are cached for 15 minutes so
 * the index page doesn't pay Notion's API tax on every render.
 */
export async function unlinkedSharedPages(): Promise<{
  matched: UnlinkedNotebook[]
  unmatched: number
}> {
  if (!notionConfigured()) return { matched: [], unmatched: 0 }
  const { readReport, writeReport } = await import("@/lib/report-cache")

  const cached = await readReport<SharedPage[]>(DISCOVER_KEY)
  let pages = cached.payload
  const stale =
    !cached.refreshedAt ||
    Date.now() - cached.refreshedAt.getTime() > DISCOVER_TTL_MS
  if (stale) {
    try {
      pages = await searchSharedPages()
      await writeReport(DISCOVER_KEY, pages)
    } catch {
      // keep whatever the cache holds; the cards are a convenience
    }
  }
  if (!pages) return { matched: [], unmatched: 0 }

  const [links, clients] = await Promise.all([
    db.query.notionLinks.findMany(),
    db.query.clients.findMany(),
  ])
  const linked = new Set(links.map((l) => l.notionPageId))
  const linkedClients = new Set(links.map((l) => l.clientId))
  const topLevel = pages.filter(
    (p) =>
      (p.parentType === "workspace" || p.parentType === "") && !linked.has(p.id)
  )

  const norm = (s: string) => s.toLowerCase().replace(/\W+/g, " ").trim()
  const matched: UnlinkedNotebook[] = []
  for (const page of topLevel) {
    const title = norm(page.title)
    const client = clients.find(
      (c) =>
        !linkedClients.has(c.id) &&
        (title === norm(c.name) || title === norm(c.slug))
    )
    if (client) {
      matched.push({
        id: page.id,
        title: page.title,
        url: page.url,
        clientId: client.id,
        clientName: client.name,
      })
    }
  }
  return { matched, unmatched: topLevel.length - matched.length }
}

/** Resolve a page the integration can read; throws with a hint if it can't. */
export async function fetchPageMeta(pageId: string) {
  try {
    const page = await notionFetch(`/pages/${pageId}`)
    return { title: pageTitle(page) || "(untitled)", url: page.url ?? "" }
  } catch (err) {
    throw new Error(
      `${err instanceof Error ? err.message : err}\n` +
        `If this is a 404, the page has not been shared with the integration — ` +
        `open it in Notion, ••• menu → Connections → add the integration.`
    )
  }
}
