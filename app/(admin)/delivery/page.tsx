import { Suspense } from "react"
import { PageHeader } from "@/components/PageHeader"
import { DeliveryLedger } from "@/components/delivery/DeliveryLedger"
import { EngagementModal } from "@/components/delivery/EngagementModal"
import { loadDelivery } from "@/lib/delivery"
import { ROUTES } from "@/lib/nav"

export const metadata = { title: "Delivery" }
export const dynamic = "force-dynamic"

type SearchParams = { lens?: string; client?: string; open?: string }

/** Everything except `open`, so closing the modal returns to the same view. */
function viewQuery(searchParams: SearchParams) {
  const params = new URLSearchParams()
  if (searchParams.lens) params.set("lens", searchParams.lens)
  if (searchParams.client) params.set("client", searchParams.client)
  const qs = params.toString()
  return qs ? `${ROUTES.delivery}?${qs}` : ROUTES.delivery
}

export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const { rows, totals, clients } = await loadDelivery()
  const closeHref = viewQuery(searchParams)

  return (
    <>
      <PageHeader title="Delivery" />
      <p className="mt-1 text-[11.5px] text-tk-slate/60">
        {totals.needsYou > 0
          ? `${totals.needsYou} engagement${totals.needsYou === 1 ? "" : "s"} need${totals.needsYou === 1 ? "s" : ""} you`
          : "Nothing outstanding"}
        {" · "}
        {new Date().toLocaleDateString("en-US", { day: "numeric", month: "long" })}
      </p>

      <Suspense fallback={<p className="mt-8 text-sm text-tk-slate/70">Loading…</p>}>
        <DeliveryLedger rows={rows} totals={totals} clients={clients} />
      </Suspense>

      {searchParams.open ? (
        <EngagementModal open={searchParams.open} closeHref={closeHref} />
      ) : null}
    </>
  )
}
