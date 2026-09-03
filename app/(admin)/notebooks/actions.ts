"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { notionLinks, notionProposals } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import { fetchPageMeta, syncLink } from "@/lib/notion"
import { scanLink } from "@/lib/notion-scan"
import { insertTaskRow, resolveTaskTarget } from "@/lib/task-insert"

export async function syncNotebook(linkId: string) {
  const user = await getSessionUser()
  if (!user || user.role !== "admin") return

  const link = await db.query.notionLinks.findFirst({
    where: eq(notionLinks.id, linkId),
    with: { client: true },
  })
  if (!link) return

  try {
    await syncLink(link)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(notionLinks)
      .set({ lastError: message.slice(0, 500) })
      .where(eq(notionLinks.id, link.id))
  }

  revalidatePath(ROUTES.notebooks)
  if (link.client) revalidatePath(ROUTES.notebook(link.client.slug))
}

/** Scan changed pages only; capped so a server action stays bounded. */
export async function scanNotebook(linkId: string) {
  const user = await getSessionUser()
  if (!user || user.role !== "admin") return

  const link = await db.query.notionLinks.findFirst({
    where: eq(notionLinks.id, linkId),
    with: { client: true },
  })
  if (!link) return

  try {
    await scanLink(link, { limit: 10 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(notionLinks)
      .set({ lastError: `scan: ${message}`.slice(0, 500) })
      .where(eq(notionLinks.id, link.id))
  }

  revalidatePath(ROUTES.notebooks)
  if (link.client) revalidatePath(ROUTES.notebook(link.client.slug))
}

async function decideProposal(proposalId: string, accept: boolean) {
  const user = await getSessionUser()
  if (!user || user.role !== "admin") return

  const proposal = await db.query.notionProposals.findFirst({
    where: eq(notionProposals.id, proposalId),
    with: { link: { with: { client: true } } },
  })
  if (!proposal || proposal.status !== "proposed") return

  let taskId: string | null = null
  if (accept) {
    // Through the shared writer so an accepted page picks up the client's
    // active retainer, same as every other captured task.
    const target = await resolveTaskTarget({ clientId: proposal.link.clientId })
    if ("error" in target) return
    taskId = await insertTaskRow(db, {
      title: proposal.title,
      userId: user.id,
      target,
      source: "notion",
      refKind: "notion_page",
      refId: proposal.pageId,
    })
  }

  await db
    .update(notionProposals)
    .set({
      status: accept ? "accepted" : "dismissed",
      taskId,
      decidedAt: new Date(),
    })
    .where(eq(notionProposals.id, proposal.id))

  revalidatePath(ROUTES.notebooks)
  if (proposal.link.client) revalidatePath(ROUTES.notebook(proposal.link.client.slug))
}

export async function acceptProposal(proposalId: string) {
  return decideProposal(proposalId, true)
}

export async function dismissProposal(proposalId: string) {
  return decideProposal(proposalId, false)
}

export async function syncAllNotebooks() {
  const user = await getSessionUser()
  if (!user || user.role !== "admin") return
  const links = await db.query.notionLinks.findMany({ with: { client: true } })
  for (const link of links) {
    try {
      await syncLink(link)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db
        .update(notionLinks)
        .set({ lastError: message.slice(0, 500) })
        .where(eq(notionLinks.id, link.id))
    }
  }
  revalidatePath(ROUTES.notebooks)
}

export async function scanAllNotebooks() {
  const user = await getSessionUser()
  if (!user || user.role !== "admin") return
  const links = await db.query.notionLinks.findMany({ with: { client: true } })
  for (const link of links) {
    try {
      await scanLink(link, { limit: 10 })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db
        .update(notionLinks)
        .set({ lastError: `scan: ${message}`.slice(0, 500) })
        .where(eq(notionLinks.id, link.id))
    }
  }
  revalidatePath(ROUTES.notebooks)
}

/** The Connect card: link a discovered shared page to its matching client. */
export async function linkNotebook(pageId: string, clientId: string) {
  const user = await getSessionUser()
  if (!user || user.role !== "admin") return

  const meta = await fetchPageMeta(pageId)
  await db
    .insert(notionLinks)
    .values({ clientId, notionPageId: pageId, title: meta.title, url: meta.url })
    .onConflictDoNothing()
  revalidatePath(ROUTES.notebooks)
}
