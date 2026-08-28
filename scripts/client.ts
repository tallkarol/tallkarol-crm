/**
 * Client email domains — the signal that maps a meeting to a client.
 *
 *   npm run client:domains                       list
 *   npm run client:domains -- gdi a.com b.com    set (replaces)
 *   npm run client:suggest                       unmapped domains, by meeting hours
 */
import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { calendarEvents, clients } from "../db/schema"

async function list() {
  const rows = await db.query.clients.findMany({ orderBy: [asc(clients.name)] })
  for (const c of rows) {
    console.log(`  ${c.slug.padEnd(24)} ${c.domains.length ? c.domains.join(", ") : "—"}`)
  }
}

async function set(slug: string, domains: string[]) {
  const client = await db.query.clients.findFirst({ where: eq(clients.slug, slug) })
  if (!client) throw new Error(`No client "${slug}"`)
  const clean = domains
    .map((d) => d.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, ""))
    .filter(Boolean)
  await db.update(clients).set({ domains: clean, updatedAt: new Date() }).where(eq(clients.id, client.id))
  console.log(`${slug}: ${clean.join(", ") || "(cleared)"}`)
}

/** Free-mail hosts are never a client signal. */
const IGNORE = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "yahoo.com",
  "icloud.com", "me.com", "tallkarol.com", "karolbuczek.com",
  "resource.calendar.google.com", "group.calendar.google.com",
])

async function suggest() {
  const rows = await db.query.clients.findMany()
  const mapped = new Set(rows.flatMap((c) => c.domains))
  const events = await db.query.calendarEvents.findMany()

  const hours = new Map<string, number>()
  for (const e of events) {
    if (e.allDay || e.cancelled) continue
    const h = (e.endsAt.getTime() - e.startsAt.getTime()) / 3_600_000
    if (h <= 0 || h > 12) continue
    const domains = new Set(
      (e.attendees ?? []).map((a) => (a.email || "").split("@")[1]).filter(Boolean)
    )
    for (const d of Array.from(domains)) {
      if (IGNORE.has(d) || mapped.has(d)) continue
      hours.set(d, (hours.get(d) ?? 0) + h)
    }
  }

  const sorted = Array.from(hours.entries()).sort((a, b) => b[1] - a[1])
  if (!sorted.length) return console.log("Every meeting domain is mapped.")
  console.log("Unmapped domains, by meeting hours:")
  for (const [d, h] of sorted.slice(0, 15)) {
    console.log(`  ${h.toFixed(1).padStart(7)} hr  ${d}`)
  }
  console.log(`\nClients: ${rows.map((c) => c.slug).join(", ")}`)
}

async function main() {
  const [a, ...rest] = process.argv.slice(2)
  if (a === "suggest") await suggest()
  else if (a && rest.length) await set(a, rest)
  else await list()
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
