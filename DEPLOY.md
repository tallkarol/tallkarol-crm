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

## 3. Custom domain

1. Railway → service → Settings → Domains → add `crm.tallkarol.com`
2. At your DNS host, CNAME `crm` → the Railway domain they show
3. Wait for SSL

## 4. Marketing site (Vercel)

On the tallkarol.com project:

| Variable | Value |
|---|---|
| `CRM_INGEST_URL` | `https://crm.tallkarol.com/api/ingest` |
| `CRM_INGEST_SECRET` | same as Railway `INGEST_SECRET` |

Redeploy the site after setting them.

## 5. Smoke test

1. Open `https://crm.tallkarol.com/login` → magic link to an allowlisted email
2. `POST /api/ingest` with Bearer secret and a sample body → row appears in inbox
3. Submit the live contact form → email + CRM row
