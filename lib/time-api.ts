import { NextResponse } from "next/server"
import { authenticateDevice, type DeviceAuth } from "@/lib/device-tokens"
import { getSessionUser } from "@/lib/auth"

/**
 * `/api/time/*` answers two callers: a device holding a bearer token (watch,
 * phone, shortcut) and the CRM itself, already carrying a session cookie. Both
 * land on the same handlers so the browser client is also the reference client.
 */

export type TimeApiCaller = { userId: string; deviceId: string | null }

export async function authenticateTimeRequest(
  request: Request
): Promise<TimeApiCaller | null> {
  const device: DeviceAuth | null = await authenticateDevice(request)
  if (device) return { userId: device.user.id, deviceId: device.deviceId }

  const user = await getSessionUser()
  if (user) return { userId: user.id, deviceId: null }

  return null
}

export function unauthorized() {
  return NextResponse.json(
    { error: "Send a device token as `Authorization: Bearer <token>`." },
    { status: 401 }
  )
}

export function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status })
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json()
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

export function readString(body: Record<string, unknown>, key: string) {
  const value = body[key]
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed || null
}
