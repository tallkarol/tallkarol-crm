# Tall Karol CRM

Admin inquiry inbox for tallkarol.com. Customer portal comes later.

## Stack

- Next.js 14 (App Router)
- Drizzle ORM + Postgres (Railway)
- Resend magic-link auth (admin allowlist)
- Brand tokens: teal / linen / onyx

## Local

1. Copy `.env.example` → `.env.local`
2. Use the **public** Railway Postgres URL (Connect tab), not `*.railway.internal`
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

## Site ingest

The marketing site posts to `POST /api/ingest` with:

```
Authorization: Bearer $INGEST_SECRET
{ "contact": { "name", "email", "company?" }, "config": { ... } }
```

Vercel site env: `CRM_INGEST_URL`, `CRM_INGEST_SECRET` (same value as `INGEST_SECRET`).
