import { eq, inArray, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { loadLocalEnv } from "../lib/load-env"
import {
  clients,
  contracts,
  deliverables,
  invoices,
  productStudios,
  products,
  projects,
  proposals,
  reports,
  retainers,
  taskItems,
  tasks,
  timeEntries,
  workstreams,
  worksheets,
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
      {
        id: IDS.clients.blissCb,
        name: "Bliss CB",
        slug: "bliss-cb",
        notes: "Ended. Paid through Detroit Quality.",
      },
      {
        id: IDS.clients.sondry,
        name: "Sondry",
        slug: "sondry",
        notes:
          "Side-project digital product studio with a partner. Not a billed client — notions, mail, and the products live here. Spectramotus, Momentum, Jive. Practice for the product-development work that follows a build.",
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
        notes:
          "September: titles & descriptions (SERP CTR on ~29k non-brand impressions) and a blog pipeline — 12–15 posts queued by month-end, then one a week through year-end.",
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
      {
        id: IDS.projects.mineralifeTitles,
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        name: "Titles and descriptions",
        slug: "mineralife-titles-descriptions",
        status: "in_progress",
        feeStatus: "agreed",
        links: [
          { label: "Live", url: "https://www.mycustommanufacturer.com" },
          {
            label: "Insights",
            url: "https://crm.tallkarol.com/insights/mycustommanufacturer",
          },
        ],
        notes:
          "August SEM: impressions +11%, position 3.2 better, clicks −16.6%. The pages are found and climbing; the listing is not winning the click. 60 of 68 attributed clicks were brand-name searches (27% CTR). Everything else: 1,108 terms, 28,964 impressions, 0.03% CTR. Core terms shown hundreds of times at positions 3–12 with zero clicks — supplement manufacturer, custom supplement manufacturer, nutraceutical manufacturing. Audit every title and description against GSC, Ads, the site, and the SEM report, then rewrite the ones that can move the number. Billed to the September retainer.",
      },
      {
        id: IDS.projects.mineralifeBlog,
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        name: "Blog pipeline",
        slug: "mineralife-blog-pipeline",
        status: "in_progress",
        feeStatus: "agreed",
        links: [
          { label: "Blog", url: "https://www.mycustommanufacturer.com/blog" },
          {
            label: "Insights",
            url: "https://crm.tallkarol.com/insights/mycustommanufacturer",
          },
          {
            label: "Blog Generation (tracker row 16)",
            url: "https://app.smartsheet.com/sheets/x6rcQmmq72pmRxjRFx5vVw5j5x8PGhrvVVvrChV1?rowId=7205046678912900",
          },
        ],
        notes:
          "Organic is the long game. Paid can be judged in weeks; this cannot. Stand up a pipeline that can take a batch of posts and schedule them on a clock — then fill it with 12 posts by 30 September (15 if the writing holds), so one a week is already queued through year-end. Each publish gets agentic follow-up: index the URL, check it appeared, fix the ones Google skips (the hiring post with the emoji slug and glutathione are already in that state). Read the plan after 3–6 months, not next week. Billed to the September retainer.\n\nThe queue does not start empty. Blog Generation is row 16 of the marketing tracker — Rebecca's, assigned to BG at 1–3 blogs a week, in progress, due 30 September. Its note reads: \"3 blogs attached 07/01/26 / 3 blogs attached 07/09/26 / - need uploaded to B2B site\". So six posts are already written and sitting on that row waiting to go up. Count them against the 12 before commissioning anything new, and check the row for more before each batch — it is the upstream feed for this pipeline. It stays out of the CRM's synced projects because the sync only claims rows assigned to me.",
      },
    ])
    .onConflictDoUpdate({
      target: projects.id,
      set: {
        status: sql`excluded.status`,
        feeStatus: sql`excluded.fee_status`,
        notes: sql`excluded.notes`,
        links: sql`excluded.links`,
        retainerId: sql`excluded.retainer_id`,
        updatedAt: new Date(),
      },
    })

  await db
    .insert(productStudios)
    .values([
      {
        id: IDS.studios.sondry,
        name: "Sondry",
        slug: "sondry",
        kind: "studio",
        clientId: IDS.clients.sondry,
        sort: 1,
        notes:
          "Side-project digital product studio with a partner. Dabble, don't dominate the week.",
      },
      {
        id: IDS.studios.tallkarol,
        name: "Tall Karol",
        slug: "tall-karol",
        kind: "solo",
        sort: 2,
        notes: "Your own products. Built as Tall Karol.",
      },
    ])
    .onConflictDoUpdate({
      target: productStudios.id,
      set: {
        name: sql`excluded.name`,
        slug: sql`excluded.slug`,
        kind: sql`excluded.kind`,
        clientId: sql`excluded.client_id`,
        notes: sql`excluded.notes`,
        sort: sql`excluded.sort`,
        updatedAt: new Date(),
      },
    })

  await db
    .insert(products)
    .values([
      {
        id: IDS.products.spectramotus,
        studioId: IDS.studios.sondry,
        clientId: IDS.clients.sondry,
        name: "Spectramotus",
        slug: "spectramotus",
        tagline: "Sondry product.",
        status: "building",
        sort: 1,
        notes: "Sondry. First up: a full digital product page presentation.",
      },
      {
        id: IDS.products.momentum,
        studioId: IDS.studios.sondry,
        clientId: IDS.clients.sondry,
        name: "Momentum",
        slug: "momentum",
        tagline: "Sondry product.",
        status: "building",
        sort: 2,
        notes: "Sondry. Building.",
      },
      {
        id: IDS.products.jive,
        studioId: IDS.studios.sondry,
        clientId: IDS.clients.sondry,
        name: "Jive",
        slug: "jive",
        tagline: "Sondry product.",
        status: "building",
        sort: 3,
        notes: "Sondry. First up: a full digital product page presentation.",
      },
      {
        id: IDS.products.daedalus,
        studioId: IDS.studios.tallkarol,
        clientId: null,
        name: "Daedalus",
        slug: "daedalus",
        tagline: "",
        status: "building",
        sort: 1,
        notes:
          "Insights, hive-mind, client packs — the product-development line.",
      },
    ])
    .onConflictDoUpdate({
      target: products.id,
      set: {
        name: sql`excluded.name`,
        tagline: sql`excluded.tagline`,
        status: sql`excluded.status`,
        notes: sql`excluded.notes`,
        sort: sql`excluded.sort`,
        studioId: sql`excluded.studio_id`,
        clientId: sql`excluded.client_id`,
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
      {
        id: IDS.deliverables.mineralifeTitlesInventory,
        projectId: IDS.projects.mineralifeTitles,
        label: "Inventory",
        title: "Current titles and descriptions vs all query and page data",
        status: "pending",
        sort: 1,
        dueOn: "2026-09-12",
      },
      {
        id: IDS.deliverables.mineralifeTitlesRewrite,
        projectId: IDS.projects.mineralifeTitles,
        label: "Rewrites",
        title: "Titles and descriptions for high-impression, low-CTR pages",
        status: "pending",
        sort: 2,
        dueOn: "2026-09-26",
      },
      {
        id: IDS.deliverables.mineralifeTitlesShip,
        projectId: IDS.projects.mineralifeTitles,
        label: "Ship",
        title: "Published, confirmed in the SERP, August baseline recorded",
        status: "pending",
        sort: 3,
        dueOn: "2026-09-30",
      },
      {
        id: IDS.deliverables.mineralifeBlogPipeline,
        projectId: IDS.projects.mineralifeBlog,
        label: "Pipeline",
        title: "CMS can take a batch and schedule consistent publish dates",
        status: "pending",
        sort: 1,
        dueOn: "2026-09-12",
      },
      {
        id: IDS.deliverables.mineralifeBlogQueue,
        projectId: IDS.projects.mineralifeBlog,
        label: "Queue",
        title: "12 posts in by 30 September — 15 if the writing holds",
        status: "pending",
        sort: 2,
        dueOn: "2026-09-30",
      },
      {
        id: IDS.deliverables.mineralifeBlogCadence,
        projectId: IDS.projects.mineralifeBlog,
        label: "Cadence",
        title: "Weekly publish through year-end, with index and follow-up on each",
        status: "pending",
        sort: 3,
        dueOn: "2026-10-05",
      },
      {
        id: IDS.deliverables.mineralifeBlogReview,
        projectId: IDS.projects.mineralifeBlog,
        label: "Review",
        title: "Read the plan after 3–6 months of weekly publishing",
        status: "pending",
        sort: 4,
        dueOn: "2027-01-31",
      },
    ])
    .onConflictDoUpdate({
      target: deliverables.id,
      set: {
        status: sql`excluded.status`,
        title: sql`excluded.title`,
        dueOn: sql`excluded.due_on`,
      },
    })

  await db
    .delete(deliverables)
    .where(inArray(deliverables.id, [IDS.deliverables.ah3, IDS.deliverables.dqs3]))

  await db
    .insert(workstreams)
    .values([
      {
        id: IDS.workstreams.mineralifeTitlesAudit,
        projectId: IDS.projects.mineralifeTitles,
        title: "Audit against the data",
        stage: "building",
        sort: 1,
        notes:
          "GSC, current titles/descriptions, SEM report, Ads keywords — one working set.",
      },
      {
        id: IDS.workstreams.mineralifeTitlesRewrite,
        projectId: IDS.projects.mineralifeTitles,
        title: "Rewrite titles and descriptions",
        stage: "building",
        sort: 2,
        notes:
          "Win the click at positions 8–12. Core terms first. Stay in Mineralife's own language.",
      },
      {
        id: IDS.workstreams.mineralifeTitlesShip,
        projectId: IDS.projects.mineralifeTitles,
        title: "Ship and confirm in the SERP",
        stage: "building",
        sort: 3,
        notes: "Publish, confirm render, snapshot the August baseline.",
      },
      {
        id: IDS.workstreams.mineralifeBlogPipeline,
        projectId: IDS.projects.mineralifeBlog,
        title: "Stand up the pipeline",
        stage: "building",
        sort: 1,
        notes: "Upload a batch, set dates, publish on a clock.",
      },
      {
        id: IDS.workstreams.mineralifeBlogQueue,
        projectId: IDS.projects.mineralifeBlog,
        title: "Fill the queue",
        stage: "building",
        sort: 2,
        notes: "12 by 30 September, 15 if the writing holds.",
      },
      {
        id: IDS.workstreams.mineralifeBlogPlaybook,
        projectId: IDS.projects.mineralifeBlog,
        title: "Publish-week playbook",
        stage: "building",
        sort: 3,
        notes: "Index, confirm crawl, follow up the ones Google skips.",
      },
    ])
    .onConflictDoUpdate({
      target: workstreams.id,
      set: {
        title: sql`excluded.title`,
        notes: sql`excluded.notes`,
        sort: sql`excluded.sort`,
        updatedAt: new Date(),
      },
    })

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
      {
        id: IDS.tasks.spectramotusPresentation,
        title: "Build a full digital product page presentation",
        clientId: IDS.clients.sondry,
        productId: IDS.products.spectramotus,
        cadence: "none",
        status: "open",
        priority: 1,
        notes:
          "Full presentation page for Spectramotus — the product, not a client site.",
      },
      {
        id: IDS.tasks.jivePresentation,
        title: "Build a full digital product page presentation",
        clientId: IDS.clients.sondry,
        productId: IDS.products.jive,
        cadence: "none",
        status: "open",
        priority: 1,
        notes:
          "Full presentation page for Jive — the product, not a client site.",
      },
      {
        id: IDS.tasks.mineralifeTitlesData,
        title: "Pull titles, descriptions, and query data into one working set",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        projectId: IDS.projects.mineralifeTitles,
        deliverableId: IDS.deliverables.mineralifeTitlesInventory,
        cadence: "none",
        status: "open",
        priority: 1,
        dueOn: "2026-09-12",
        notes:
          "August SEM: 32,878 impressions, 131 clicks, 0.40% CTR, avg position 12.9. Brand-name searches: 60 clicks / 219 impressions (27% CTR). Everything else: 8 clicks / 28,964 impressions (0.03% CTR). Use GSC, the live site, Ads keyword research, and the August SEM report.",
      },
      {
        id: IDS.tasks.mineralifeTitlesRewrite,
        title: "Rewrite titles and descriptions so the listing wins the click",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        projectId: IDS.projects.mineralifeTitles,
        deliverableId: IDS.deliverables.mineralifeTitlesRewrite,
        cadence: "none",
        status: "open",
        priority: 1,
        dueOn: "2026-09-26",
        notes:
          "Not a ranking problem — pages are found and climbing. A listing at position nine is competing with eight results above it. Fractional CTR lift on ~29k non-brand impressions is worth more than most other work available.",
      },
      {
        id: IDS.tasks.mineralifeTitlesShip,
        title: "Ship the title and description rewrites",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        projectId: IDS.projects.mineralifeTitles,
        deliverableId: IDS.deliverables.mineralifeTitlesShip,
        cadence: "none",
        status: "open",
        priority: 1,
        dueOn: "2026-09-30",
        notes:
          "Publish, confirm they render, snapshot impressions / CTR / position so October can be compared to August.",
      },
      {
        id: IDS.tasks.mineralifeBlogPipeline,
        title: "Stand up the blog pipeline — upload a batch and schedule it",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        projectId: IDS.projects.mineralifeBlog,
        deliverableId: IDS.deliverables.mineralifeBlogPipeline,
        cadence: "none",
        status: "open",
        priority: 1,
        dueOn: "2026-09-12",
        notes:
          "One place to drop a batch of posts and set publish dates so the rest of the year is already on a clock.",
      },
      {
        id: IDS.tasks.mineralifeBlogQueue,
        title: "Get 12–15 posts written and queued by 30 September",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        projectId: IDS.projects.mineralifeBlog,
        deliverableId: IDS.deliverables.mineralifeBlogQueue,
        cadence: "none",
        status: "open",
        priority: 1,
        dueOn: "2026-09-30",
        notes:
          "12 is the floor — one a week through year-end. 15 is the target, so a week can slip without going dark. Topics from real demand, not brand-name posts.",
      },
      {
        id: IDS.tasks.mineralifeBlogPlaybook,
        title: "Write the publish-week playbook (index and follow up)",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        projectId: IDS.projects.mineralifeBlog,
        deliverableId: IDS.deliverables.mineralifeBlogCadence,
        cadence: "none",
        status: "open",
        priority: 1,
        dueOn: "2026-09-26",
        notes:
          "Agentic support around each publish: request indexing, confirm crawl, follow up the ones Google skips. August already flagged two blog URLs — emoji hiring slug and glutathione never crawled.",
      },
      {
        id: IDS.tasks.mineralifeBlogWeekly,
        title: "Publish this week's post and get it indexed",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        projectId: IDS.projects.mineralifeBlog,
        deliverableId: IDS.deliverables.mineralifeBlogCadence,
        cadence: "weekly",
        status: "open",
        priority: 2,
        snoozedUntil: "2026-10-05",
        notes:
          "Hidden until the first October publish week. Repeats weekly through year-end. Tick the checklist each week; the row reopens next period.",
      },
      {
        id: IDS.tasks.mineralifeBlogReview,
        title: "Read the blog plan after 3–6 months of weekly publishing",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        projectId: IDS.projects.mineralifeBlog,
        deliverableId: IDS.deliverables.mineralifeBlogReview,
        cadence: "none",
        status: "open",
        priority: 2,
        dueOn: "2027-01-31",
        notes:
          "First read at the end of January (Oct–Dec published). A fuller read in March if three months is too thin. Compare to the August SEM baseline — impressions, clicks, CTR, index coverage, which posts earned non-brand clicks.",
      },
    ])
    .onConflictDoUpdate({
      target: tasks.id,
      set: {
        title: sql`excluded.title`,
        status: sql`excluded.status`,
        notes: sql`excluded.notes`,
        dueOn: sql`excluded.due_on`,
        snoozedUntil: sql`excluded.snoozed_until`,
        clientId: sql`excluded.client_id`,
        projectId: sql`excluded.project_id`,
        retainerId: sql`excluded.retainer_id`,
        deliverableId: sql`excluded.deliverable_id`,
        productId: sql`excluded.product_id`,
        priority: sql`excluded.priority`,
        cadence: sql`excluded.cadence`,
        updatedAt: new Date(),
      },
    })

  await db
    .insert(taskItems)
    .values([
      {
        id: IDS.taskItems.titlesDataGsc,
        taskId: IDS.tasks.mineralifeTitlesData,
        title: "Export GSC queries and pages for the last 28 days — impressions, clicks, CTR, position",
        sort: 1,
      },
      {
        id: IDS.taskItems.titlesDataInventory,
        taskId: IDS.tasks.mineralifeTitlesData,
        title: "Inventory current titles and meta descriptions on every indexed URL",
        sort: 2,
      },
      {
        id: IDS.taskItems.titlesDataSem,
        taskId: IDS.tasks.mineralifeTitlesData,
        title: "Overlay the August SEM high-impression / zero-click terms",
        sort: 3,
      },
      {
        id: IDS.taskItems.titlesDataAds,
        taskId: IDS.tasks.mineralifeTitlesData,
        title: "Include Ads keyword research so organic copy does not fight paid positioning",
        sort: 4,
      },
      {
        id: IDS.taskItems.titlesDataNearPageOne,
        taskId: IDS.tasks.mineralifeTitlesData,
        title: "Flag near-page-one terms — custom supplement manufacturer 8.7, nutraceutical 3.1, probiotic manufacturer 4.6",
        sort: 5,
      },
      {
        id: IDS.taskItems.titlesRewriteCore,
        taskId: IDS.tasks.mineralifeTitlesRewrite,
        title: "Prioritize supplement manufacturer / manufacturers / nutraceutical manufacturing / custom supplement manufacturer",
        sort: 1,
      },
      {
        id: IDS.taskItems.titlesRewriteNutraceutical,
        taskId: IDS.tasks.mineralifeTitlesRewrite,
        title: "Recast or skip nutraceutical — ranks well; people looking up a word",
        sort: 2,
      },
      {
        id: IDS.taskItems.titlesRewriteProbiotic,
        taskId: IDS.tasks.mineralifeTitlesRewrite,
        title: "Do not chase probiotic manufacturer — a category the FAQ declines",
        sort: 3,
      },
      {
        id: IDS.taskItems.titlesRewriteVoice,
        taskId: IDS.tasks.mineralifeTitlesRewrite,
        title: "Stay in Mineralife's own language — no private-label wording in organic",
        sort: 4,
      },
      {
        id: IDS.taskItems.titlesRewriteDrafts,
        taskId: IDS.tasks.mineralifeTitlesRewrite,
        title: "Draft titles and descriptions that can win the click at positions 8–12",
        sort: 5,
      },
      {
        id: IDS.taskItems.titlesShipPublish,
        taskId: IDS.tasks.mineralifeTitlesShip,
        title: "Publish the rewritten titles and descriptions",
        sort: 1,
      },
      {
        id: IDS.taskItems.titlesShipSerp,
        taskId: IDS.tasks.mineralifeTitlesShip,
        title: "Confirm they render on the live page and in the SERP",
        sort: 2,
      },
      {
        id: IDS.taskItems.titlesShipBaseline,
        taskId: IDS.tasks.mineralifeTitlesShip,
        title: "Snapshot impressions / CTR / position so October can be compared to August",
        sort: 3,
      },
      {
        id: IDS.taskItems.blogPipeCms,
        taskId: IDS.tasks.mineralifeBlogPipeline,
        title: "Confirm how posts are created, scheduled, and made live on mycustommanufacturer.com",
        sort: 1,
      },
      {
        id: IDS.taskItems.blogPipeBatch,
        taskId: IDS.tasks.mineralifeBlogPipeline,
        title: "One drop-point for a batch of posts with set publish dates",
        sort: 2,
      },
      {
        id: IDS.taskItems.blogPipeCalendar,
        taskId: IDS.tasks.mineralifeBlogPipeline,
        title: "Calendar: one a week October–December (13 weeks) — 12 floor, 15 for slip",
        sort: 3,
      },
      {
        id: IDS.taskItems.blogPipeBroken,
        taskId: IDS.tasks.mineralifeBlogPipeline,
        title: "Fix the two broken blog URLs — emoji hiring slug; glutathione never crawled",
        sort: 4,
      },
      {
        id: IDS.taskItems.blogQueueTopics,
        taskId: IDS.tasks.mineralifeBlogQueue,
        title: "Topics from real demand (GSC + keyword research), not brand-name posts",
        sort: 1,
      },
      {
        id: IDS.taskItems.blogQueueVoice,
        taskId: IDS.tasks.mineralifeBlogQueue,
        title: "No private-label language; FAQ-declined categories stay declined",
        sort: 2,
      },
      {
        id: IDS.taskItems.blogQueueReady,
        taskId: IDS.tasks.mineralifeBlogQueue,
        title: "Each post has a title, description, slug, and date before it enters the queue",
        sort: 3,
      },
      {
        id: IDS.taskItems.blogQueueCount,
        taskId: IDS.tasks.mineralifeBlogQueue,
        title: "12 in the queue is the floor; 15 is the target",
        sort: 4,
      },
      {
        id: IDS.taskItems.blogPlayIndex,
        taskId: IDS.tasks.mineralifeBlogPlaybook,
        title: "Submit each new URL to Search Console / request indexing",
        sort: 1,
      },
      {
        id: IDS.taskItems.blogPlayCrawl,
        taskId: IDS.tasks.mineralifeBlogPlaybook,
        title: "Confirm it is in the sitemap and that Google crawls it",
        sort: 2,
      },
      {
        id: IDS.taskItems.blogPlayFollowup,
        taskId: IDS.tasks.mineralifeBlogPlaybook,
        title: "Follow up Discovered / not indexed the way August already flagged two posts",
        sort: 3,
      },
      {
        id: IDS.taskItems.blogPlayLinks,
        taskId: IDS.tasks.mineralifeBlogPlaybook,
        title: "Light internal links from pages Google already visits",
        sort: 4,
      },
      {
        id: IDS.taskItems.blogWeeklyPublish,
        taskId: IDS.tasks.mineralifeBlogWeekly,
        title: "Publish the scheduled post",
        sort: 1,
      },
      {
        id: IDS.taskItems.blogWeeklyIndex,
        taskId: IDS.tasks.mineralifeBlogWeekly,
        title: "Request indexing",
        sort: 2,
      },
      {
        id: IDS.taskItems.blogWeeklyCrawl,
        taskId: IDS.tasks.mineralifeBlogWeekly,
        title: "Confirm Google crawled it",
        sort: 3,
      },
      {
        id: IDS.taskItems.blogWeeklyNote,
        taskId: IDS.tasks.mineralifeBlogWeekly,
        title: "Note anything skipped and follow it up",
        sort: 4,
      },
      {
        id: IDS.taskItems.blogReviewMetrics,
        taskId: IDS.tasks.mineralifeBlogReview,
        title: "Impressions, clicks, CTR, and index coverage vs the August baseline",
        sort: 1,
      },
      {
        id: IDS.taskItems.blogReviewPosts,
        taskId: IDS.tasks.mineralifeBlogReview,
        title: "Which posts earned non-brand clicks",
        sort: 2,
      },
      {
        id: IDS.taskItems.blogReviewCadence,
        taskId: IDS.tasks.mineralifeBlogReview,
        title: "Whether the weekly cadence held",
        sort: 3,
      },
      {
        id: IDS.taskItems.blogReviewRefill,
        taskId: IDS.tasks.mineralifeBlogReview,
        title: "Decide whether to refill the 2027 queue",
        sort: 4,
      },
    ])
    .onConflictDoUpdate({
      target: taskItems.id,
      set: {
        title: sql`excluded.title`,
        sort: sql`excluded.sort`,
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
        amountCents: 426900,
        hours: "71.15",
        status: "sent",
        billTo: "GDI",
        description: "August 2026 hours",
        notes: "1099. 71.15 hr at $60/hr. UWD migration, punchlist.",
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

  await db
    .insert(reports)
    .values([
      {
        id: IDS.reports.mineralifeMonthlyAug,
        title: "Monthly performance report — August 2026",
        slug: "monthly-performance-august-2026",
        bodyPath: "reports/monthly-performance-august-2026.html",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        cadence: "monthly",
        periodLabel: "August 2026",
        status: "filed",
        notes: "Sample monthly for mycustommanufacturer.com. Relocated from proposals/wip/client-report-sample.html.",
      },
      {
        id: IDS.reports.mineralifeTracking,
        title: "Tracking review & full-funnel analysis",
        slug: "tracking-funnel-review",
        bodyPath: "reports/tracking-funnel-review.html",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        cadence: "none",
        periodLabel: "August 2026",
        status: "filed",
        notes: "Attribution, forms, and the paid-to-enquiry gap. Relocated from proposals/wip/tracking-funnel-review.html.",
      },
      {
        id: IDS.reports.mineralifeAdsReview,
        title: "Google Ads review and campaign plan",
        slug: "google-ads-review",
        bodyPath: "reports/google-ads-review.html",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        cadence: "none",
        periodLabel: "30 August 2026",
        status: "filed",
        notes: "Account 624-370-2566. Competitors campaign diagnosis. Relocated from proposals/wip/google-ads-review.html.",
      },
      {
        id: IDS.reports.mineralifeUsCampaign,
        title: "The US campaign — build and comparison plan",
        slug: "us-campaign-plan",
        bodyPath: "reports/us-campaign-plan.html",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        cadence: "none",
        periodLabel: "30 August 2026",
        status: "filed",
        notes: "Four ad groups, four landing pages, judged against Competitors. Relocated from proposals/wip/us-campaign-plan.html.",
      },
      {
        id: IDS.reports.mineralifeGscAug,
        title: "Search Console maintenance — August 2026",
        slug: "search-console-maintenance-august-2026",
        bodyPath: "reports/search-console-maintenance-august-2026.html",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        cadence: "monthly",
        periodLabel: "August 2026",
        status: "filed",
        notes: "Index coverage sample. Relocated from proposals/wip/maintenance-report-sample.html.",
      },
    ])
    .onConflictDoUpdate({
      target: reports.id,
      set: {
        title: sql`excluded.title`,
        slug: sql`excluded.slug`,
        bodyPath: sql`excluded.body_path`,
        periodLabel: sql`excluded.period_label`,
        status: sql`excluded.status`,
        notes: sql`excluded.notes`,
        updatedAt: new Date(),
      },
    })

  await db
    .insert(proposals)
    .values([
      {
        id: IDS.proposals.pageToClaim,
        title: "Page to Claim",
        slug: "page-to-claim",
        bodyPath: "proposals/page-to-claim.html",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        series: "Page to Report",
        seriesPart: 1,
        seriesOf: 3,
        status: "draft",
        notes: "Part 1 of 3. Relocated from proposals/wip/page-to-claim.html.",
      },
      {
        id: IDS.proposals.queryToLead,
        title: "Query to Lead",
        slug: "query-to-lead",
        bodyPath: "proposals/query-to-lead.html",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        series: "Page to Report",
        seriesPart: 2,
        seriesOf: 3,
        status: "draft",
        notes: "Part 2 of 3. Relocated from proposals/wip/query-to-lead.html.",
      },
      {
        id: IDS.proposals.pullToReport,
        title: "Pull to Report",
        slug: "pull-to-report",
        bodyPath: "proposals/pull-to-report.html",
        clientId: IDS.clients.mineralife,
        retainerId: IDS.retainers.mineralife,
        series: "Page to Report",
        seriesPart: 3,
        seriesOf: 3,
        status: "draft",
        notes: "Part 3 of 3. Relocated from proposals/wip/pull-to-report.html.",
      },
    ])
    .onConflictDoUpdate({
      target: proposals.id,
      set: {
        title: sql`excluded.title`,
        slug: sql`excluded.slug`,
        bodyPath: sql`excluded.body_path`,
        series: sql`excluded.series`,
        seriesPart: sql`excluded.series_part`,
        seriesOf: sql`excluded.series_of`,
        status: sql`excluded.status`,
        notes: sql`excluded.notes`,
        updatedAt: new Date(),
      },
    })

  // The house client is not a seed fixture — it was created in the app — so the
  // worksheet is only seeded when that row is actually present.
  const house = await db
    .select({ id: clients.id })
    .from(clients)
    .where(eq(clients.slug, "tallkarol"))
    .limit(1)

  if (house.length === 0) {
    console.log("No tallkarol client row — skipped the Search Priorities Workbook.")
  } else {
    await db
      .insert(worksheets)
      .values([
        {
          id: IDS.worksheets.tkSearchPriorities,
          title: "Search Priorities Workbook",
          slug: "search-priorities-workbook",
          bodyPath: "worksheets/search-priorities-workbook.html",
          clientId: house[0].id,
          instrument: "Search Priorities Workbook",
          version: "v1",
          mode: "interview",
          status: "review",
          filledOn: "2026-08-30",
          questionCount: 45,
          openCount: 4,
          internal: true,
          notes:
            "Filled for tallkarol.com as the proof of concept. Four answers still need Karol: W3, W4a, E4b, R4. Contains internal-only answers (Q1 client briefs, C1a hiring history) — scrub before showing anyone outside the studio.",
        },
      ])
      .onConflictDoUpdate({
        target: worksheets.id,
        set: {
          title: sql`excluded.title`,
          slug: sql`excluded.slug`,
          bodyPath: sql`excluded.body_path`,
          clientId: sql`excluded.client_id`,
          instrument: sql`excluded.instrument`,
          version: sql`excluded.version`,
          mode: sql`excluded.mode`,
          status: sql`excluded.status`,
          filledOn: sql`excluded.filled_on`,
          questionCount: sql`excluded.question_count`,
          openCount: sql`excluded.open_count`,
          internal: sql`excluded.internal`,
          notes: sql`excluded.notes`,
          updatedAt: new Date(),
        },
      })
  }

  console.log("Work seed complete.")
  await client.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
