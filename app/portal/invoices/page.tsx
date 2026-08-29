import { PortalInvoices } from "@/components/portal/panels"
import { getPortalScope } from "@/lib/portal"

export const metadata = { title: "Invoices · TALLKAROL Portal" }

export default async function PortalInvoicesPage() {
  const scope = (await getPortalScope())!
  return (
    <>
      <h1 className="font-['Inter_Tight',sans-serif] text-[22px] font-bold tracking-tight text-tk-onyx">Invoices</h1>
      <p className="mt-0.5 text-[13px] text-tk-slate/60">Every invoice, its status, and the PDF — self-serve.</p>
      <PortalInvoices clients={scope.clients} />
    </>
  )
}
