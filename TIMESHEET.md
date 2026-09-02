# Timesheet

Six views under `/timesheet`, a clock API for devices that are not a browser,
and an approval gate between the two.

## The three objects

| Object | Table | What it is |
| --- | --- | --- |
| **Punch** | `time_punches` | A raw start/stop event. Real timestamps, no rounding, not billable. |
| **Entry** | `time_entries` | A billable line: a day, hours to two decimals, a summary. What invoices sum. |
| **Sheet** | *derived* | One client × one month, with a state — open, unbilled, invoiced, paid. |

Punches are a separate table on purpose: nothing that sums `time_entries`
(`billingGaps()`, the dashboard forecast, `createInvoiceFromTimesheet()`) can
accidentally count time nobody has approved. Approving writes the entry and
links it back with `time_punches.time_entry_id`, so the raw 23 minutes behind a
billed 0.38 is always recoverable.

## Views

| Route | Does |
| --- | --- |
| `/timesheet` | Dashboard — live clock, month tiles, engagement cards, what needs attention. |
| `/timesheet/live` | Clock in and out from a browser. The PWA's start page. |
| `/timesheet/review` | Approval queue. `?tab=meetings` is the calendar inbox. |
| `/timesheet/sheets` | Every client-month, grouped by state, defaulted to this year. |
| `/timesheet/[client]/[month]` | The sheet. `?client=&month=` still redirects here. |
| `/timesheet/entries` | Flat searchable ledger across every client and month. |

The running clock lives in the layout, so it is visible and stoppable from all
six.

## Rules

- **No rounding.** Hours are exact to two decimals. A 23-minute punch bills
  `0.38`. There is no configurable increment — that was a deliberate call.
- **A punch always names a client.** Send `clientId`, or send `projectId` and
  the client is taken from the project.
- **A project is optional. A summary is not, when there is no project.**
  Approval returns 422 with an explanation otherwise: the invoice line has to
  explain itself, and when no project name does that, the summary must.
- **One timer per person**, enforced by a partial unique index on
  `time_punches (user_id) where status = 'running'` — a double tap cannot
  corrupt state.
- **Suspicious punches are flagged, never auto-approved.** Over 8 hours,
  crossing midnight, or still running since yesterday: bulk approve skips them
  until the end time is fixed.
- **Discard is not delete.** A waved-off punch keeps `status = 'discarded'`.
- **Sheets lock when billed.** Invoiced is read-only behind an Unlock button;
  paid asks a second time.

## Clock API

Every route takes `Authorization: Bearer <device token>`. A browser session
cookie also works, which is how `/timesheet/live` uses the same endpoints — the
web client *is* the reference client.

| Route | Body | Notes |
| --- | --- | --- |
| `GET /api/time/status` | — | Running punch, today's total, five recent targets, timezone. One call renders a watch face. |
| `GET /api/time/projects` | — | Open projects plus a bare retainer row per client, ordered by recency. |
| `POST /api/time/clock-in` | `{ projectId? \| clientId, note?, at?, switch?, source?, clientRequestId? }` | 201 with the punch. 409 with the running punch unless `switch: true`. |
| `POST /api/time/clock-out` | `{ punchId?, note?, at? }` | Returns `rawMinutes`, `wouldBill`, and `needs` — what still blocks approval. |
| `POST /api/time/punches/:id/approve` | `{ summary?, hours?, projectId?, occurredOn? }` | Writes the billable row. 422 when the rules above are not met. |
| `POST /api/time/agent-log` | `{ clientSlug \| clientId, projectSlug? \| projectId?, occurredOn, startedAt, endedAt, hours, summary, note?, clientRequestId, force? }` | Agent hours, already approved (see below). 201, or 200 on an identical replay. 409 on a different body for the same id, or a billed month without `force`. |
| `GET /api/time/agent-log?client=<slug>` | — | Does the slug exist, its projects, and the workspace timezone — what a proposal needs before it asks. |

Two fields make a wrist tap safe on a bad connection:

- `clientRequestId` — a device-generated id. A retry returns the same punch
  instead of opening a second one.
- `at` — an ISO timestamp, clamped to ±24 hours, so a watch that lost signal can
  sync a punch that really happened twenty minutes ago.

```bash
curl -X POST https://crm.tallkarol.com/api/time/clock-in \
  -H "Authorization: Bearer $TK_DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"…","clientRequestId":"9f2c…","note":"migration QA"}'
```

Tokens are issued at **Settings → Devices** (`/settings/integrations/devices`),
one per device, shown once, stored as a SHA-256 hash, revocable individually.
That page also sets the workspace timezone — the zone a punch's timestamps
resolve into a day and a `4:13 PM` wall-clock string for the sheet.

Clients have zones of their own — what "Friday at 2" means when it is said in
the client's terms. They live in one `app_settings` row (`client_timezones`:
a default plus per-slug overrides) and are managed with `npm run client:tz`;
`GET /api/time/agent-log?client=` returns both zones so `/follow-up` can put a
client meeting at the right instant while the sheet keeps counting days in the
workspace zone.

## Agent hours

`/log-session` (in the daedalus-hive-mind plugin) turns the agent meter — when
Claude Code or Cursor agents were actually working, per client — into a
proposal: client, project, a summary, the weighted hours, and the conversations
that contributed. Karol approves it in the chat. **That approval is the gate**,
so `POST /api/time/agent-log` writes the row already approved: a
`time_punches` row with `source = 'agent'`, `status = 'approved'`, the real
start/end and an audit note naming the conversations, plus the billable
`time_entries` row with `source = 'agent'`, linked the usual way. Nothing waits
in `/timesheet/review` a second time, and the row is swept into the month's
invoice like any other hour.

Three things keep that honest:

- `clientRequestId` is a hash of the proposal Karol saw. Replaying it returns
  the same rows; replaying it with different hours, day or summary is a 409.
- The month is checked against `invoices` — logging into a billed month needs
  `force: true`.
- The credential is an ordinary device token (name it `daedalus-agent`), so
  revoking it is one click on the Devices page.

Six agents for one hour is not six hours: the plugin weights concurrency at
`1 + 0.1 × (extra agents)` per instant, scoped to the client, before the number
ever reaches this API. The math lives in `skills/log-session` over there; this
side only stores what was approved.

## PWA

`public/manifest.webmanifest` starts at `/timesheet/live` in standalone display.
`public/sw.js` is deliberately minimal — it caches only the manifest and icons,
never a page or an API response, because every page here is behind a login and
per-account.

Icons are generated, not drawn: `npm run icons` runs `scripts/make-icons.py`,
which writes the PNG set directly (no image library on the build machine).

## Checks

```bash
npm run check:punch                      # hours, timezones, flags, approval rule
npm run db:dry-run 0020_timesheet_punches  # applies a migration, then rolls back
```

`db:dry-run` is worth running before `db:migrate` on any database that matters —
Postgres makes DDL transactional, so it proves the SQL applies against the real
schema and changes nothing.

## Multi-user, later

`time_entries.user_id` and `time_punches.user_id` are already populated, and
device tokens are already per-device. Adding a second person is a role check and
a filter, not a migration and a year of untagged history to reconcile.
