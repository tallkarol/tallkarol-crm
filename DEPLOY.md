# Deploy checklist — Tall Karol CRM

Do these in order after the code is on `main`.

## 1. Rotate the Postgres password

The password that appeared in chat is compromised. In Railway → Postgres →
Credentials → rotate / regenerate, then update any linked `DATABASE_URL`.

## 2. Railway web service

- Root directory: repo root (this project)
- Build: `npm run build` (already in `railway.json`)
- Release: `npm run db:migrate`
- Start: `npm run start`
- Link the existing Postgres plugin so `DATABASE_URL` is injected (internal host is fine on Railway)

Set these variables on the **web** service:

| Variable | Value |
|---|---|
| `DATABASE_URL` | from Postgres plugin (internal) |
| `RESEND_API_KEY` | same key as the marketing site / demos |
| `RESEND_FROM_EMAIL` | `hello@tallkarol.com` |
| `APP_URL` | `https://crm.tallkarol.com` |
| `ADMIN_EMAILS` | `hello@tallkarol.com,karolzbuczek@gmail.com` |
| `SESSION_SECRET` | `openssl rand -hex 32` |
| `INGEST_SECRET` | `openssl rand -hex 32` (copy this for Vercel too) |
| `NODE_ENV` | `production` |
| `UPTIMEROBOT_API_KEY` | UptimeRobot **read-only** key (never the main key) |
| `SWEEP_SECRET` | `openssl rand -hex 32` — the cron tick's bearer |
| `WIDGET_TOKEN` | `openssl rand -hex 32` — the macOS widgets' bearer |

## 3. Custom domain

1. Railway → service → Settings → Domains → add `crm.tallkarol.com`
2. At your DNS host, CNAME `crm` → the Railway domain they show
3. Wait for SSL

## 4. Marketing site (Vercel)

On the **tallkarol.com** project (not Railway, not the CRM):

| Variable | Value |
|---|---|
| `CRM_INGEST_URL` | `https://crm.tallkarol.com/api/ingest` |
| `CRM_INGEST_SECRET` | same as Railway `INGEST_SECRET` |
| `GA4_MEASUREMENT_ID` | `G-JSHG8GYFXE` |
| `GA4_API_SECRET` | Measurement Protocol secret from the GA4 web stream |
| `RESEND_API_KEY` | same Resend key |
| `RESEND_FROM_EMAIL` | `hello@tallkarol.com` |
| `CONTACT_EMAIL` | `hello@tallkarol.com` |

Never prefix `GA4_*` or `CRM_INGEST_SECRET` with `NEXT_PUBLIC_`. Redeploy after setting them.

The site forwards events server-side on Vercel. The CRM on Railway can take `GA4_PROPERTY_ID=498136327`, `GA4_MEASUREMENT_ID`, `GA4_API_SECRET`, `GSC_SITE_URL=https://www.tallkarol.com/`, `GOOGLE_PROJECT_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_SERVICE_ACCOUNT_KEY`. See [ANALYTICS.md](./ANALYTICS.md).

## 5. Smartsheet cron

Webhooks cover the support sheet in seconds, but nothing watches the marketing
tracker, so both sheets are also pulled on a clock.

Add a **second Railway service** in the same project, pointed at this repo, with
no domain. A cron service has to exit when it is done, so it cannot be the web
service — Railway skips a scheduled run while the previous one is still going,
and the web service never stops.

| Setting | Value |
| --- | --- |
| Start command | `npm run smartsheet:sync` |
| Cron schedule | `0 * * * *` |
| Variables | `DATABASE_URL`, `SMARTSHEET_ACCESS_TOKEN` |

Hourly looks wrong for a three-times-a-day job, and is deliberate. Railway
evaluates cron in UTC only, so a fixed expression would drift by an hour every
time Colorado changes clocks. The job wakes hourly and decides for itself
whether the hour opens a slot — 8am, noon and 4pm on weekdays, noon at
weekends, `America/Denver`. Every other wake-up exits in about a second having
done nothing. It also means a slot missed to a deploy or a blip is picked up on
the next pass instead of waiting for the following one.

If you would rather not run a second service, the same job is exposed as an
endpoint for any external scheduler, on the same secret as the monitor sweep:

