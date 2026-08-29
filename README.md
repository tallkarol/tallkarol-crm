# Tall Karol CRM

Admin inquiry inbox for tallkarol.com. Customer portal comes later.

## Stack

- Next.js 14 (App Router)
- Drizzle ORM + Postgres (Railway)
- Resend magic-link auth (admin allowlist)
- Brand tokens: teal / linen / onyx

## Local

1. Copy `.env.example` → `.env.local`
2. Use the **public** Railway Postgres URL (Connect tab, host like `*.rlwy.net`), not `*.railway.internal`. The internal host is why local login shows “Could not send the link.”
3. Generate secrets: `openssl rand -hex 32` for `SESSION_SECRET` and `INGEST_SECRET`
4. `npm install`
5. `npm run db:generate` then `npm run db:migrate`
6. `npm run dev` → http://localhost:3001

## Railway

- Build: `npm run build`
- Release / migrate: `npm run db:migrate`
- Start: `npm run start` (uses `$PORT`)
- Set env vars from `.env.example`
- Attach custom domain `crm.tallkarol.com`

## Calendar

Cal.com bookings and Google calendars merge into `/calendar`, alongside
invoices, contracts, and logged time. Setup — including the service-account
calendar sharing that replaces OAuth — is in `CALENDAR.md`.

## Timesheet and the clock

`/timesheet` opens on a dashboard, not a filter: the running clock, the month
against each retainer cap, what is unbilled, and what is waiting to be approved.
Sheets are browsable by state at `/timesheet/sheets`, and every entry is
searchable at `/timesheet/entries`.

Clocking in from a watch, a phone, or a shortcut goes through `/api/time/*` with
a per-device bearer token issued at Settings → Devices. A punch is not billable
until it is approved in `/timesheet/review`. Hours are exact to two decimals —
there is no rounding increment. Full contract and rules in `TIMESHEET.md`.

## Tasks

`/tasks` is a filter bar over a banded list: a saved view names the question,
the filters say what they are doing, and the second line appears only when
something is applied. Tasks can be captured from the hub, from any project,
retainer or client page, or over `POST /api/tasks` on a device token — with a
grammar (`@client` `!fri` `*monthly` `>mon`) that shows what it parsed before
saving. Rules and the API in `TASKS.md`.

## Delivery

`/delivery` is the ledger that replaced the pipeline board: one row per
engagement — a project or a retainer — banded by what it needs from you.
Status is a menu on the row rather than a drag target, so an update is one
click and two, and it works on a phone.

Bands run **Needs you → Moving → Waiting on client → Quiet → Closed**, and a
band is only drawn when it has rows. Clicking a row opens the engagement modal
at `?open=project:<slug>` or `?open=retainer:<slug>` — the URL is the state, so
a modal is a shareable link. A project shows workstreams and deliverables; a
retainer shows the month against its ceiling and six months of burn.

`/pipeline` 301s here. The sales board moved to `/leads`, where a Board/List
toggle sits over the same lead workspace that was already there.

### What decides "needs you"

Every rule lives in `lib/attention.ts` and nowhere else — the row's meta line,
the modal's "Needs you" block, and the band a row falls into all read from it,
so the three cannot drift apart. The rules are pure and take `now`:

```bash
npm run check:attention
```

Thresholds (all named constants in `ATTENTION_RULES`): a workstream 5 days in
review or 7 in feedback, a project 14 days waiting on content, a deliverable
done and uninvoiced, a dated deliverable inside 14 days or past due, a draft
invoice within 2 days of issuing, an active retainer with no time past the
20th, one at 85% of its ceiling or over it, a renewal inside 45 days, and a
ticket unanswered longer than its priority allows.

Two things worth knowing:

- **`deliverables` has no timestamps**, so a flag can say a deliverable is done
  and uninvoiced but never for how long. Adding `deliverables.updated_at` is
  what would let those age.
- **A retainer's burn chart prefers the invoice** for closed months — that is
  what the client was actually billed — and logged time only for the current
  month, which has no invoice yet. Reading logged time for closed months made
  June look like a dead month when it had been billed at 36.4h.

## Inbox

`/inbox` is one stream over everything that arrives — new leads, open tickets,
client replies on a ticket, forwarded mail, and activity events. `/inquiries`
stays as the old status list; `/leads` stays as the sales surface, because a
lead's life is longer than its arrival.

Three panes: lenses on the left (Unread is the default), the stream in the
middle grouped by day, and a typed workspace on the right. Whatever kind of
thing is selected, **the same triage bar** sits above it — Open, Make task,
Snooze, Archive, plus Assign-to-client for mail and tickets and Make ticket for
mail. That sameness is what makes it one place rather than three lists behind
tabs. Every control writes to the URL, so a view is a link.

Read as a **union at query time**, not a materialised table — no dual-write,
nothing to backfill. The only stored thing is triage state, and **unread is the
absence of a row**, so a new source starts feeding the stream without a
migration. Move to `inbox_items` when mail volume argues for it.

