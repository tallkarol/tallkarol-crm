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

import {
  checkAgentMailbox,
  peekAgentMailbox,
  planInboxSync,
  runInboxSync,
} from "../lib/inbox-sync"

function requireConfigured(error?: string) {
  if (!error) return
  if (error.includes("AGENT_FASTMAIL_TOKEN")) {
    console.log("AGENT_FASTMAIL_TOKEN is not set.")
    console.log("")
    console.log("  1. Fastmail → Settings → My email addresses → add the alias, redirecting")
    console.log("     into agent@tallkarol.com")
    console.log("  2. Sign in AS agent@ → Settings → Privacy & Security → Manage API tokens")
    console.log("  3. New token, JMAP scope, READ-ONLY")
    console.log("  4. AGENT_FASTMAIL_TOKEN=… in .env.local, then re-run this")
    process.exit(1)
  }
  console.error(error)
  process.exit(1)
}

async function check(peek: boolean) {
  const status = await checkAgentMailbox()
  requireConfigured(status.error)
  if (status.error) {
    console.error(status.error)
    process.exit(1)
  }

  console.log(`connected · account ${status.accountId}`)
  console.log(`last sync: ${status.lastSyncAt ?? "never"}`)
  console.log(`folder:    ${status.mailbox ?? "(whole account)"}`)
  console.log(`aliasMap:  ${JSON.stringify(status.aliasMap)}`)
  console.log(`→ tickets: ${status.ticketAliases.join(", ")}`)

  console.log("\nfolders")
  for (const box of status.folders) {
    const mark = box.selected ? "→" : " "
    console.log(`  ${mark} ${box.name.padEnd(24)} ${String(box.total).padStart(6)}  ${box.id}`)
  }
  if (status.warning) console.log(`\n  WARNING: ${status.warning}.`)

  if (!peek) return

  const live = await peekAgentMailbox(10)
  requireConfigured(live.error)
  if (live.error) {
    console.error(live.error)
    process.exit(1)
  }
  console.log(`\nnewest ${live.messages.length} message(s) — nothing written`)
  for (const m of live.messages) {
    console.log(`\n  id           ${m.id}`)
    console.log(`  subject      ${m.subject}`)
    console.log(`  from         ${m.from}`)
    console.log(`  To:          ${m.to || "(none)"}`)
    console.log(`  Delivered-To ${m.deliveredTo || "(none)"}`)
    console.log(`  X-Original-To ${m.originalTo || "(none)"}`)
    if (m.snippet) console.log(`  snippet      ${m.snippet}`)
    console.log(`  received     ${m.receivedAt}`)
  }
}

async function sync(all: boolean, dry: boolean) {
  if (dry) {
    const plan = await planInboxSync({ all })
    requireConfigured(plan.error)
    if (plan.error) {
      console.error(plan.error)
      process.exit(1)
    }
    console.log(`fetched ${plan.fetched} message(s)${plan.since ? ` since ${plan.since}` : ""}`)
    for (const row of plan.rows) {
      const label = row.clientSlug ? `${row.clientSlug} (via ${row.via})` : "unassigned"
      const extra = row.alreadyStored ? " (already stored)" : row.autoTicket ? "→ ticket" : ""
      console.log(`  ${row.subject.slice(0, 52).padEnd(52)}  ${label.padEnd(22)}${extra}`)
    }
    console.log("\ndry run — nothing written")
    return
  }

  const result = await runInboxSync({ all })
  requireConfigured(result.error)
  if (result.error) {
    console.error(result.error)
    process.exit(1)
  }
  console.log(`fetched ${result.fetched ?? result.rows.length} message(s)`)
  for (const row of result.rows) {
    const label = row.clientSlug ?? "unassigned"
    const note = row.ticket ? `→ ${row.ticket}` : row.error ? `→ ticket FAILED: ${row.error}` : ""
    console.log(`  + ${row.subject.slice(0, 52).padEnd(52)}  ${label.padEnd(22)}${note}`)
  }
  console.log(
    `\nadded ${result.added} new · ${result.ticketed} opened as tickets · ${result.total} total in inbox_mail`
  )
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