```sh
curl -H "Authorization: Bearer $SWEEP_SECRET" https://crm.tallkarol.com/api/smartsheet/sync
```

Add `?force=1` to sync outside a slot. `npm run smartsheet:sync -- --status`
prints the last run and its outcome, and `npm run check:schedule` proves the
slot arithmetic including both daylight-saving changeovers.

Note this path only ever **reads** from Smartsheet. Tracker write-back is a
separate switch (`npm run tracker:sync -- --on`) and only fires when you change
something in the CRM — never from the clock.

## 6. Cron tick

`reopenDueRecurring()` used to run only inside the render path of the dashboard
and the task hub, so a repeating task stayed done until someone opened the CRM
in a browser. The macOS widgets read without rendering those pages, so the
clock work moved to a service of its own — which also puts the monitor sweep on
a schedule for the first time.

This is live as the **`tallkarol-cron`** service — same repo, no domain.

| Setting | Value |
| --- | --- |
| Start command | `npm run cron:tick` |
| Cron schedule | `*/15 * * * *` |
| Restart policy | `NEVER` |
| Variables | `DATABASE_URL` (references `${{Postgres.DATABASE_URL}}`), `SWEEP_SECRET` |

The start command is set **on the service**, not in a config file. Railway has
deprecated config-as-code — `serviceInstanceUpdate` now rejects
`railwayConfigFile` outright — so a per-service `railway.cron.json` is not
possible. That matters because the root `railway.json` starts the web server:
had the cron service inherited it, it would never exit, and Railway skips a
scheduled run while the previous one is still going, so it would have fired
exactly once and then gone quiet.

The restart policy has to be `NEVER`. A cron job exits when it is done, and
anything that restarts it turns a 15-minute job into a hot loop.

Recreating it from the CLI:

```sh
railway add --service tallkarol-cron --repo tallkarol/tallkarol-crm --branch main
railway variables --service tallkarol-cron \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --set "SWEEP_SECRET=$SWEEP_SECRET"
# then set startCommand / cronSchedule / restartPolicyType via
# `railway api` → serviceInstanceUpdate
```

> The root `railway.json` still works today — the `releaseCommand` migration
> ran on the last deploy — but it is on notice. If Railway drops it, the web
> service loses both its start command and `npm run db:migrate` on deploy.
> Worth migrating to `.railway/railway.ts` before that happens.

Every wake-up reopens repeating tasks whose period rolled over, then sweeps
monitors whose window closed with nothing in it. A quiet tick costs about a
second. `npm run cron:tick` runs the same work by hand, and the job is exposed
as an endpoint for any external scheduler:

```sh
curl -H "Authorization: Bearer $SWEEP_SECRET" https://crm.tallkarol.com/api/cron/tick
```

This replaces `/api/monitors/sweep`, which stays in place and still works.

## 7. Widget endpoints

The macOS widgets in `../tallkarol-widget` read `/api/widget/*` on a static
bearer — a widget extension cannot hold a session cookie. One token, set as
`WIDGET_TOKEN` here and quoted in the widget project's gitignored
`Secrets.swift`.

| Endpoint | Answers |
| --- | --- |
| `GET /api/widget` | ranked tasks, collapsed attention flags, counts |
| `GET /api/widget/tickets` | open tickets worst-overdue first, recently closed |
| `GET /api/widget/clients` | id/name/slug, feeding the client picker |
| `GET /api/widget/client/:slug` | one client's tasks, tickets, vitals, flags |
| `POST /api/widget/complete/:id` | ticks one task, `{"done":false}` to untick |

Every GET is read-only — recurrence is advanced by the cron tick above, never
by whichever widget polls first. Rotating the token is a variable change here
plus an edit to `Secrets.swift`; nothing else stores it.

```sh
curl -H "Authorization: Bearer $WIDGET_TOKEN" https://crm.tallkarol.com/api/widget
```

## 8. Smoke test

1. Open `https://crm.tallkarol.com/login` → magic link to an allowlisted email
2. `POST /api/ingest` with Bearer secret and a sample body → row appears in inbox
3. Submit the live contact form → email + CRM row
4. `npm run smartsheet:sync -- --status` on the cron service → a recent run, `ok`
