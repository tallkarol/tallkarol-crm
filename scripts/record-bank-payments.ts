/**
 * Record confirmed bank deposits as paid invoices.
 * Idempotent — safe to re-run.
 *
 *   npx tsx scripts/record-bank-payments.ts
 */
import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

import { eq, sql } from "drizzle-orm"
import { db } from "../db"
import { clients, invoices } from "../db/schema"
import { IDS } from "../db/seed-ids"

const MINERALIFE_BILL = "Rebecca Goffe, Mineralife Nutraceuticals LLC"
const GDI_RETAINER = IDS.retainers.gdi
const MINERALIFE_RETAINER = IDS.retainers.mineralife
const ZEMVELO_RETAINER = IDS.retainers.zemvelo
const DQS_PROJECT = IDS.projects.dqs
const DQS_DEPOSIT = "aa000000-0000-4000-8000-000000000001"

function gdiHours(amountCents: number) {
  return (amountCents / 6000).toFixed(2)
}

function gdiNotes(hours: string, paidOn: string) {
  return `1099. ${Number(hours)} hr at $60/hr. Recorded from bank deposit ${paidOn}.`
}

async function main() {
  await db
    .insert(clients)
    .values({
      id: IDS.clients.totalSoccerAcademy,
      name: "Total Soccer Academy",
      slug: "total-soccer-academy",
      notes: "Karol Boryka. Ended.",
    })
    .onConflictDoUpdate({
      target: clients.id,
      set: {
        name: sql`excluded.name`,
        notes: sql`excluded.notes`,
        updatedAt: new Date(),
      },
    })

  const created = [
    {
      number: "023-M",
      clientId: IDS.clients.mineralife,
      retainerId: MINERALIFE_RETAINER,
      issuedOn: "2026-01-31",
      amountCents: 178165,
      hours: "30.00",
      billTo: MINERALIFE_BILL,
      description: "January 2026 marketing consulting, 30 hrs.",
      notes: "Recorded from bank deposit Mar 19, 2026. Memo: mineralife.",
    },
    {
      number: "024-M",
      clientId: IDS.clients.mineralife,
      retainerId: MINERALIFE_RETAINER,
      issuedOn: "2026-02-28",
      amountCents: 178165,
      hours: "30.00",
      billTo: MINERALIFE_BILL,
      description: "February 2026 marketing consulting, 30 hrs.",
      notes: "Recorded from bank deposit Mar 19, 2026. Memo: mineralife.",
    },
    {
      number: "052-Z",
      clientId: IDS.clients.zemvelo,
      retainerId: ZEMVELO_RETAINER,
      issuedOn: "2026-01-31",
      amountCents: 114575,
      hours: "20.00",
      billTo: MINERALIFE_BILL,
      description: "January 2026 web dev consulting, 20 hrs.",
      notes:
        "Recorded from bank deposit Mar 19, 2026. Memo: mineralife. Zemvelo 20-hr rate.",
    },
    {
      number: "053-Z",
      clientId: IDS.clients.zemvelo,
      retainerId: ZEMVELO_RETAINER,
      issuedOn: "2026-02-28",
      amountCents: 114575,
      hours: "20.00",
      billTo: MINERALIFE_BILL,
      description: "February 2026 web dev consulting, 20 hrs.",
      notes:
        "Recorded from bank deposit Mar 19, 2026. Memo: mineralife. Zemvelo 20-hr rate.",
    },
    ...gdiInvoice("GDI-2026-06", "2026-06-30", 218100, "June 2026 hours", "Jul 12, 2026"),
    ...gdiInvoice("GDI-2026-05", "2026-05-31", 267800, "May 2026 hours", "Jun 7, 2026"),
    ...gdiInvoice("GDI-2026-04", "2026-04-30", 83600, "April 2026 hours", "May 3, 2026"),
    ...gdiInvoice("GDI-2026-03", "2026-03-31", 82700, "March 2026 hours", "Apr 9, 2026"),
    ...gdiInvoice("GDI-2026-02", "2026-02-28", 91900, "February 2026 hours", "Mar 12, 2026"),
    ...gdiInvoice("GDI-2026-01", "2026-01-31", 109400, "January 2026 hours", "Feb 8, 2026"),
    ...gdiInvoice("GDI-2025-12", "2025-12-31", 104800, "December 2025 hours", "Jan 21, 2026"),
    ...gdiInvoice("GDI-2025-11", "2025-11-30", 162900, "November 2025 hours", "Dec 18, 2025"),
    ...gdiInvoice("GDI-2025-10", "2025-10-31", 153300, "October 2025 hours", "Nov 6, 2025"),
    ...gdiInvoice("GDI-2025-09", "2025-09-30", 231500, "September 2025 hours", "Oct 2, 2025"),
    ...gdiInvoice("GDI-2025-08", "2025-08-31", 147100, "August 2025 hours", "Sep 11, 2025"),
    {
      number: "DQS-001",
      clientId: IDS.clients.dqs,
      projectId: DQS_PROJECT,
      issuedOn: "2026-01-20",
      amountCents: 315000,
      billTo: "DQS Solutions & Staffing",
      description: "DQS payment",
      notes:
        "Recorded from bank deposit Jan 20, 2026. Memo: detroit quality. Does not match the $4,160 AXVOR/AIS schedule.",
    },
    {
      number: "DQS-002",
      clientId: IDS.clients.dqs,
      projectId: DQS_PROJECT,
      deliverableId: DQS_DEPOSIT,
      issuedOn: "2026-08-18",
      amountCents: 166400,
      billTo: "DQS Solutions & Staffing",
      description: "Deposit at kickoff",
      notes:
        "Recorded from bank deposit Aug 18, 2026. Memo: detroit quality. Matches the $1,664 AXVOR/AIS deposit.",
    },
    {
      number: "TSA-001",
      clientId: IDS.clients.totalSoccerAcademy,
      issuedOn: "2025-12-03",
      amountCents: 43750,
      billTo: "Karol Boryka, Total Soccer Academy",
      description: "Total Soccer Academy",
      notes: "Recorded from bank deposit Dec 3, 2025. Memo: karol b boryka.",
    },
    {
      number: "TSA-002",
      clientId: IDS.clients.totalSoccerAcademy,
      issuedOn: "2026-01-07",
      amountCents: 8250,
      billTo: "Karol Boryka, Total Soccer Academy",
      description: "Total Soccer Academy",
      notes: "Recorded from bank deposit Jan 7, 2026. Memo: karol boryka.",
    },
  ]

  await db
    .insert(invoices)
    .values(
      created.map((row) => ({
        ...row,
        status: "paid" as const,
        currency: "USD",
      }))
    )
    .onConflictDoUpdate({
      target: invoices.number,
      set: {
        amountCents: sql`excluded.amount_cents`,
        hours: sql`excluded.hours`,
        status: sql`excluded.status`,
        description: sql`excluded.description`,
        notes: sql`excluded.notes`,
        billTo: sql`excluded.bill_to`,
        retainerId: sql`excluded.retainer_id`,
        projectId: sql`excluded.project_id`,
        deliverableId: sql`excluded.deliverable_id`,
        issuedOn: sql`excluded.issued_on`,
        updatedAt: new Date(),
      },
    })

  for (const row of [
    {
      number: "029-M",
      notes:
        "Paid Aug 23, 2026. Bank memo: rtp mineralife nutraceuticals.",
    },
    {
      number: "058-Z",
      notes:
        "Paid Aug 23, 2026. Bank memo: rtp mineralife nutraceuticals. Amount is the Zemvelo 14-hr rate.",
    },
  ]) {
    const existing = await db.query.invoices.findFirst({
      where: eq(invoices.number, row.number),
    })
    if (!existing) throw new Error(`Missing ${row.number}`)
    const notes = existing.notes.includes("Paid Aug 23, 2026")
      ? existing.notes
      : existing.notes.trim()
        ? `${existing.notes.trim()}\n${row.notes}`
        : row.notes
    await db
      .update(invoices)
      .set({
        status: "paid",
        notes,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, existing.id))
  }

  const numbers = [
    "029-M",
    "058-Z",
    ...created.map((row) => row.number),
  ]
  const rows = await db.query.invoices.findMany({
    where: (inv, { inArray }) => inArray(inv.number, numbers),
    with: { client: true },
  })
  rows.sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || a.number.localeCompare(b.number))
  let total = 0
  for (const row of rows) {
    const amount = row.amountCents / 100
    total += amount
    console.log(
      `${row.number.padEnd(12)} ${row.status.padEnd(6)} ${row.client.slug.padEnd(22)} ${amount
        .toFixed(2)
        .padStart(10)}  ${row.issuedOn}`
    )
  }
  console.log(`wrote ${rows.length} invoices · $${total.toFixed(2)}`)
}

function gdiInvoice(
  number: string,
  issuedOn: string,
  amountCents: number,
  description: string,
  paidOn: string
) {
  const hours = gdiHours(amountCents)
  return [
    {
      number,
      clientId: IDS.clients.gdi,
      retainerId: GDI_RETAINER,
      issuedOn,
      amountCents,
      hours,
      billTo: "GDI",
      description,
      notes: gdiNotes(hours, paidOn),
    },
  ]
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
