# Calendar setup — Tall Karol CRM

The CRM calendar is a merge layer, not a calendar host. It pulls from Cal.com
and any number of Google calendars into a Postgres cache, and overlays the
dated records the CRM already owns.

| Lane | Where it comes from |
|---|---|
| Cal.com | `GET api.cal.com/v2/bookings`, personal API key |
| Google (one per calendar) | Calendar API v3, read with the existing service account |
| Invoices | `invoices.issued_on` |
| Contracts | `contracts.effective_on` |
| Logged time | `time_entries.occurred_on` |

Manage sources at **Settings → Integrations → Calendar**, or from the command
line:

```
npm run calendar:list
npm run calendar:add -- google "Personal" you@gmail.com
npm run calendar:sync
```

Nothing syncs on a timer — hit **Sync now** in the UI or run `calendar:sync`.

`lib/calendar-sync.ts` holds the sync engine as a plain module so both the
server action and the CLI drive the same code; `lib/calendar-actions.ts` is
only the auth wrapper around it.

## Google calendars — no OAuth needed

The service account built for GA4 and Search Console reads calendars too. You
do not register an OAuth app, there is no consent screen, and there are no
refresh tokens to store. You just share each calendar with the service account
the same way you would share it with a person.

1. Google Cloud → enable the **Google Calendar API** on the same project as the
   analytics service account.
2. For each Gmail calendar: Google Calendar → hover the calendar → ⋮ →
   **Settings and sharing** → **Share with specific people or groups** → **Add
   people** → paste the service account address (`…@….iam.gserviceaccount.com`).
   - **See all event details** — read-only, right for most calendars.
   - **Make changes to events** — needed only on the one destination calendar.
3. CRM → Settings → Integrations → Calendar → **Google** → name it and paste
   the calendar id (for a personal calendar that is the Gmail address; for a
   secondary calendar, copy the id from its settings page).
4. **Sync now**.

This works for personal `gmail.com` accounts, not just Workspace, because the
permission comes from the calendar's own sharing list rather than from
domain-wide delegation.

**A shared calendar will not appear in `calendarList`.** Google only auto-adds
calendars to a *human's* list, so `users/me/calendarList` comes back empty for a
service account even when sharing worked. Do not read that as a failure —
`npm run google:check` probes each configured calendar by id directly, which is
the real test.

### Creating events from the CRM

Mark exactly one Google source as **Destination**. Events made with **New
event** are written there, then synced back. That calendar needs *Make changes
to events*, not just read access.

## Cal.com

1. Cal.com → Settings → Developer → API keys → create one.
2. Set `CALCOM_API_KEY` in Railway (and `.env.local` for local work).
3. CRM → Settings → Integrations → Calendar → **Cal.com** → Connect.

Bookings carry attendee emails, so a booking whose attendee matches an inquiry
is linked to that inquiry on sync.

Cal.com pins its response shape to a dated header. The default is
`2026-05-01`; override with `CALCOM_API_VERSION` if a future version changes
the booking fields. A version mismatch shows up as the error on the source row
in Settings.

## Outlook

Not wired up yet. The `ics` source kind exists in the schema and in
`addCalendarSource`, but the source manager does not offer it and
`fetchForSource` in `lib/calendar-actions.ts` rejects it — finishing it means a
feed fetch, an RRULE-capable ICS parser (Google expands recurrences
server-side; an ICS feed does not), and a third button in the manager.

The mailbox is IT-managed, so work through these in order:

1. **Check whether publishing is already allowed.** Outlook Web → Settings →
   Calendar → Shared calendars. If a **Publish a calendar** section appears,
   take the ICS link and stop here — no IT ticket needed.
2. **If it is greyed out or missing,** the tenant has calendar publishing
   disabled. Ask IT to *enable calendar publishing on this mailbox* — a
   per-mailbox Exchange setting, and a much smaller ask than an OAuth app.
3. **Microsoft Graph OAuth, last.** An Azure app registration with
   `Calendars.Read` normally needs admin consent in a managed tenant, so it is
   the slowest path and the most code. Only worth building once IT has agreed.

Do **not** subscribe Google to an Outlook ICS feed to route it through the
Google path. Google polls external ICS on its own slow schedule — often 12–24
hours — so Outlook events would land a day late.

## Env

```
# Reused from the analytics setup — see ANALYTICS.md
GOOGLE_PROJECT_ID=…
GOOGLE_SERVICE_ACCOUNT_EMAIL=…@….iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"

CALCOM_API_KEY=cal_live_…
CALCOM_API_VERSION=2026-05-01   # optional
```

## What is not on the calendar

`tasks`, `reports`, and `deliverables` have no date column — only a cadence or
a period label — so they cannot be placed on a day. Putting them on the
calendar means adding a `due_on` to those tables first.

## Meetings become billable time

**Timesheet → Meetings** (`/timesheet/meetings`) proposes a time entry for every
timed meeting in the last 60 days whose guests match a client's email domain and
that is not already on the timesheet. Logging one writes a real `time_entries`
row and stamps `client_id` on the calendar event.

Nothing is written until you press **Log it** — proposals are computed on the
fly, not stored. `time_entries.calendar_event_id` carries a unique index, so the
same meeting can never be logged twice; **Not billable** sets
`calendar_events.dismissed` so it stops being offered.

Domains live on the client:

```
npm run client:domains                      # current mapping
npm run client:domains -- gdi example.com   # set (replaces)
npm run client:suggest                      # unmapped domains by meeting hours
```

Free-mail hosts and Google resource calendars are ignored — see
`IGNORED_DOMAINS` in `lib/meetings.ts`. Days and clock times are computed in the
**viewer's** timezone before being sent to the action, so an entry lands on the
day the meeting actually happened.

## Nothing runs on a timer

There is no cron, no polling, and no background worker anywhere in the CRM.
Opening `/calendar` reads Postgres and makes zero outbound requests; Cal.com
and Google are contacted only when someone presses **Sync now**. Analytics
works the same way — `/analytics` reads a stored snapshot and only calls GA4
and Search Console on **Refresh** (`report_cache` table, `lib/report-cache.ts`).

Keep it that way. This is an internal tool used for monthly reporting, not a
service, and the whole Google side is free precisely because nothing is ever
awake.

## Timezones

Everything is stored in UTC. The month grid buckets events into days in the
**viewer's** timezone, so the calendar reads correctly wherever you open it.
All-day events are anchored at UTC midnight and read back in UTC so a negative
offset can never drag them into the previous day.
