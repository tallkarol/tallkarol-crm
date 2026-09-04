import { PortalOverview } from "@/components/portal/panels"
import { getPortalScope } from "@/lib/portal"

export default async function PortalHomePage() {
  const scope = (await getPortalScope())!
  return <PortalOverview clients={scope.clients} firstName={scope.displayName.split(" ")[0]} />
}
