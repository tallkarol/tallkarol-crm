# Agent mailbox — rules of engagement

Read this before sending anything from a client alias, and before telling a
client to write to one. `MAIL.md` is the map. This file is what you are
allowed to do with it.

Fastmail stays the system of record. The CRM is a reader of **agent@** only.
Karol sends. The agent does not.

## Hard rules

These do not have exceptions. A test with a friendly client is still a test of
these, not a waiver.

1. **The agent never sends.** No `EmailSubmission/set`, no identity on agent@
   used as From, no “just bounce this for me.” Outbound is Karol in Fastmail, or
   Resend as `hello@` for site/CRM mail. If a future feature wants the CRM to
   reply, it is a separate decision and a separate token — not this one.
2. **The agent never reads `karol@`.** Do not put `KAROL_FASTMAIL_TOKEN` in
   `.env.local` as the inbox reader, on Railway, or in a “just this once”
   script. Redirect copies into agent@ are the only way client mail reaches
   the CRM.
3. **The token is account-scoped.** Whoever owns `AGENT_FASTMAIL_TOKEN` is the
   blast radius. That account is `agent@`. Downgrade the live token to
   **JMAP read-only** before any live send — the code already refuses writes,
   but the credential still can. A read-only token makes “cannot send” structural.
4. **Only `support@` opens a ticket on arrival.** Client aliases land as mail
   and wait for triage. Do not add a client local-part to
   `ticketAliases` because a message “looked like a ticket.”
5. **One client at a time.** Do not turn on a new From, a new redirect, and a
   new Sieve rule in the same sitting as a live send. Prove the last change
   before the next.
6. **GDI and Mineralife are last.** Not the first live From, not the first
   “please write us at …” instruction. See the ladder.
7. **Nothing in this file, in chat, or in a commit is a Fastmail password or
   API token.**

## What the agent is allowed to do today

| Allowed | Not allowed |
|---|---|
| Poll agent@ over JMAP (`Mailbox/get`, `Email/query`, `Email/get`) | Send, delete, move, flag, or import mail |
| Store a copy in `inbox_mail` (body capped at 100k) | Read Karol’s mailbox |
| Route by alias first, sender domain second | Guess a client when both signals miss — leave it unassigned |
| Auto-ticket `support@` | Auto-ticket `mineralife@`, `great-day@`, `artist-house@`, `axvor@`, `invoices@`, `hello@` |
| Triage in `/inbox` (read, snooze, archive, assign, make task, make ticket) | Reply from the CRM |

A lost CRM row does not lose the mail. Fastmail still has it.

## What will actually go wrong if you skip this

These are the snafus, not hypotheticals.

**Wrong From on a reply.** Folder default-From is set on Invoices and Support
only. Hello, Accounts, and every `Clients/*` folder still send as whatever
Fastmail picks — usually `karol@`. If you answer Pedro from `Clients/GDI`
without setting that folder’s default From to `great-day@`, he sees
`karol@tallkarol.com`. Set default-From on the test folder *before* the first
live send from that alias.

**Agent Inbox is invisible to you.** Agent@ is not shared back to Karol. You
cannot see what the robot sees unless you sign in as agent or look at
`/inbox` after a sync. Share agent Inbox to Karol before relying on “it
landed.”

**Redirects for the sensitive aliases are already on.** `mineralife@`,
`great-day@`, `artist-house@`, `axvor@`, `invoices@`, and `support@` already
copy into agent@. Sending From `great-day@` today means the reply copies into
the CRM tonight. Do not use those two as From until the ladder is green.
Leaving the redirect on is fine — a copy sitting unread in agent@ is safer
than turning redirects off and forgetting them.

**Sender-domain fallback files `support@` under a client.** Alias wins when
present. When the alias is `support@` (not a client), the sender domain is
used. Mapped today:

| Client | Sender domain |
|---|---|
| Artist House | `artisthouse.world` |
| DQS | `dqstaff.com` |
| GDI | `greatdayimprovements.com` |
| everyone else | none |

So a GDI person writing to `support@` becomes a GDI ticket. That is intended
for support. It is a misfire if someone at Great Day writes to `hello@` and
that copy ever reaches agent@ — `hello@` does **not** redirect today. Keep it
that way until house mail has its own rules.

**Mineralife has no sender domain.** A Mineralife person on Gmail, writing to
an address that is not `mineralife@`, will not route. That is correct. Do not
“fix” it by adding `gmail.com`.

**`gdi@` would slug-match GDI** if a copy ever reached the CRM. Prefer
`great-day@`. Do not turn on a `gdi@` redirect.

**The live token is still read/write.** Code will not send. A bug, a pasted
snippet, or a future feature can. Downgrade it.

**`dmarc@` is not sieved.** Aggregate reports will sit in agent Inbox and get
synced as mail if you leave them there. File them to DMARC before you care
about a clean inbox.

## Sensitivity ladder

Prove each rung before the next. A rung is proven when the checklist under
**One client, end to end** is ticked for that alias and you have watched one
real reply land in `/inbox` on the right client, with no ticket, and the
thread in Fastmail still looks right.

