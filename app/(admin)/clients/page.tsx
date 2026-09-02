import { ClientComposer } from "@/components/clients/ClientComposer"
import { ClientRoster } from "@/components/clients/ClientRoster"
import { StatusBoard } from "@/components/clients/StatusBoard"
import { PageHeader } from "@/components/PageHeader"
import { loadClientRoster } from "@/lib/client-hub"
import { formatMoney, plural } from "@/lib/work"

export const metadata = { title: "Clients" }

export default async function ClientsPage() {
  const { rows, totals } = await loadClientRoster()

  const subtitle = [
    plural(totals.clients, "client"),
    totals.retainerHours > 0 ? `${totals.retainerHours} hr/mo under retainer` : null,
    totals.outstandingCents > 0
      ? `${formatMoney(totals.outstandingCents)} outstanding`
      : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      <PageHeader title="Clients" actions={<ClientComposer />} />
      <p className="mt-1 text-sm text-tk-slate/70">{subtitle}</p>

      {rows.length === 0 ? (
        <p className="mt-8 text-sm text-tk-slate/70">No clients yet.</p>
      ) : (
        <>
          <StatusBoard rows={rows} />
          <ClientRoster rows={rows} />
        </>
      )}
    </>
  )
}
