import { eq } from "drizzle-orm"
import { db } from "@/db"
import { invoices } from "@/db/schema"
import { EntityLink, Fact, Facts, GonePeek, PeekSection } from "@/components/peek/bits"
import { NotesControl, PickButtons, PrimaryAction } from "@/components/peek/controls"
import { clientColor } from "@/lib/client-colors"
import { setInvoiceNotesAction, setInvoiceStatusAction } from "@/lib/peek-actions"
import { ROUTES } from "@/lib/nav"
import { formatDay, formatHours, formatMoney } from "@/lib/work"

function daysSince(iso: string) {
  const [y, m, d] = iso.split("-").map(Number)
  return Math.max(0, Math.floor((Date.now() - Date.UTC(y, m - 1, d)) / 86_400_000))
}

export async function InvoicePeek({ number }: { number: string }) {
  const invoice = await db.query.invoices.findFirst({
    where: eq(invoices.number, number),
    with: {
      client: true,
      retainer: true,
      project: true,
      deliverable: true,
      timeEntries: true,
    },
  })
  if (!invoice) return <GonePeek />

  const hours = invoice.hours ? Number(invoice.hours) : null
  const rate = hours ? invoice.amountCents / hours : null
  const age = daysSince(invoice.issuedOn)
  const overdue = invoice.status === "sent" && age > 30
  const sessions = [...invoice.timeEntries].sort((a, b) =>
    a.occurredOn < b.occurredOn ? -1 : 1
  )
  const loggedHours = sessions.reduce((sum, e) => sum + Number(e.hours), 0)

  return (
    <>
      <div className="px-6 pb-5 pt-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[26px] font-semibold leading-tight text-tk-onyx">
              {formatMoney(invoice.amountCents, invoice.currency)}
            </p>
            <p className="mt-1 text-sm text-tk-slate/70">
              <EntityLink
                href={ROUTES.client(invoice.client.slug)}
                color={clientColor(invoice.client.slug)}
              >
                {invoice.client.name}
              </EntityLink>{" "}
              · issued {formatDay(invoice.issuedOn)}
            </p>
          </div>
          {invoice.status === "sent" ? (
            <p
              className={
                overdue
                  ? "rounded-full bg-[#A62228]/10 px-2.5 py-1 text-[11px] font-bold text-[#A62228]"
                  : "rounded-full bg-amber-700/10 px-2.5 py-1 text-[11px] font-bold text-amber-800"
              }
            >
              {age} {age === 1 ? "day" : "days"} out
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <PickButtons
            current={invoice.status}
            action={setInvoiceStatusAction.bind(null, invoice.id) as (v: string) => Promise<{ ok: boolean; error?: string }>}
            options={[
              { value: "draft", label: "Draft", tone: "neutral" },
              { value: "sent", label: "Sent", tone: "neutral" },
              { value: "paid", label: "Paid" },
            ]}
          />
          {invoice.status === "sent" ? (
            <PrimaryAction
              label="Mark paid"
              doneLabel="Paid ✓"
              action={setInvoiceStatusAction.bind(null, invoice.id, "paid")}
            />
          ) : null}
        </div>
      </div>

      <PeekSection title="Details">
        <Facts>
          {invoice.retainer ? (
            <Fact label="Retainer">
              <EntityLink href={ROUTES.retainer(invoice.retainer.slug)}>
                {invoice.retainer.name}
              </EntityLink>
            </Fact>
          ) : null}
          {invoice.project ? (
            <Fact label="Project">
              <EntityLink href={ROUTES.project(invoice.project.slug)}>
                {invoice.project.name}
              </EntityLink>
            </Fact>
          ) : null}
          {hours ? (
            <Fact label="Hours">
              <span className="tabular-nums">{formatHours(invoice.hours)}</span>
              {rate ? (
                <span className="text-tk-slate/55"> · {formatMoney(Math.round(rate))}/hr</span>
              ) : null}
            </Fact>
          ) : null}
          <Fact label="Timesheet">
            <EntityLink
              href={ROUTES.timesheetFor(invoice.client.slug, invoice.issuedOn.slice(0, 7))}
            >
              {invoice.issuedOn.slice(0, 7)}
            </EntityLink>
          </Fact>
          {invoice.deliverable ? (
            <Fact label="Deliverable" wide>
              {invoice.deliverable.label}
              {invoice.deliverable.title ? ` · ${invoice.deliverable.title}` : ""}
            </Fact>
          ) : null}
          {invoice.billTo ? (
            <Fact label="Bill to" wide>
              {invoice.billTo}
            </Fact>
          ) : null}
          {invoice.description ? (
            <Fact label="Description" wide>
              <span className="whitespace-pre-wrap text-tk-slate/80">
                {invoice.description}
              </span>
            </Fact>
          ) : null}
        </Facts>
      </PeekSection>

      {sessions.length > 0 ? (
        <PeekSection title={`Work behind it · ${loggedHours.toLocaleString("en-US", { maximumFractionDigits: 1 })} hr logged`}>
          <ul className="space-y-1.5">
            {sessions.slice(0, 8).map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-tk-slate/80">
                  <span className="mr-2 tabular-nums text-tk-slate/50">
                    {formatDay(entry.occurredOn)}
                  </span>
                  {entry.summary || "—"}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-tk-onyx">
                  {Number(entry.hours).toLocaleString("en-US", { maximumFractionDigits: 2 })} hr
                </span>
              </li>
            ))}
            {sessions.length > 8 ? (
              <li className="text-[11px] text-tk-slate/55">
                + {sessions.length - 8} more on the full page
              </li>
            ) : null}
          </ul>
        </PeekSection>
      ) : null}

      <PeekSection title="Notes">
        <NotesControl
          value={invoice.notes}
          action={setInvoiceNotesAction.bind(null, invoice.id)}
          placeholder="Payment chasing, context, anything future-you needs…"
        />
      </PeekSection>
    </>
  )
}
