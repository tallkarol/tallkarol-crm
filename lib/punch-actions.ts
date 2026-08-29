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
  updatePunch,
  type PunchView,
} from "@/lib/punches"

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

export async function startPunch(input: {
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
}

export async function stopPunch(input: {
  note?: string
} = {}): Promise<Result<PunchView>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const result = await clockOut({ userId: user.id, note: input.note ?? "" })
  if (!result.ok) return { ok: false, error: result.error }
  revalidateTime()
  return { ok: true, data: result.data }
}

export async function approvePunchEntry(input: {
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
}

export async function editPunch(input: {
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
}

export async function dropPunch(punchId: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }

  const result = await discardPunch({ punchId, userId: user.id })
  if (!result.ok) return { ok: false, error: result.error }
  revalidateTime()
  return { ok: true }
}

export async function createDeviceToken(
  name: string
): Promise<Result<{ id: string; name: string; token: string }>> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  const issued = await issueDeviceToken(user.id, name)
  revalidatePath("/settings/integrations/devices")
  return { ok: true, data: issued }
}

export async function killDeviceToken(id: string): Promise<Result> {
  const user = await getSessionUser()
  if (!user) return { ok: false, error: "Sign in first." }
  await revokeDeviceToken(user.id, id)
  revalidatePath("/settings/integrations/devices")
  return { ok: true }
}

export async function saveWorkspaceTimezone(timezone: string): Promise<Result> {
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
}
