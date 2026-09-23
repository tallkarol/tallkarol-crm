"use server"

import { revalidatePath } from "next/cache"
import { getSessionUser } from "@/lib/auth"
import { ROUTES } from "@/lib/nav"
import {
  assignInboxClient,
  clearInboxItemState,
  mailToTicketById,
  makeInboxTask,
  setInboxItemState,
  snoozeInboxItem,
} from "@/lib/inbox-triage"
import { tracked } from "@/lib/activity/tracked"

/**
 * The four verbs the triage bar offers, plus the two conversions mail needs.
 *
 * Writes live in `lib/inbox-triage.ts` so the chat tools and this page cannot
 * drift. This file is the cookie gate.
 */

type Result = { ok: true } | { ok: false; error: string }

function touch() {
  revalidatePath(ROUTES.inbox)
  revalidatePath(ROUTES.home)
  // The Inbox room (this client's slice of the same triage state) and the
  // Board's Signals card, which reads the same "needs you" rule.
  revalidatePath("/clients/[slug]/inbox", "page")
  revalidatePath("/clients/[slug]", "page")
}

export const markReadAction = tracked("inbox.markReadAction", async function markReadAction(key: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." } satisfies Result
  const result = await setInboxItemState(key, "read", null)
  if (result.ok) touch()
  return result
})

export const archiveAction = tracked("inbox.archiveAction", async function archiveAction(key: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." } satisfies Result
  const result = await setInboxItemState(key, "archived", null)
  if (result.ok) touch()
  return result
})

/** Back to unread — deleting the row is what "unread" means. */
export const unarchiveAction = tracked("inbox.unarchiveAction", async function unarchiveAction(key: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const result = await clearInboxItemState(key)
  if (result.ok) touch()
  return result
})

export const snoozeAction = tracked("inbox.snoozeAction", async function snoozeAction(key: string, span: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const result = await snoozeInboxItem(key, span)
  if (result.ok) touch()
  return result
})

/** Assign a client to a piece of mail or an unassigned ticket. */
export const assignClientAction = tracked("inbox.assignClientAction", async function assignClientAction(key: string, clientId: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const result = await assignInboxClient(key, clientId)
  if (result.ok) touch()
  return result
})

export const makeTaskAction = tracked("inbox.makeTaskAction", async function makeTaskAction(
  key: string,
  title: string,
  clientId: string | null
): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const result = await makeInboxTask({ key, title, clientId, userId: user.id })
  if (result.ok) {
    revalidatePath(ROUTES.tasks)
    touch()
  }
  return result.ok ? { ok: true } : result
})

/**
 * Turn a piece of mail into a support ticket by hand. The sync does this
 * automatically for configured aliases; both go through `ticketFromMail` so
 * they cannot drift.
 */
export const mailToTicketAction = tracked("inbox.mailToTicketAction", async function mailToTicketAction(mailId: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const result = await mailToTicketById(mailId)
  if (result.ok) {
    revalidatePath(ROUTES.support)
    touch()
  }
  return result.ok ? { ok: true } : result
})
