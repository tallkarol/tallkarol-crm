# Tall Karol email — `@tallkarol.com`

Snapshot **2026-08-30**. Read this instead of opening Fastmail or calling JMAP.

**Sending from a client alias, or telling a client to write to one, is
[`MAIL-ENGAGEMENT.md`](./MAIL-ENGAGEMENT.md).** The map below is not permission
to go live. GDI and Mineralife are last on that ladder.

A twin lives at `~/Work/daedalus-docs/email.md`. Update both when the mailbox
changes. Fastmail's UI is authority for aliases, Sieve, shares, and redirects.
This repo is authority for how the CRM *reads* mail (`lib/jmap.ts`,
`lib/inbox-mail.ts`, `scripts/inbox.ts`).

Do not put Fastmail passwords or API tokens in this file, in chat, or in any
committed env example. Tokens stay in `.env.local` / Railway only.

## The shape of it

Two Fastmail **users**. Fastmail is the system of record. The CRM is a reader
of the agent account. Resend is the sending side for the site and the CRM
(magic links, outreach). MX for `tallkarol.com` stays on Fastmail.

```
internet ──MX──► Fastmail
                 │
                 ├─ karol@     human login, default From, most aliases land here
                 │    Sieve files by envelope recipient into folders
                 │    Redirect copies of work aliases → agent@
                 │
                 └─ agent@     token holder; CRM polls this account over JMAP
                      crm@ and dmarc@ deliver here
                      shared views of Karol's Invoices + Support

Resend ──sends as──► hello@tallkarol.com
```

A public address is four pieces, built one at a time: **alias → identity →
signature → Sieve**. Sieve must match the envelope recipient (`envelope :to` /
`:localpart`), not the `To:` header. Share a folder **after** the alias exists,
not while creating it.

## Users

| User | Role |
|---|---|
| `karol@tallkarol.com` | Human. Login. Default sending identity. Owns the work folders. |
| `agent@tallkarol.com` | Agent mailbox. Holds the JMAP token the CRM uses. Ingest target. |

There is also a Fastmail team master user underneath. Ignore it. Never wire
its token into the CRM.

## Address book

`Lives on` is who the **team alias** delivers to. Redirect is a **copy** into
the agent account so the CRM can see it without reading Karol's mailbox.
`mcm@` was a property placeholder and has been deleted — do not recreate it.

### House addresses

| Address | Lives on | Folder | Redirect → agent | Shared to agent | What it is |
|---|---|---|---|---|---|
| `karol@` | karol (user) | Inbox | no | — | Primary identity + login. Default From. |
| `hello@` | karol | Hello | no | — | Public front door. Site, cards, cold inbound. CRM send-from. |
| `accounts@` | karol | Accounts | no | — | Signups and `+vendor` subaddressing. Reset-everything address — hardware key or TOTP on every account that uses it. |
| `invoices@` | karol | Invoices | yes | yes (default From `invoices@`) | Reply-to on outgoing invoices. Agent reconciles against the CRM. |
| `support@` | karol | Support | yes | yes (default From `support@`) | Single support line. Opens a ticket on CRM sync. |
| `agent@` | agent (user) | Inbox | — | **not** shared back to Karol | Token holder. CRM reads this account. |
| `crm@` | agent | Inbox | n/a (already on agent) | — | CRM-facing alias on the agent user. |
| `dmarc@` | agent | DMARC (intended) | n/a | — | DMARC `rua=` destination. Must file on arrival and never stay in Inbox. Sieve for that is **not confirmed**. |

### Client aliases (CRM routing names)

Hyphenated names are the ones the CRM knows. A local part equal to a client
slug routes with no config; anything else needs `aliasMap`.

| Address | Lives on | Folder | Redirect → agent | CRM |
|---|---|---|---|---|
| `mineralife@` | karol | Clients/Mineralife | yes | Mineralife (slug match) |
| `artist-house@` | karol | Clients/Artist House | yes | Artist House (slug match) |
| `axvor@` | karol | Clients/Axvor | yes | DQS via `aliasMap.axvor = dqs` |
| `great-day@` | karol | Clients/GDI | yes | GDI via `aliasMap.great-day = gdi` |

`support@` is **not** a client. `invoices@` and `hello@` stay mail.

### Extra aliases (exist, not the CRM names)

These were reserved as property placeholders. The old `Properties/` tree was
merged into `Clients/`. They receive on Karol. Redirects to agent were **not**
confirmed. `gdi@` would slug-match a GDI client if mail ever reached the CRM;
prefer `great-day@`.

| Address | Folder | Note |
|---|---|---|
| `gdi@` | Clients/GDI | Extra for Great Day. CRM's name is `great-day@`. |
| `artisthouse@` | Clients/Artist House | Extra. CRM's name is `artist-house@`. |
| `zemvelo@` | Clients/Zemvelo | Reserved. Would slug-match Zemvelo if ingested. |
| `blisscb@` | Clients/Bliss CB | Reserved. Needs an `aliasMap` entry if it should route. |

### Leftover / gone

| Address | State |
|---|---|
| `mcm@` | **Deleted** (alias + sending identity). Nothing in the CRM knows it. |
| `zbigniew@` | Still an alias + identity on the **agent** user. Leftover. Drop if unwanted. |

## Folders (live, 2026-08-30)

### Karol

