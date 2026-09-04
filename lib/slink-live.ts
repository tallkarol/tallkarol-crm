import { and, asc, desc, eq } from "drizzle-orm"
import { db } from "@/db"
import {
  punchlistItems,
  punchlists,
  reports,
  slinkBlocks,
  vaultEntries,
} from "@/db/schema"
import { decryptVaultSecret } from "@/lib/vault-data"
import type { Executor } from "@/lib/slink-data"

/**
 * Live blocks — the half of a slink that does not go stale.
 *
 * A static block is what Karol typed. A live block is a pointer, read fresh on
 * every view, so a punch list a client was sent in week one still shows week
 * six's progress instead of ageing into a lie.
 *
 * Everything here is read-only and scoped by the block's own `sourceId`. A
 * recipient can never widen what they see by changing a URL, because nothing
 * they send is used to choose a row.
 */

export type CredentialView = {
  title: string
  url: string
  username: string
  /** Never sent to the browser with the page — revealed through its own route. */
  hasSecret: boolean
}

export type PunchlistItemView = {
  id: string
  section: string
  title: string
  kind: string
  outcome: string
  status: "done" | "in progress" | "blocked" | "queued"
}

export type PunchlistView = {
  title: string
  intro: string
  items: PunchlistItemView[]
  done: number
  total: number
}

export type ReportView = {
  id: string
  title: string
  periodLabel: string
  status: string
  href: string
  filedAt: string
}

/* ------------------------------------------------------------- credentials */

/** The vault entry behind a credential block, without its secret. */
export async function credentialFor(
  block: { sourceId: string | null; title: string },
  client: Executor = db
): Promise<CredentialView | null> {
  if (!block.sourceId) return null
  const entry = await client.query.vaultEntries.findFirst({
    where: eq(vaultEntries.id, block.sourceId),
    columns: { title: true, url: true, username: true, secretBlob: true },
  })
  if (!entry) return null
  return {
    title: block.title || entry.title,
    url: entry.url,
    username: entry.username,
    hasSecret: Boolean(entry.secretBlob),
  }
}

/**
 * The secret itself, fetched only when someone presses Reveal so it never sits
 * in the delivered HTML. The caller writes the `revealed` event — every reveal
 * is attributable to one address.
 */
export async function revealCredential(
  blockId: string,
  slinkId: string,
  client: Executor = db
): Promise<string | null> {
  const block = await client.query.slinkBlocks.findFirst({
    where: and(eq(slinkBlocks.id, blockId), eq(slinkBlocks.slinkId, slinkId)),
    columns: { kind: true, sourceId: true, secretBlob: true },
  })
  if (!block || block.kind !== "credential") return null

  // A credential typed straight into the slink keeps its own blob.
  if (block.secretBlob) return decryptVaultSecret(block.secretBlob)

  if (!block.sourceId) return null
  const entry = await client.query.vaultEntries.findFirst({
    where: eq(vaultEntries.id, block.sourceId),
    columns: { secretBlob: true },
  })
  if (!entry?.secretBlob) return null
  return decryptVaultSecret(entry.secretBlob)
}

/* --------------------------------------------------------------- punchlist */

function itemStatus(item: {
  taskId: string | null
  lastTestStatus: string
}): PunchlistItemView["status"] {
  if (item.lastTestStatus === "pass") return "done"
  if (item.lastTestStatus === "fail" || item.lastTestStatus === "blocked") return "blocked"
  if (item.lastTestStatus === "running") return "in progress"
  return item.taskId ? "in progress" : "queued"
}

export async function punchlistFor(
  block: { sourceId: string | null },
  client: Executor = db
): Promise<PunchlistView | null> {
  if (!block.sourceId) return null
  const list = await client.query.punchlists.findFirst({
    where: eq(punchlists.id, block.sourceId),
    columns: { title: true, intro: true },
  })
  if (!list) return null

  const rows = await client.query.punchlistItems.findMany({
    where: eq(punchlistItems.punchlistId, block.sourceId),
    orderBy: [asc(punchlistItems.sectionSort), asc(punchlistItems.sort)],
    columns: {
      id: true,
      section: true,
      title: true,
      kind: true,
      outcome: true,
      taskId: true,
      lastTestStatus: true,
    },
  })

  const items = rows.map((r) => ({
    id: r.id,
    section: r.section,
    title: r.title,
    kind: r.kind,
    outcome: r.outcome,
    status: itemStatus(r),
  }))

  return {
    title: list.title,
    intro: list.intro,
    items,
    done: items.filter((i) => i.status === "done").length,
    total: items.length,
  }
}

/* ----------------------------------------------------------------- reports */

/**
 * A client's filed reports. Only filed ones with a readable body are listed —
 * a report that is merely due is Karol's business, not the client's.
 */
export async function reportsFor(
  block: { sourceId: string | null },
  client: Executor = db
): Promise<ReportView[]> {
  if (!block.sourceId) return []
  const rows = await client.query.reports.findMany({
    where: and(eq(reports.clientId, block.sourceId), eq(reports.status, "filed")),
    orderBy: [desc(reports.updatedAt)],
    limit: 12,
    columns: {
      id: true,
      title: true,
      slug: true,
      bodyPath: true,
      periodLabel: true,
      status: true,
      updatedAt: true,
    },
  })
  return rows
    .filter((r) => r.slug && r.bodyPath)
    .map((r) => ({
      id: r.id,
      title: r.title,
      periodLabel: r.periodLabel,
      status: r.status,
      href: `/doc/reports/${r.slug}`,
      filedAt: r.updatedAt.toISOString(),
    }))
}
