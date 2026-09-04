import { PortalReports } from "@/components/portal/panels"
import { getPortalScope } from "@/lib/portal"

export const metadata = { title: "Reports · TALLKAROL Portal" }

export default async function PortalReportsPage() {
  const scope = (await getPortalScope())!
  return (
    <>
      <h1 className="font-['Inter_Tight',sans-serif] text-[22px] font-bold tracking-tight text-tk-onyx">Reports</h1>
      <p className="mt-0.5 text-[13px] text-tk-slate/60">
        Monthly site performance — published when each month closes.
      </p>
      <PortalReports clients={scope.clients} />
    </>
  )
}
