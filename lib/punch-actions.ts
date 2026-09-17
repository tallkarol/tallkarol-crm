"use server"

import { revalidatePath } from "next/cache"
import { getSessionUser } from "@/lib/auth"
import {
  issueDeviceToken,
  revokeDeviceToken,
} from "@/lib/device-tokens"
import { setWorkspaceTimezone } from "@/lib/timezone"
import {
  approvePunch,
  clockIn,
  clockOut,
  discardPunch,
  runningPunches,
  updatePunch,
  type PunchView,
} from "@/lib/punches"
import { tracked } from "@/lib/activity/tracked"

type Result<T = undefined> =
  | ({ ok: true } & (T extends undefined ? {} : { data: T }))
  | { ok: false; error: string; running?: PunchView }

function revalidateTime() {
  revalidatePath("/timesheet")
  revalidatePath("/timesheet/live")
  revalidatePath("/timesheet/review")
  revalidatePath("/timesheet/sheets")
  revalidatePath("/timesheet/entries")
  revalidatePath("/invoices")
  revalidatePath("/retainers")
}

export const startPunch = tracked("punch.startPunch", async function startPunch(input: {
  clientId?: string | null
  projectId?: string | null
  note?: string
  switchRunning?: boolean
}): Promise<Result<PunchView>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const result = await clockIn({
    userId: user.id,
    clientId: input.clientId ?? null,
    projectId: input.projectId ?? null,
    note: input.note ?? "",
    source: "web",
    switchRunning: input.switchRunning ?? false,
  })
  if (!result.ok) {
    return { ok: false, error: result.error, running: result.running }
  }
  revalidateTime()
  return { ok: true, data: result.data.punch }
})

/**
 * What is running right now — the floating clock polls this. Deliberately
 * not tracked(): a background poll on every page is not something anyone
 * waits for, and it would drown the actions that are (ACTIVITY.md).
 */
export async function runningNow(): Promise<PunchView[]> {
  const user = await getSessionUser()
  if (!user) return []
  return runningPunches(user.id)
}

export const stopPunch = tracked("punch.stopPunch", async function stopPunch(input: {
  punchId?: string
  note?: string
} = {}): Promise<Result<PunchView>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const result = await clockOut({
    userId: user.id,
    punchId: input.punchId ?? null,
    note: input.note ?? "",
  })
  if (!result.ok) return { ok: false, error: result.error }
  revalidateTime()
  return { ok: true, data: result.data }
})

export const approvePunchEntry = tracked("punch.approvePunchEntry", async function approvePunchEntry(input: {
  punchId: string
  summary?: string
  hours?: number
  projectId?: string | null
  occurredOn?: string
}): Promise<Result<{ timeEntryId: string }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const result = await approvePunch({
    punchId: input.punchId,
    approvedBy: user.id,
    summary: input.summary,
    hours: input.hours,
    projectId: input.projectId,
    occurredOn: input.occurredOn,
  })
  if (!result.ok) return { ok: false, error: result.error }
  revalidateTime()
  return { ok: true, data: { timeEntryId: result.data.timeEntryId } }
})

export const editPunch = tracked("punch.editPunch", async function editPunch(input: {
  punchId: string
  note?: string
  clientId?: string | null
  projectId?: string | null
  startedAt?: string
  endedAt?: string
}): Promise<Result<PunchView>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const result = await updatePunch({ userId: user.id, ...input })
  if (!result.ok) return { ok: false, error: result.error }
  revalidateTime()
  return { ok: true, data: result.data }
})

export const dropPunch = tracked("punch.dropPunch", async function dropPunch(punchId: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const result = await discardPunch({ punchId, userId: user.id })
  if (!result.ok) return { ok: false, error: result.error }
  revalidateTime()
  return { ok: true }
})

export const createDeviceToken = tracked("punch.createDeviceToken", async function createDeviceToken(
  name: string
): Promise<Result<{ id: string; name: string; token: string }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const issued = await issueDeviceToken(user.id, name)
  revalidatePath("/settings/integrations/devices")
  return { ok: true, data: issued }
})

export const killDeviceToken = tracked("punch.killDeviceToken", async function killDeviceToken(id: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  await revokeDeviceToken(user.id, id)
  revalidatePath("/settings/integrations/devices")
  return { ok: true }
})

export const saveWorkspaceTimezone = tracked("punch.saveWorkspaceTimezone", async function saveWorkspaceTimezone(timezone: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const clean = timezone.trim()
  if (!clean) return { ok: false, error: "Pick a timezone." }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: clean })
  } catch {
    return { ok: false, error: `${clean} is not a timezone name.` }
  }
  await setWorkspaceTimezone(clean)
  revalidateTime()
  revalidatePath("/settings/integrations/devices")
  return { ok: true }
})
