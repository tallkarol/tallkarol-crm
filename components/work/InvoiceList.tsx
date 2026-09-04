import Link from "next/link"
import { Badge } from "@/components/work/Badge"
import type { Invoice, InvoiceStatus } from "@/db/schema"
import { ROUTES } from "@/lib/nav"
import {
  INVOICE_STATUS_LABEL,
  formatDay,
  formatHours,
  formatMoney,
} from "@/lib/work"

export function invoiceTone(status: InvoiceStatus) {
  if (status === "paid") return "muted" as const
  if (status === "sent") return "teal" as const
  return "neutral" as const
}

export function InvoiceList({
  invoices,
}: {
  invoices: (Invoice & { clientName?: string })[]
}) {
  return (
    <ul className="divide-y divide-line">
      {invoices.map((invoice) => (
        <li key={invoice.id}>
          <Link
            href={ROUTES.invoice(invoice.number)}
            className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-well"
          >
            <div className="min-w-0">
              <p className="font-medium text-tk-onyx">
                {invoice.number}
                {invoice.description ? (
                  <span className="font-normal text-ink-3">
                    {" "}
                    · {invoice.description}
                  </span>
                ) : null}
              </p>
              <p className="mt-0.5 text-sm text-ink-3">
                {[invoice.clientName, formatDay(invoice.issuedOn)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              {invoice.hours ? (
                <Badge>{formatHours(invoice.hours)}</Badge>
              ) : null}
              <span className="text-sm font-semibold tabular-nums text-tk-onyx">
                {formatMoney(invoice.amountCents, invoice.currency)}
              </span>
              <Badge tone={invoiceTone(invoice.status)}>
                {INVOICE_STATUS_LABEL[invoice.status]}
              </Badge>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  )
}