Inbox, Archive, Drafts, Scheduled, Sent, Spam, Trash.

Work: **Hello**, **Accounts**, **Invoices** (shared), **Support** (shared),
**CRM** (empty), **Clients/** with Artist House, Axvor, Bliss CB, GDI,
Mineralife, Zemvelo.

No `Properties/` tree. Do not add Sieve that files into `Properties.*` — Fastmail
will recreate those folders via `:create`.

Folder default-From is set on Invoices and Support only. Hello, Accounts, and
each `Clients/*` folder still need it so a reply from that folder goes out as
the matching address.

### Agent

Inbox, Archive, Drafts, Scheduled, Sent, Spam, Trash, **DMARC** (empty).

The agent session can see Karol's account (shares). Karol's session cannot see
the agent account — Inbox share-back is still open.

## How a message moves

1. MX delivers to Fastmail.
2. The **team alias** decides which user owns the message (`karol@` or `agent@`).
3. Karol's **Sieve** files by envelope local-part into Hello / Accounts /
   Invoices / Support / `Clients.*`.
4. **Redirect** (where marked) drops a copy into the agent account. Fastmail
   keeps the original `To:` header; `Delivered-To` / `X-Original-To` may also
   carry the alias. The CRM reads all three.
5. `npm run inbox:sync` pulls the agent account over JMAP into `inbox_mail`.
6. Routing is **alias first, sender domain second**. See below.

## CRM ingest

Only the **agent** account is read. A Fastmail token is account-scoped, not
folder-scoped, so the account the token belongs to *is* the blast radius.
Redirected copies already land there. Do not wire `KAROL_FASTMAIL_TOKEN` into
the sync.

```bash
npm run inbox:check          # config + connection, reads nothing
npm run inbox:check -- --peek
npm run inbox:sync           # since last watermark
npm run inbox:sync -- --all
npm run inbox:sync -- --dry
npm run check:jmap           # routing tests, no mailbox
```

Env:

| Variable | Who | Used by |
|---|---|---|
| `AGENT_FASTMAIL_TOKEN` | agent@ | CRM sync (`lib/jmap.ts`). Prefer a **read-only** JMAP token. |
| `AGENT_FASTMAIL_EMAIL` | agent@ | Label only. |
| `KAROL_FASTMAIL_TOKEN` | karol@ | Local mailbox setup. **Never** the CRM reader. |
| `KAROL_FASTMAIL_EMAIL` | karol@ | Label only. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | — | Outbound. From is `hello@tallkarol.com`. |

`lib/jmap.ts` issues only `Mailbox/get`, `Email/query`, `Email/get`. It never
calls `Email/set` or `EmailSubmission/set`. That guarantee is currently in
code; the live token is still full read/write. Downgrade it.

Watermark, optional folder filter, `aliasMap`, and `ticketAliases` live in
`app_settings.inbox_mail_sync`. The map the checks expect:

```json
{ "axvor": "dqs", "great-day": "gdi" }
```

`ticketAliases` defaults to `["support"]`. Auto-ticketing goes through
`ticketFromMail()` — the same path as the inbox Make-ticket button — so
numbers stay consistent. Idempotent on RFC `Message-ID`.

**Do not point `tallkarol.com` MX at Resend.** Resend inbound takes MX for the
whole domain. There is no per-address split. If push ever beats polling: keep
the address on Fastmail, forward to Resend's inbound address, take the
webhook, then fetch the body. Not built.

## JMAP cannot do

Aliases, Sieve, sharing, and folder default-From are Fastmail UI only. There
is no `jmap:sieve` on this account and no sharing API. `Identity/set` without
a team alias creates an **unverified sending identity** — it does not receive
mail. Team-alias **delete** requires the Fastmail account password (step-up).
Never paste that password into chat or env files.

## How to add a client address

One address at a time.

1. Users & Sharing → Aliases → new alias `<slug>@tallkarol.com` delivering to
   `karol@`.
2. Add a sending identity for the same address (name + signature).
3. Folder `Clients/<Name>` if it does not exist.
4. Sieve: envelope `:domain` is `tallkarol.com` and `:localpart` is the slug
   (plus-addressing stripped by Fastmail before Sieve sees it — still match
   the bare local part). File into `Clients/<Name>`. Do not file into
   `Properties.*`.
5. **Then** share that folder to `agent@`. Set the folder's default From to
   the new alias.
6. Redirect a copy to `agent@` if the CRM should see it.
7. If the local part is not the client slug, add
   `app_settings.inbox_mail_sync.aliasMap.<local> = <slug-or-id>`.
8. Update this file and `~/Work/daedalus-docs/email.md`.

## Still open (2026-08-30)

- Folder default-From on Hello, Accounts, and each `Clients/*` folder.
- Share each `Clients/*` folder to agent.
- Signatures on the newer identities.
- Agent Sieve: `dmarc@` → DMARC, never Inbox.
- Share agent Inbox to Karol (plan called for it; not done).
- Drop `zbigniew@` if it is leftover.
- Optional redirects for reserved extras (`gdi@`, `zemvelo@`, `artisthouse@`,
  `blisscb@`).
- CRM still sends as `hello@` via Resend; `invoices@` as invoice reply-to is a
  later code change.
- Confirm Karol's custom Sieve has no `Properties` and no `mcm`.
