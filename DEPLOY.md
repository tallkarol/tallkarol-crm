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

## 5. Smoke test

1. Open `https://crm.tallkarol.com/login` → magic link to an allowlisted email
2. `POST /api/ingest` with Bearer secret and a sample body → row appears in inbox
3. Submit the live contact form → email + CRM row
