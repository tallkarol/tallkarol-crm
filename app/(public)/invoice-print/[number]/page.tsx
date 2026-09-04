import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { PrintButton } from "@/components/insights/PrintButton"
import { db } from "@/db"
import { invoices } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { getInvoiceSender, parseDescription, readBilling } from "@/lib/invoice-print"
import { getPortalScope } from "@/lib/portal"
import { hideMoney, MASK_DIGITS } from "@/lib/money-privacy"
import { readHideMoneyCookie } from "@/lib/money-privacy-server"
import { ROUTES } from "@/lib/nav"

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: { params: { number: string } }) {
  return { title: `Invoice ${params.number}` }
}

function fmtAmount(cents: number) {
  if (hideMoney()) return MASK_DIGITS
  return (cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })
}

function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00")
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

/**
 * The invoice, laid out like the PDFs Karol has always sent — the browser's
 * Save-as-PDF is the delivery artifact. Same pattern as /insights-report.
 */
export default async function InvoicePrintPage({
  params,
}: {
  params: { number: string }
}) {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.number, decodeURIComponent(params.number)),
    with: { client: true, retainer: true },
  })
  if (!invoice) notFound()

  // Outside the admin layout, so read the demo-mode cookie here. That also
  // registers the resolver on a cold start whose first hit is this page.
  const hideAmounts = readHideMoneyCookie()

  // Admins see everything; portal users only their own clients' invoices.
  const user = await getSessionUser()
  if (!user) {
    const scope = await getPortalScope()
    const allowed =
      scope?.kind === "customer" && scope.clients.some((c) => c.id === invoice.clientId)
    if (!allowed) redirect("/login")
  }

  const billing = readBilling(invoice.client.billing)
  const sender = await getInvoiceSender()
  const senderEmail = billing.senderEmail ?? sender.email
  const billToLines = billing.billTo.length
    ? billing.billTo
    : invoice.billTo
      ? invoice.billTo.split(",").map((s) => s.trim())
      : [invoice.client.name]

  const { headline, lines } = parseDescription(invoice.description)
  const qty = invoice.retainer ? "1 Month" : ""
  const headlineText =
    headline ??
    (invoice.retainer && invoice.hours
      ? `${invoice.retainer.name} — ${Number(invoice.hours).toLocaleString("en-US", { maximumFractionDigits: 2 })} hours`
      : invoice.description || invoice.client.name)
  const bodyLines = headline ? lines : lines.length === 1 && lines[0].depth === 0 ? [] : lines
  const fillerRows = Math.max(0, 7 - bodyLines.length)

  return (
    <div className="tk-light mx-auto max-w-[52rem] bg-white px-10 py-8 font-['Inter',system-ui,sans-serif] text-[13px] leading-relaxed text-[#1F2C2B] print:max-w-none print:px-2 print:py-0">
      <style>{`body { background: #fff; } @page { margin: 16mm 14mm; } @media print { body { background: #fff; } }`}</style>
      {hideAmounts ? (
        <p className="mb-4 rounded-lg bg-[#B45309]/10 px-3 py-2 text-xs font-semibold text-[#92400E] print:hidden">
          Amounts hidden — turn off demo mode before saving as PDF.
        </p>
      ) : null}
      <div className="mb-6 flex items-center justify-between gap-3 print:hidden">
        <Link
          href={ROUTES.invoice(invoice.number)}
          className="text-sm font-semibold text-tk-teal hover:underline"
        >
          ← Back to invoice
        </Link>
        <div className="flex items-center gap-2">
          {invoice.status === "draft" ? (
            <span className="rounded-full bg-[#B45309]/10 px-3 py-1 text-xs font-semibold text-[#92400E]">
              DRAFT — mark sent after it goes out
            </span>
          ) : null}
          <PrintButton />
        </div>
      </div>

      {/* ---------- the artifact ---------- */}
      <div className="text-right">
        <p className="font-['Inter_Tight',sans-serif] text-[44px] font-light tracking-wide text-[#4B5563]">
          INVOICE
        </p>
        <p className="mt-2 text-[13px]">Date:</p>
        <p className="tabular-nums">{fmtDate(invoice.issuedOn)} INVOICE</p>
        <p className="tabular-nums"># {invoice.number}</p>
      </div>

      <div className="mt-4 flex justify-end gap-8 text-right">
        <p className="pt-0.5 text-[#4B5563]">To</p>
        <div>
          {billToLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      </div>

      {billing.customerId ? (
        <p className="mt-5 text-right">Customer ID: {billing.customerId}</p>
      ) : null}

      <table className="mt-8 w-full border-collapse">
        <thead>
          <tr className="border-b border-[#1F2C2B]/30 text-left">
            <th className="w-24 py-1.5 pr-2 font-semibold">Qty</th>
            <th className="py-1.5 pr-2 font-semibold">Description</th>
            <th className="w-28 py-1.5 pr-2 text-left font-serif text-[12px] font-normal">%Allocation</th>
            <th className="w-28 py-1.5 text-right font-semibold">Line Total</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-[#1F2C2B]/15">
            <td className="py-2 pr-2 align-top">{qty}</td>
            <td className="py-2 pr-2 align-top">{headlineText}</td>
            <td className="py-2 pr-2" />
            <td className="py-2 text-right align-top tabular-nums">{fmtAmount(invoice.amountCents)}</td>
          </tr>
          {bodyLines.map((line, i) => (
            <tr key={i} className="border-b border-[#1F2C2B]/10">
              <td className="py-1.5 pr-2" />
              <td className="py-1.5 pr-2" style={{ paddingLeft: line.depth > 1 ? "1.5rem" : line.depth === 1 ? "0.25rem" : 0 }}>
                {line.depth > 0 ? `${"-".repeat(line.depth)} ` : ""}
                {line.text}
              </td>
              <td className="py-1.5 pr-2 tabular-nums">{line.allocation ?? ""}</td>
              <td className="py-1.5" />
            </tr>
          ))}
          {Array.from({ length: fillerRows }, (_, i) => (
            <tr key={`f${i}`} className="border-b border-[#1F2C2B]/10">
              <td className="py-3 pr-2" />
              <td className="py-3 pr-2" />
              <td className="py-3 pr-2" />
              <td className="py-3" />
            </tr>
          ))}
          <tr>
            <td />
            <td />
            <td className="py-2 pr-2 font-normal">Subtotal</td>
            <td className="border border-[#1F2C2B]/20 px-2 py-2 text-right tabular-nums">
              {fmtAmount(invoice.amountCents)}
            </td>
          </tr>
          <tr>
            <td />
            <td />
            <td className="py-2 pr-2">Total</td>
            <td className="border border-[#1F2C2B]/20 px-2 py-2 text-right font-semibold tabular-nums">
              {fmtAmount(invoice.amountCents)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="mt-12 text-center font-['Inter_Tight',sans-serif] text-[30px] font-light tracking-wide text-[#4B5563]">
        Please Pay via ACH
      </p>
      <p className="mt-3 text-center text-[13px] font-bold italic">Thank you for your business!</p>

      <div className="mt-10 text-center text-[13px] leading-relaxed text-[#4B5563]">
        {sender.lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        <p>{senderEmail}</p>
      </div>
    </div>
  )
}
