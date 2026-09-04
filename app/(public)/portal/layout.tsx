import { redirect } from "next/navigation"
import { PortalShell } from "@/components/portal/PortalShell"
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

  return (
    <PortalShell
      displayName={scope.displayName}
      clients={scope.clients}
      preview={scope.kind === "admin-preview"}
    >
      {children}
    </PortalShell>
  )
}
