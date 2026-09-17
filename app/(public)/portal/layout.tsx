import { Suspense } from "react"
import { redirect } from "next/navigation"
import { ActivityProbe } from "@/components/activity/ActivityProbe"
import { PortalShell } from "@/components/portal/PortalShell"
import { probeModules } from "@/lib/activity/modules"
import { activityFlags } from "@/lib/activity/settings"
import { getPortalScope } from "@/lib/portal"

export const metadata = { title: "TALLKAROL Client Portal" }
export const dynamic = "force-dynamic"

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const scope = await getPortalScope()
  if (!scope) redirect("/login")
  // An admin lands here without picking a client to preview — send them to
  // the control room instead of an empty portal.
  if (scope.kind === "admin-no-preview") redirect("/settings/portals")
  if (scope.clients.length === 0) redirect("/login")

  // Customer sessions are recorded from day one (Karol, 13 Sep 2026); the
  // Portal module switch on /activity turns it off. See ACTIVITY.md.
  const activity = await activityFlags().catch(() => null)

  return (
    <PortalShell
      displayName={scope.displayName}
      clients={scope.clients}
      preview={scope.kind === "admin-preview"}
    >
      {children}
      {activity?.portal ? (
        <Suspense fallback={null}>
          <ActivityProbe modules={probeModules(activity)} />
        </Suspense>
      ) : null}
    </PortalShell>
  )
}
