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
}

export async function markReadAction(key: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." } satisfies Result
  const result = await setInboxItemState(key, "read", null)
  if (result.ok) touch()
  return result
}

export async function archiveAction(key: string) {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." } satisfies Result
  const result = await setInboxItemState(key, "archived", null)
  if (result.ok) touch()
  return result
}

/** Back to unread — deleting the row is what "unread" means. */
export async function unarchiveAction(key: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const result = await clearInboxItemState(key)
  if (result.ok) touch()
  return result
}

export async function snoozeAction(key: string, span: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const result = await snoozeInboxItem(key, span)
  if (result.ok) touch()
  return result
}

/** Assign a client to a piece of mail or an unassigned ticket. */
export async function assignClientAction(key: string, clientId: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const result = await assignInboxClient(key, clientId)
  if (result.ok) touch()
  return result
}

export async function makeTaskAction(
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
}

/**
 * Turn a piece of mail into a support ticket by hand. The sync does this
 * automatically for configured aliases; both go through `ticketFromMail` so
 * they cannot drift.
 */
export async function mailToTicketAction(mailId: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const result = await mailToTicketById(mailId)
  if (result.ok) {
    revalidatePath(ROUTES.support)
    touch()
  }
  return result.ok ? { ok: true } : result
}
