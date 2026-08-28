import { inArray, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { loadLocalEnv } from "../lib/load-env"
import {
  clients,
  contracts,
  deliverables,
  invoices,
  projects,
  retainers,
  tasks,
  timeEntries,
} from "./schema"
import { ARTIST_HOUSE_TERMS } from "./agreements/artist-house"
import { DQS_TERMS } from "./agreements/dqs"
import { CAPS_LAUNCH_SESSIONS } from "./caps-hours"
import { GDI_AUGUST_SESSIONS, GDI_JULY_SESSIONS } from "./gdi-hours"
import { IDS } from "./seed-ids"

async function main() {
  loadLocalEnv()
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")

  const client = postgres(url, { max: 1 })
  const db = drizzle(client)

  await db
    .insert(clients)
    .values([
      { id: IDS.clients.gdi, name: "GDI", slug: "gdi", notes: "TBA / UWD" },
      {
        id: IDS.clients.mineralife,
        name: "Mineralife",
        slug: "mineralife",
        notes:
          "mycustommanufacturer.com = their contract-manufacturing brand (GA4 395780153)",
      },
      { id: IDS.clients.zemvelo, name: "Zemvelo", slug: "zemvelo" },
      {
        id: IDS.clients.artistHouse,
        name: "Artist House",
        slug: "artist-house",
        notes: "Joe Ruzicka",
      },
      {
        id: IDS.clients.dqs,
        name: "DQS",
        slug: "dqs",
        notes: "DQS Solutions & Staffing · AXVOR / AIS",
      },
      { id: IDS.clients.domynovy, name: "Domynovy", slug: "domynovy" },
      {
        id: IDS.clients.capsFieldhouse,
        name: "CAPS Fieldhouse",
        slug: "caps-fieldhouse",
        notes:
          "Grace Sweeney · 6060 W Canal Rd, Valley View, OH 44125. Website launched Nov 13, 2025. $65/hr. Invoice 002 still open. ACF event system agreed, not started.",
      },
      {
        id: IDS.clients.totalSoccerAcademy,
        name: "Total Soccer Academy",
        slug: "total-soccer-academy",
        notes: "Karol Boryka. Ended.",
      },
    ])
    .onConflictDoUpdate({
      target: clients.id,
      set: {
        name: sql`excluded.name`,
        notes: sql`excluded.notes`,
        updatedAt: new Date(),
      },
    })

  await db
    .insert(retainers)
    .values([
      {
        id: IDS.retainers.gdi,
        clientId: IDS.clients.gdi,
        name: "GDI",
        slug: "gdi",
        hoursPerMonth: 80,
        rateCents: 6000,
        status: "active",
        startsOn: "2026-09-01",
        endsOn: "2026-12-31",
      },
      {
        id: IDS.retainers.mineralife,
        clientId: IDS.clients.mineralife,
        name: "Mineralife",
        slug: "mineralife",
        hoursPerMonth: 30,
        status: "active",
      },
      {
        id: IDS.retainers.zemvelo,
        clientId: IDS.clients.zemvelo,
        name: "Zemvelo",
        slug: "zemvelo",
        hoursPerMonth: 20,
        status: "active",
      },
    ])
    .onConflictDoUpdate({
      target: retainers.id,
      set: {
        hoursPerMonth: sql`excluded.hours_per_month`,
        rateCents: sql`excluded.rate_cents`,
        status: sql`excluded.status`,
        startsOn: sql`excluded.starts_on`,
        endsOn: sql`excluded.ends_on`,
        notes: sql`excluded.notes`,
        updatedAt: new Date(),
      },
    })

  await db
    .insert(projects)
    .values([
      {
        id: IDS.projects.artistHouse,
        clientId: IDS.clients.artistHouse,
        name: "Artist House",
        slug: "artist-house",
        status: "complete",
        feeStatus: "paid",
        notes:
          "A/R intelligence tool. $8,500 — deposit $3,400, D1 $2,550, D2 $2,550. All three paid.",
      },
      {
        id: IDS.projects.dqs,
        clientId: IDS.clients.dqs,
        name: "DQS / AXVOR / AIS",
        slug: "dqs-axvor-ais",
        status: "in_progress",
        feeStatus: "deposit_paid",
        notes:
          "Three sites on one foundation: DQS rebuild, Axvor, AIS. $4,160 — deposit $1,664 paid, D1 $1,248 done not invoiced, D2 $1,248 go-live Sept 14.",
      },
      {
        id: IDS.projects.wzgorzynova,
        clientId: IDS.clients.domynovy,
        name: "Wzgorzynova",
        slug: "wzgorzynova",
        status: "complete",
        feeStatus: "paid",
      },
      {
        id: IDS.projects.domynova,
        clientId: IDS.clients.domynovy,
        name: "Domynova",
        slug: "domynova",
        status: "complete",
        feeStatus: "paid",
      },
      {
        id: IDS.projects.domynovy,
        clientId: IDS.clients.domynovy,
        name: "Domynovy",
        slug: "domynovy",
        status: "waiting_on_content",
        feeStatus: "agreed",
        notes:
          "Fee agreed. Waiting on required content/media before kickoff.",
      },
      {
        id: IDS.projects.capsFieldhouse,
        clientId: IDS.clients.capsFieldhouse,
        name: "CAPS Fieldhouse website",
        slug: "caps-fieldhouse",
        status: "in_progress",
        feeStatus: "agreed",
        notes:
          "Launched Nov 13, 2025. Invoice 001 paid (14.98 hr · $973.93). Invoice 002 still open — leftover post-launch hours, to be billed with the event system.",
      },
      {
        id: IDS.projects.capsEvents,
        clientId: IDS.clients.capsFieldhouse,
        name: "ACF event system",
        slug: "caps-fieldhouse-events",
        status: "in_progress",
        feeStatus: "agreed",
        notes:
          "Scoped and agreed. ACF-driven event system integrated across the site. ~4–5 hr backend, ~2 hr front end. Cap at $400. Not started. Bill on Invoice 002 with remaining website hours.",
      },
    ])
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        status: sql`excluded.status`,
        feeStatus: sql`excluded.fee_status`,
        notes: sql`excluded.notes`,
        retainerId: sql`excluded.retainer_id`,
        updatedAt: new Date(),
      },
    })

  await db
    .insert(deliverables)
    .values([
      {
        id: IDS.deliverables.ah1,
        projectId: IDS.projects.artistHouse,
        label: "D1",
        title: "Initial UI, Soundcharts, sample CSV",
        status: "paid",
        sort: 1,
      },
      {
        id: IDS.deliverables.ah2,
        projectId: IDS.projects.artistHouse,
        label: "D2",
        title: "Daily reports, production, handoff",
        status: "paid",
        sort: 2,
      },
      {
        id: IDS.deliverables.dqs1,
        projectId: IDS.projects.dqs,
        label: "D1",
        title: "Foundation, DQS + AIS staging",
        status: "done",
        sort: 1,
      },
      {
        id: IDS.deliverables.dqs2,
        projectId: IDS.projects.dqs,
        label: "D2",
        title: "Go-live — DQS, Axvor, AIS",
        status: "pending",
        sort: 2,
      },
      {
        id: IDS.deliverables.caps1,
        projectId: IDS.projects.capsFieldhouse,
        label: "001",
        title: "Hosting transfer, redesign, and launch",
        status: "paid",
        sort: 1,
      },
      {
        id: IDS.deliverables.caps2,
        projectId: IDS.projects.capsFieldhouse,
        label: "002",
        title: "Invoice 002 — leftover post-launch hours",
        status: "pending",
        sort: 2,
      },
      {
        id: IDS.deliverables.capsEvents,
        projectId: IDS.projects.capsEvents,
        label: "Events",
        title: "ACF event system, site-wide",
        status: "pending",
        sort: 1,
      },
    ])
    .onConflictDoUpdate({
      target: deliverables.id,
      set: {
        status: sql`excluded.status`,
        title: sql`excluded.title`,
      },
    })

  await db
    .delete(deliverables)
    .where(inArray(deliverables.id, [IDS.deliverables.ah3, IDS.deliverables.dqs3]))

  await db
    .insert(tasks)
    .values([
      {
        id: IDS.tasks.gdiHours,
        title: "Monthly hours",
        clientId: IDS.clients.gdi,
        retainerId: IDS.retainers.gdi,
        cadence: "monthly",
        status: "open",
      },
      {
        id: IDS.tasks.mineralifeHours,
        title: "Monthly hours",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        cadence: "monthly",
        status: "open",
      },
      {
        id: IDS.tasks.zemveloHours,
        title: "Monthly hours",
        clientId: IDS.clients.zemvelo,
        retainerId: IDS.retainers.zemvelo,
        cadence: "monthly",
        status: "open",
      },
      {
        id: IDS.tasks.dqsInvoiceD1,
        title: "Invoice D1",
        clientId: IDS.clients.dqs,
        projectId: IDS.projects.dqs,
        cadence: "none",
        status: "open",
        notes: "D1 is done. Deposit is in. Invoice the deliverable.",
      },
      {
        id: IDS.tasks.domynovyContent,
        title: "Collect required content/media",
        clientId: IDS.clients.domynovy,
        projectId: IDS.projects.domynovy,
        cadence: "none",
        status: "open",
        notes: "Kickoff waits on this.",
      },
      {
        id: IDS.tasks.capsInvoice2,
        title: "Invoice 002 still open",
        clientId: IDS.clients.capsFieldhouse,
        projectId: IDS.projects.capsFieldhouse,
        cadence: "none",
        status: "open",
        notes:
          "Leftover website hours plus the event system ($400 cap). Don’t send until the events work is done.",
      },
      {
        id: IDS.tasks.capsEvents,
        title: "Start ACF event system",
        clientId: IDS.clients.capsFieldhouse,
        projectId: IDS.projects.capsEvents,
        cadence: "none",
        status: "open",
        notes:
          "Agreed. ~4–5 hr backend, ~2 hr front end. $400 cap. Hasn’t started.",
      },
      {
        id: IDS.tasks.gdiTba404,
        title: "Check TBA 404 errors",
        clientId: IDS.clients.gdi,
        retainerId: IDS.retainers.gdi,
        cadence: "none",
        status: "open",
        dueOn: "2026-08-31",
        notes:
          "Due Monday. See email in karol.remote@gmail.com about the TBA 404s.",
      },
      {
        id: IDS.tasks.gdiUwdLocalLinks,
        title: "Scan UWD preprod for .local links",
        clientId: IDS.clients.gdi,
        retainerId: IDS.retainers.gdi,
        cadence: "none",
        status: "open",
        notes:
          "Find .local links on UWD preprod and update just those to the preprod address — content bundle or otherwise.",
      },
    ])
    .onConflictDoUpdate({
      target: tasks.id,
      set: {
        title: sql`excluded.title`,
        status: sql`excluded.status`,
        notes: sql`excluded.notes`,
        dueOn: sql`excluded.due_on`,
        updatedAt: new Date(),
      },
    })

  await db
    .insert(invoices)
    .values([
      {
        id: IDS.invoices.gdiJuly,
        number: "GDI-2026-07",
        clientId: IDS.clients.gdi,
        retainerId: IDS.retainers.gdi,
        issuedOn: "2026-07-31",
        amountCents: 122500,
        hours: "20.42",
        status: "sent",
        billTo: "GDI",
        description: "July 2026 hours",
        notes: "1099. 20.42 hr at $60/hr. TBA homepage, UWD preprod, Zapier.",
      },
      {
        id: IDS.invoices.gdiAugust,
        number: "GDI-2026-08",
        clientId: IDS.clients.gdi,
        retainerId: IDS.retainers.gdi,
        issuedOn: "2026-08-31",
        amountCents: 421500,
        hours: "70.25",
        status: "sent",
        billTo: "GDI",
        description: "August 2026 hours",
        notes: "1099. 70.25 hr at $60/hr. UWD migration, punchlist.",
      },
      {
        id: IDS.invoices.ah001,
        number: "001",
        clientId: IDS.clients.artistHouse,
        projectId: IDS.projects.artistHouse,
        issuedOn: "2026-04-03",
        amountCents: 340000,
        status: "paid",
        billTo: "Joe Ruzicka, Artist House",
        description: "Downpayment for A/R intelligence tool",
        notes: "40% deposit on the $8,500 project. Agreement signed April 7.",
      },
      {
        id: IDS.invoices.ah002,
        number: "002",
        clientId: IDS.clients.artistHouse,
        projectId: IDS.projects.artistHouse,
        deliverableId: IDS.deliverables.ah1,
        issuedOn: "2026-07-06",
        amountCents: 255000,
        status: "paid",
        billTo: "Joe Ruzicka, Artist House",
        description: "D1 for A/R intelligence tool",
        notes:
          "Initial UI with sample CSV. Soundcharts API and scraper. Database setup. Sample CSV report. Email delivery (SendGrid). First 7 days of historical chart data.",
      },
      {
        id: IDS.invoices.ah003,
        number: "003",
        clientId: IDS.clients.artistHouse,
        projectId: IDS.projects.artistHouse,
        deliverableId: IDS.deliverables.ah2,
        issuedOn: "2026-08-12",
        amountCents: 255000,
        status: "paid",
        billTo: "Joe Ruzicka, Artist House",
        description: "D2 for A/R intelligence tool",
        notes:
          "UI refinements. Custom reports builder and scheduler. Daily report ingestion. Production environments and source packaged for handoff.",
      },
      {
        id: IDS.invoices.caps001,
        number: "CAPS-001",
        clientId: IDS.clients.capsFieldhouse,
        projectId: IDS.projects.capsFieldhouse,
        deliverableId: IDS.deliverables.caps1,
        issuedOn: "2025-11-13",
        amountCents: 97393,
        hours: "14.98",
        status: "paid",
        billTo: "Grace Sweeney, CAPS Fieldhouse, 6060 W Canal Rd, Valley View, OH 44125",
        description: "Hosting transfer, website redesign and launch",
        notes: "Paper invoice 001. 14.98 hr at $65/hr. Paid via Venmo @TallKarol.",
      },
    ])
    .onConflictDoUpdate({
      target: invoices.id,
      set: {
        amountCents: sql`excluded.amount_cents`,
        hours: sql`excluded.hours`,
        status: sql`excluded.status`,
        description: sql`excluded.description`,
        notes: sql`excluded.notes`,
        billTo: sql`excluded.bill_to`,
        updatedAt: new Date(),
      },
    })

  const gdiSessions = [
    ...GDI_JULY_SESSIONS.map((session) => ({
      ...session,
      invoiceId: IDS.invoices.gdiJuly,
    })),
    ...GDI_AUGUST_SESSIONS.map((session) => ({
      ...session,
      invoiceId: IDS.invoices.gdiAugust,
    })),
  ]

  await db
    .insert(timeEntries)
    .values(
      gdiSessions.map((session, index) => ({
        id: `a7000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, "0")}`,
        clientId: IDS.clients.gdi,
        retainerId: IDS.retainers.gdi,
        invoiceId: session.invoiceId,
        occurredOn: session.occurredOn,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        hours: session.hours,
        summary: session.summary,
      }))
    )
    .onConflictDoUpdate({
      target: timeEntries.id,
      set: {
        hours: sql`excluded.hours`,
        summary: sql`excluded.summary`,
        startedAt: sql`excluded.started_at`,
        endedAt: sql`excluded.ended_at`,
        occurredOn: sql`excluded.occurred_on`,
        invoiceId: sql`excluded.invoice_id`,
      },
    })

  await db
    .insert(timeEntries)
    .values(
      CAPS_LAUNCH_SESSIONS.map((session, index) => ({
        id: `a7100000-0000-4000-8000-0000000000${String(index + 1).padStart(2, "0")}`,
        clientId: IDS.clients.capsFieldhouse,
        projectId: IDS.projects.capsFieldhouse,
        invoiceId: IDS.invoices.caps001,
        occurredOn: session.occurredOn,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        hours: session.hours,
        summary: session.summary,
      }))
    )
    .onConflictDoUpdate({
      target: timeEntries.id,
      set: {
        hours: sql`excluded.hours`,
        summary: sql`excluded.summary`,
        startedAt: sql`excluded.started_at`,
        endedAt: sql`excluded.ended_at`,
        occurredOn: sql`excluded.occurred_on`,
        invoiceId: sql`excluded.invoice_id`,
        projectId: sql`excluded.project_id`,
      },
    })

  await db
    .insert(contracts)
    .values([
      {
        id: IDS.contracts.artistHouse,
        title: "A&R Intelligence Tool",
        slug: "artist-house-ar",
        clientId: IDS.clients.artistHouse,
        projectId: IDS.projects.artistHouse,
        status: "signed",
        effectiveOn: "2026-04-07",
        feeCents: 850000,
        counterparty: "Artist House",
        governingLaw: "State of New York",
        venue: "New York County, New York",
        terms: ARTIST_HOUSE_TERMS,
        notes: "Execution copy. Soundcharts + daily reports. 30-day warranty after D2.",
      },
      {
        id: IDS.contracts.dqs,
        title: "Website Design, Development & Services",
        slug: "dqs-websites",
        clientId: IDS.clients.dqs,
        projectId: IDS.projects.dqs,
        status: "signed",
        effectiveOn: "2026-08-11",
        feeCents: 416000,
        counterparty: "DQS Solutions & Staffing",
        governingLaw: "State of Michigan",
        venue: "Wayne County, Michigan",
        extraRateCents: 9000,
        terms: DQS_TERMS,
        notes: "Target go-live Sept 14. Extra work $90/hr.",
      },
    ])
    .onConflictDoUpdate({
      target: contracts.id,
      set: {
        title: sql`excluded.title`,
        status: sql`excluded.status`,
        feeCents: sql`excluded.fee_cents`,
        counterparty: sql`excluded.counterparty`,
        governingLaw: sql`excluded.governing_law`,
        venue: sql`excluded.venue`,
        extraRateCents: sql`excluded.extra_rate_cents`,
        terms: sql`excluded.terms`,
        notes: sql`excluded.notes`,
        effectiveOn: sql`excluded.effective_on`,
        updatedAt: new Date(),
      },
    })

  console.log("Work seed complete.")
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
