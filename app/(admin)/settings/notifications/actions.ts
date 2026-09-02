"use server"

import { revalidatePath } from "next/cache"
import { NOTIFICATION_KINDS, setNotificationPrefs, type NotificationKind } from "@/lib/notify"
import { ROUTES } from "@/lib/nav"

type Result = { ok: true } | { ok: false; error: string }

export async function saveNotificationKind(kind: string, on: boolean): Promise<Result> {
  if (!NOTIFICATION_KINDS.some((k) => k.kind === kind)) {
    return { ok: false, error: "Unknown notification kind." }
  }
  await setNotificationPrefs({ kinds: { [kind as NotificationKind]: on } })
  revalidatePath(ROUTES.settingsNotifications)
  return { ok: true }
}

export async function saveQuietHours(formData: FormData): Promise<void> {
  const from = Number(formData.get("from"))
  const to = Number(formData.get("to"))
  const valid = (n: number) => Number.isInteger(n) && n >= 0 && n <= 23
  if (!valid(from) || !valid(to)) return
  await setNotificationPrefs({ quietFrom: from, quietTo: to })
  revalidatePath(ROUTES.settingsNotifications)
}
