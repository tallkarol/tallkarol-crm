import { redirect } from "next/navigation"
import { PageHeader } from "@/components/PageHeader"
import { DeviceTokenManager } from "@/components/timesheet/DeviceTokenManager"
import { getSessionUser } from "@/lib/auth"
import { listDeviceTokens } from "@/lib/device-tokens"
import { workspaceTimezone } from "@/lib/timezone"

export const metadata = { title: "Devices" }
export const dynamic = "force-dynamic"

/** Bearer credentials for anything that punches in without a browser. */
export default async function DevicesPage() {
  const user = await getSessionUser()
  if (!user) redirect("/login")

  const [devices, timezone] = await Promise.all([
    listDeviceTokens(user.id),
    workspaceTimezone(),
  ])

  return (
    <>
      <PageHeader title="Devices" />
      <p className="mt-2 max-w-2xl text-sm text-ink-3">
        A watch, a phone, or a shortcut cannot carry your browser session, so
        each one gets its own token. Revoking one leaves every other device
        working.
      </p>
      <DeviceTokenManager
        devices={devices.map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: row.createdAt.toISOString(),
          lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
          revokedAt: row.revokedAt?.toISOString() ?? null,
        }))}
        appUrl={process.env.APP_URL || "http://localhost:3001"}
        timezone={timezone}
      />
    </>
  )
}
