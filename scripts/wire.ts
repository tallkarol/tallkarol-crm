/**
 * Wiring client apps into the CRM.
 *
 *   npm run wire:list
 *   npm run wire:app -- artist-house "Artist House" artist-house "Next.js"
 *   npm run wire:rotate -- artist-house
 *   npm run wire:revoke -- artist-house
 *   npm run wire:monitor -- artist-house-daily-ingest "Daily ingest" artist-house 1440 180 "11:30 UTC daily"
 *
 * The key is printed once, at creation. It is stored hashed and cannot be read
 * back — rotate if it's lost.
 */
import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { appSources, clients, monitors } from "../db/schema"
import { newAppKey } from "../lib/app-source"

async function list() {
  const apps = await db.query.appSources.findMany({
    with: { client: { columns: { name: true } } },
    orderBy: [asc(appSources.slug)],
  })
  if (!apps.length) console.log("No wired apps yet.")
  for (const a of apps) {
    const seen = a.lastSeenAt ? a.lastSeenAt.toISOString().slice(0, 16).replace("T", " ") : "never"
    console.log(
      `${a.slug.padEnd(20)} ${(a.client?.name ?? "—").padEnd(16)} ${a.scopes.join(",").padEnd(20)} last seen ${seen}${a.revokedAt ? "  REVOKED" : ""}`
    )
  }
  const mons = await db.query.monitors.findMany({ orderBy: [asc(monitors.slug)] })
  if (mons.length) console.log("")
  for (const m of mons) {
    console.log(
      `${m.slug.padEnd(30)} every ${String(m.expectEveryMinutes).padStart(5)}m +${m.graceMinutes}m grace  streak ${m.failStreak}${m.paused ? "  PAUSED" : ""}`
    )
  }
}

async function addApp(slug: string, name: string, clientSlug?: string, platform = "") {
  if (!slug) throw new Error("Usage: wire:app -- <slug> <name> [clientSlug] [platform]")
  const client = clientSlug
    ? await db.query.clients.findFirst({ where: eq(clients.slug, clientSlug) })
    : null
  if (clientSlug && !client) throw new Error(`No client "${clientSlug}"`)

  const { key, secretHash } = newAppKey(slug)
  await db
    .insert(appSources)
    .values({ slug, name: name || slug, clientId: client?.id ?? null, platform, secretHash })
    .onConflictDoUpdate({
      target: appSources.slug,
      set: { name: name || slug, clientId: client?.id ?? null, platform, secretHash, revokedAt: null },
    })
  console.log(`\n${slug} wired${client ? ` to ${client.name}` : ""}.\n\n  ${key}\n`)
  console.log("Store it as TK_CRM_KEY in that app. It cannot be shown again.\n")
}

async function rotate(slug: string) {
  const app = await db.query.appSources.findFirst({ where: eq(appSources.slug, slug) })
  if (!app) throw new Error(`No app "${slug}"`)
  const { key, secretHash } = newAppKey(slug)
  await db
    .update(appSources)
    .set({ secretHash, revokedAt: null, updatedAt: new Date() })
    .where(eq(appSources.id, app.id))
  console.log(`\n${slug} rotated.\n\n  ${key}\n`)
}

async function revoke(slug: string) {
  const app = await db.query.appSources.findFirst({ where: eq(appSources.slug, slug) })
  if (!app) throw new Error(`No app "${slug}"`)
  await db
    .update(appSources)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(appSources.id, app.id))
  console.log(`${slug} revoked — its key stops working immediately.`)
}

async function addMonitor(
  slug: string,
  name: string,
  appSlug: string,
  every = "1440",
  grace = "180",
  note = ""
) {
  if (!slug || !appSlug) {
    throw new Error("Usage: wire:monitor -- <slug> <name> <appSlug> [everyMin] [graceMin] [note]")
  }
  const app = await db.query.appSources.findFirst({ where: eq(appSources.slug, appSlug) })
  if (!app) throw new Error(`No app "${appSlug}" — run wire:app first`)

  await db
    .insert(monitors)
    .values({
      slug,
      name: name || slug,
      clientId: app.clientId,
      sourceId: app.id,
      scheduleNote: note,
      expectEveryMinutes: Number(every) || 1440,
      graceMinutes: Number(grace) || 180,
    })
    .onConflictDoUpdate({
      target: monitors.slug,
      set: {
        name: name || slug,
        clientId: app.clientId,
        sourceId: app.id,
        scheduleNote: note,
        expectEveryMinutes: Number(every) || 1440,
        graceMinutes: Number(grace) || 180,
        updatedAt: new Date(),
      },
    })
  console.log(`Monitor ${slug} watching ${appSlug} — expects a run every ${every}m (+${grace}m grace).`)
}

const [cmd, ...args] = process.argv.slice(2)
const run =
  cmd === "app"
    ? addApp(args[0], args[1] ?? "", args[2], args[3])
    : cmd === "rotate"
      ? rotate(args[0])
      : cmd === "revoke"
        ? revoke(args[0])
        : cmd === "monitor"
          ? addMonitor(args[0], args[1] ?? "", args[2], args[3], args[4], args[5])
          : list()

run
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