`lib/inbox.ts` is PURE (types, lenses, day buckets — the console imports it, so
a `db` import there would pull postgres into the browser bundle). The query
lives in `lib/inbox-data.ts`. Same split as `task-view` versus `tasks`.

### Mail

`crm@tallkarol.com` stays on **Fastmail**; the CRM reads it over JMAP with a
**read-only** API token and polls, the way `calendar:sync` and `notion:sync`
already do.

```bash
npm run inbox:check   # config + connection, reads nothing
npm run inbox:sync    # everything since the last sync
npm run inbox:sync -- --all
npm run check:jmap    # domain matching, no mailbox needed
```

Set `AGENT_FASTMAIL_TOKEN` (Fastmail → Settings → Privacy & Security → Manage
API tokens). Sync is idempotent — the RFC message id is the natural key — and
the watermark lives in `app_settings.inbox_mail_sync`.

**Only the agent account is read.** A Fastmail token is account-scoped, not
folder-scoped, so the account the token belongs to *is* the blast radius. The
redirected copies of every alias already land in the agent account, so reading
a personal mailbox would add risk and no capability — do not wire one in.

`lib/jmap.ts` issues only read methods (`Mailbox/get`, `Email/query`,
`Email/get`) and never `Email/set` or `EmailSubmission/set`. Today that
guarantee lives in the code, because the token in use is full read/write —
**a read-only token would make it structural, and nothing here needs write.**

Mail is routed to a client by the **alias it was sent to**, not the sender:
`mineralife@tallkarol.com` means Mineralife whether they wrote from a corporate
domain or Gmail. Verified against real mail — Fastmail's Redirect preserves the
original `To:` header. A local part equal to a client slug routes with no
configuration; anything else needs an entry in
`app_settings.inbox_mail_sync.aliasMap` (`axvor` → `dqs` is seeded). Sender
domain is the fallback.

**Do not point `tallkarol.com` MX at Resend.** Resend receives by taking the MX
for a whole domain at lowest priority, so that would move *every* address off
Fastmail — MX has no per-address split. Resend stays the sending side. If push
ever beats polling: keep the address on Fastmail and forward it to the
auto-provisioned `<id>.resend.app` inbound address, then take the
`email.received` webhook — but that carries metadata only, so the body needs a
second API call.

Senders are matched to clients by domain against `clients.domains`, which
already existed for calendar matching. `npm run check:jmap` covers the
near-miss cases that would file mail under the wrong client (`notzemvelo.com`,
`zemvelo.com.evil.net`, `zemvelo.co`).

## Site ingest

The marketing site posts to `POST /api/ingest` with:

```
Authorization: Bearer $INGEST_SECRET
{ "contact": { "name", "email", "company?" }, "config": { ... } }
```

Vercel site env: `CRM_INGEST_URL`, `CRM_INGEST_SECRET` (same value as `INGEST_SECRET`).

## Support tickets

`/support` is the triage console: one queue across every client, filtered by
client, platform, state and full-text search, with the ticket itself at
`/support/<number>`. Every filter lives in the URL, so a view is a link.

Sources, in the order they were added:

- **Smartsheet** — the original sheet sync, still live (webhook + manual refresh).
- **Anything we maintain** — sites, apps, monitors, and audit agents post to
  `POST /api/support/ingest`.

```
Authorization: Bearer $SUPPORT_INGEST_SECRET   # falls back to $INGEST_SECRET
{
  "client": "zemvelo",              // slug, name, or client id
  "platform": "Shopify",            // per ticket — clients run several things
  "source": "app",                  // app | website | form | sentry | uptime | email
  "externalId": "order-31894",      // optional; same id updates the same ticket
  "title": "Checkout 500 on discount code",
  "description": "Every order using SPRING20 fails at payment.",
  "message": "…",                   // optional; opens the thread
  "priority": "urgent",             // urgent | high | normal | low
  "state": "open",                  // open | progress | waiting | closed
  "submittedBy": "Dana Whitfield",
  "contactEmail": "dana@zemvelo.com",
  "tags": ["checkout"],
  "url": "https://zemvelo.com/checkout",
  "env": { "Store": "zemvelo.myshopify.com" },
  "error": { "…": "…" },            // shorthand: becomes the first payload
  "payloads": [
    { "label": "Function error", "lang": "json", "body": "{ … }" }
  ]
}
```

Payloads are stored one row per code block (`ticket_payloads`), capped at 12
per ticket and 256KB each, and rendered as copyable blocks in the detail pane.
Language is sniffed when it isn't sent. Tickets without a number get one per
client — `ZEM-0001`, `CF-0002`.

Not built yet, in this order: replying from the detail pane, a forwarding
inbox that parses mail into tickets/tasks/projects, and maintenance-package
agents that audit a client and file their findings through the same endpoint.
