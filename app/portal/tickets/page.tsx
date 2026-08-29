import { PortalTickets } from "@/components/portal/panels"
import { getPortalScope } from "@/lib/portal"

export const metadata = { title: "Tickets · TALLKAROL Portal" }

export default async function PortalTicketsPage() {
  const scope = (await getPortalScope())!
  return (
    <>
      <h1 className="font-['Inter_Tight',sans-serif] text-[22px] font-bold tracking-tight text-tk-onyx">Tickets</h1>
      <p className="mt-0.5 text-[13px] text-tk-slate/60">
        Submit here — same queue, faster answers, and you can watch the status live.
      </p>
      <PortalTickets clients={scope.clients} />
    </>
  )
}
