"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { notionLinks, notionProposals, tasks } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import { syncLink } from "@/lib/notion"
import { scanLink } from "@/lib/notion-scan"

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
    const [task] = await db
      .insert(tasks)
      .values({
        title: proposal.title,
        userId: user.id,
        clientId: proposal.link.clientId,
        source: "notion",
        refKind: "notion_page",
        refId: proposal.pageId,
      })
      .returning({ id: tasks.id })
    taskId = task.id
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
