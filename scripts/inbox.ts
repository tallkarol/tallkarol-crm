/**
 * Reads new mail out of the CRM mailbox into `inbox_mail`.
 *
 *   npm run inbox:check          # config, connection, folder list
 *   npm run inbox:check -- --peek  # print recent headers, write nothing
 *   npm run inbox:sync           # everything since the last sync
 *   npm run inbox:sync -- --all  # ignore the watermark, re-read the last 50
 *   npm run inbox:sync -- --dry  # show what would land, write nothing
 *
 * Needs `AGENT_FASTMAIL_TOKEN` (read-only scope is enough). The CRM is a reader
 * here — Fastmail keeps the archive — so re-running this is always safe.
 */

import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

import { eq, sql } from "drizzle-orm"
import { db } from "../db"
import { appSettings, clients, inboxMail } from "../db/schema"
import {
  fetchRecentMail,
  jmapConfig,
  jmapSession,
  listMailboxes,
  resolveClient,
  resolveMailboxId,
} from "../lib/jmap"

const SETTING_KEY = "inbox_mail_sync"

type SyncSetting = {
  lastSyncAt?: string
  /** Folder name or id. A name is resolved to an id at sync time. */
  mailbox?: string
  /** Alias local-part → client slug or id, for aliases that are not slugs. */
  aliasMap?: Record<string, string>
}

async function readSetting(): Promise<SyncSetting> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SETTING_KEY))
    .limit(1)
  const value = row?.value
  return value && typeof value === "object" ? (value as SyncSetting) : {}
}

async function writeSetting(next: SyncSetting) {
  await db
    .insert(appSettings)
    .values({ key: SETTING_KEY, value: next })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: next, updatedAt: new Date() } })
}

function requireConfig() {
  const config = jmapConfig()
  if (!config) {
    console.log("AGENT_FASTMAIL_TOKEN is not set.")
    console.log("")
    console.log("  1. Fastmail → Settings → My email addresses → add the alias, redirecting")
    console.log("     into agent@tallkarol.com")
    console.log("  2. Sign in AS agent@ → Settings → Privacy & Security → Manage API tokens")
    console.log("  3. New token, JMAP scope, READ-ONLY")
    console.log("  4. AGENT_FASTMAIL_TOKEN=… in .env.local, then re-run this")
    process.exit(1)
  }
  return config
}

async function check(peek: boolean) {
  const config = requireConfig()
  const session = await jmapSession(config)
  console.log(`connected · account ${session.accountId}`)

  const setting = await readSetting()
  console.log(`last sync: ${setting.lastSyncAt ?? "never"}`)
  console.log(`folder:    ${setting.mailbox ?? "(whole account)"}`)

  const boxes = await listMailboxes(config)
  console.log("\nfolders")
  for (const box of boxes) {
    const mark = setting.mailbox && resolveMailboxId(boxes, setting.mailbox) === box.id ? "→" : " "
    console.log(`  ${mark} ${box.name.padEnd(24)} ${String(box.total).padStart(6)}  ${box.id}`)
  }
  if (setting.mailbox && !resolveMailboxId(boxes, setting.mailbox)) {
    console.log(`\n  WARNING: configured folder "${setting.mailbox}" matches nothing above.`)
  }

  if (!peek) return

  // Read-only diagnostic: which header actually carries the original alias
  // after a Fastmail redirect. Nothing is written.
  const mailboxId = setting.mailbox ? resolveMailboxId(boxes, setting.mailbox) : null
  const mail = await fetchRecentMail(config, { limit: 10, mailbox: mailboxId ?? undefined })
  console.log(`\nnewest ${mail.length} message(s) — nothing written`)
  for (const m of mail) {
    console.log(`\n  subject      ${m.subject}`)
    console.log(`  from         ${m.fromEmail}`)
    console.log(`  To:          ${m.toEmail || "(none)"}`)
    console.log(`  Delivered-To ${m.deliveredTo || "(none)"}`)
    console.log(`  X-Original-To ${m.originalTo || "(none)"}`)
    console.log(`  received     ${m.receivedAt}`)
  }
}

async function sync(all: boolean, dry: boolean) {
  const config = requireConfig()
  const setting = await readSetting()
  const sinceIso = all ? null : (setting.lastSyncAt ?? null)

  let mailboxId: string | undefined
  if (setting.mailbox) {
    const boxes = await listMailboxes(config)
    const resolved = resolveMailboxId(boxes, setting.mailbox)
    if (!resolved) {
      console.log(`configured folder "${setting.mailbox}" does not exist — run inbox:check`)
      process.exit(1)
    }
    mailboxId = resolved
  }

  const mail = await fetchRecentMail(config, { limit: 50, sinceIso, mailbox: mailboxId })
  console.log(`fetched ${mail.length} message(s)${sinceIso ? ` since ${sinceIso}` : ""}`)

  const clientRows = await db
    .select({ id: clients.id, slug: clients.slug, domains: clients.domains })
    .from(clients)
  const aliasMap = setting.aliasMap ?? {}

  let added = 0
  for (const message of mail) {
    const { clientId, via } = resolveClient(message, clientRows, aliasMap)
    const label = clientId
      ? `${clientRows.find((c) => c.id === clientId)?.slug} (via ${via})`
      : "unassigned"

    if (dry) {
      console.log(`  ${message.subject.slice(0, 58).padEnd(58)}  ${label}`)
      continue
    }

    const inserted = await db
      .insert(inboxMail)
      .values({
        messageId: message.messageId,
        threadId: message.threadId,
        inReplyTo: message.inReplyTo,
        fromName: message.fromName,
        fromEmail: message.fromEmail,
        // Prefer whichever recipient header survived the redirect, so the row
        // records the alias it was actually sent to.
        toEmail: message.deliveredTo || message.originalTo || message.toEmail,
        subject: message.subject,
        snippet: message.snippet,
        body: message.body.slice(0, 100_000),
        clientId,
        receivedAt: new Date(message.receivedAt),
      })
      // A re-sync must never duplicate; the message id is the natural key.
      .onConflictDoNothing({ target: inboxMail.messageId })
      .returning({ id: inboxMail.id })
    if (inserted.length > 0) {
      added += 1
      console.log(`  + ${message.subject.slice(0, 58).padEnd(58)}  ${label}`)
    }
  }

  if (dry) {
    console.log("\ndry run — nothing written")
    return
  }

  const newest = mail.reduce<string | null>(
    (latest, m) => (latest == null || m.receivedAt > latest ? m.receivedAt : latest),
    null
  )
  if (newest) await writeSetting({ ...setting, lastSyncAt: newest })

  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(inboxMail)
  console.log(`\nadded ${added} new · ${count} total in inbox_mail`)
}

async function main() {
  const argv = process.argv.slice(2)
  const command = argv[0] === "check" ? "check" : "sync"
  if (command === "check") await check(argv.includes("--peek"))
  else await sync(argv.includes("--all"), argv.includes("--dry"))
  process.exit(0)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