| Order | Alias | Why this rung | Do not |
|---|---|---|---|
| 0 | House loop — send *to* `artist-house@` from a personal address | No client involved. Proves redirect, headers, routing, sync, no auto-ticket. You already did a CRM-TEST version of this. Do it again as yourself, not as `hello@`. | Skip this because “the August tests passed.” Those were from `hello@` to the alias. A human From is the point. |
| 1 | `artist-house@` as **your** From | Project is complete and paid. Joe. Lowest blast radius if the From or the filing is wrong. Alias already exists and already redirects. | CC anyone at GDI or Mineralife on the thread. |
| 2 | `axvor@` as your From | Active but small. Map is `axvor → dqs`. This is the first *mapped* alias (not a slug), so it is the first test that the aliasMap in `app_settings` is what production thinks it is. | Use `dqs@` — that alias does not exist and would not route. |
| 3 | New alias built from scratch — `caps-fieldhouse@` | No alias today. This is the rehearsal of “How to add a client address” in `MAIL.md`, on a client with no enterprise legal team. | Add Mineralife’s sender domain, or a `gdi@` extra, “while you’re in the UI.” |
| 4 | `invoices@` / `support@` as From on a *low-stakes* thread | House addresses, already shared, already default-From. Proves you can send as the folder identity and that `support@` still auto-tickets only when the *recipient* is support. | Send a real invoice or a real support reply as the first test. Send yourself a loop first. |
| 5 | `mineralife@` | Last but one. Active retainer, Ads, health-adjacent. Add `mineralifeonline.com` to `clients.domains` only after you have a reason — and never `gmail.com`. | Tell Ethan or anyone there to “use this address now” until you have sent and received one thread yourself. |
| 6 | `great-day@` | Last. Pedro, Melanie, Kelsey, VIP, legal. Folder default-From on `Clients/GDI` must be `great-day@` before the first send. | Use `gdi@`. Do not mention the address in a GDI thread until rung 6 is the one you are on. |

Ended clients (`bliss-cb`, `total-soccer-academy`) are not a test. They have
no CRM routing name you would send from, and a surprise email from a dead
alias is a different kind of snafu.

`zemvelo@` is reserved and would slug-match Zemvelo. Leave it alone. Zemvelo
shares the Ads account with Mineralife; it is not a “safe” extra.

## Preconditions — do these once, before rung 1

Do not send From a client alias until all of these are true.

- [ ] `AGENT_FASTMAIL_TOKEN` is a **read-only** JMAP token. Confirm in Fastmail
      (agent user → Privacy & Security → tokens) and with
      `npm run inbox:check`. If a write ever succeeds, stop.
- [ ] Agent Inbox is shared **to Karol**, so you can see what the robot sees
      without signing in as agent.
- [ ] Agent Sieve files `dmarc@` into DMARC and it never stays in Inbox.
- [ ] `zbigniew@` is dropped or you have written down why it stays.
- [ ] `npm run check:jmap` is green.
- [ ] `npm run inbox:check -- --peek` shows `To:` / `Delivered-To` /
      `X-Original-To` the way you think they work. If a peek disagrees with
      `MAIL.md`, the file is wrong — fix the file, do not “work around it.”
- [ ] Folder default-From is set on the folder you are about to send from.
- [ ] You are not logged into Fastmail as the team master user.

## One client, end to end

Run this for **each** rung. Do not batch.

1. **Decide the From.** The CRM name (`artist-house@`), not the extra
   (`artisthouse@`).
2. **Confirm the folder default-From** is that address. Send a draft to
   yourself first, from that folder, and look at the raw From.
3. **House loop (rung 0 every time you touch Sieve or a redirect).** From a
   personal address that is not `@tallkarol.com`, send a message *to* the
   alias. Subject like `ENGAGE TEST artist-house 2026-09-02`. Body can be
   empty. No attachments with client files.
4. **Watch Fastmail, not the CRM first.** It files into `Clients/<Name>` on
   Karol. A copy appears in agent Inbox. If either hop fails, stop — the CRM
   cannot fix a missing redirect.
5. **Sync dry, then for real.**

   ```bash
   npm run inbox:sync -- --dry
   npm run inbox:sync
   ```

   The dry line must show the right client (`artist-house (via alias)`, not
   `unassigned` and not another slug). `→ ticket` must **not** appear unless
   the alias is `support`.
6. **Open `/inbox`.** Same client, readable body, no ticket. Archive the test.
7. **Send live From the alias** — one thread, one recipient, someone who will
   not forward it to a buying committee. Prefer a person who already emails
   you.
8. **When they reply,** repeat 4–6 on the reply. The reply must still route
   by alias (they wrote to `artist-house@`), even if they sent from Gmail.
9. **Stop.** Write the date on the rung. Do not start the next client the
   same day.

If any step files under the wrong client, **do not assign it by hand and
carry on.** That hides the bug. Note the headers (`To`, `Delivered-To`,
`X-Original-To`, `From`), fix routing or the aliasMap, re-run `check:jmap`,
and only then send another test.

## Abort

- Wrong client on a real message: do not reassign quietly. Fix the rule.
  Tell the person on the thread if they saw the wrong From.
- Agent token used to send or the peek shows a write: revoke the token,
  issue a new read-only one, rotate Railway and `.env.local`.
- A client was told to use an address before that rung is proven: keep
  answering from `karol@` until the ladder says otherwise. Do not “just
  this once” from `great-day@`.
- You are tired or in a hurry: stay on `karol@`. The aliases are not a
  deadline.

## What this file does not decide yet

- CRM sending as `invoices@` via Resend (still `hello@`).
- Replying to a ticket from the CRM.
- Push/webhooks instead of poll.
- Turning `hello@` into an ingest target.
- Adding sender domains for Mineralife, Zemvelo, CAPS.

When one of those becomes real, write the rule here first, then the code.
