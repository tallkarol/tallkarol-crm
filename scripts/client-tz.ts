/**
 * Client time zones — what "Friday at 2" means for each client.
 *
 *   npm run client:tz                              list
 *   npm run client:tz -- default America/New_York  set the default
 *   npm run client:tz -- mineralife America/Denver set one client (slug must exist)
 *   npm run client:tz -- mineralife -              clear an override
 */
import { loadLocalEnv } from "../lib/load-env"
loadLocalEnv()

import { asc, eq } from "drizzle-orm"
import { db } from "../db"
import { clients } from "../db/schema"
import { clientTimezones, setClientTimezones } from "../lib/client-timezone"

function assertZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz })
  } catch {
    throw new Error(`"${tz}" is not an IANA time zone (try America/Denver)`)
  }
}

async function main() {
  const [slug, tz] = process.argv.slice(2)
  const current = await clientTimezones()
  if (!slug) {
    const rows = await db.query.clients.findMany({ orderBy: [asc(clients.name)] })
    console.log(`  ${"(default)".padEnd(24)} ${current.default}`)
    for (const c of rows) {
      const own = current.overrides[c.slug]
      console.log(`  ${c.slug.padEnd(24)} ${own ?? current.default}${own ? "" : "  (default)"}`)
    }
    return
  }
  if (!tz) throw new Error("give a zone, or - to clear")
  if (slug === "default") {
    assertZone(tz)
    await setClientTimezones({ ...current, default: tz })
    console.log(`default: ${tz}`)
    return
  }
  const client = await db.query.clients.findFirst({ where: eq(clients.slug, slug) })
  if (!client) throw new Error(`No client "${slug}"`)
  const overrides = { ...current.overrides }
  if (tz === "-") delete overrides[slug]
  else {
    assertZone(tz)
    overrides[slug] = tz
  }
  await setClientTimezones({ ...current, overrides })
  console.log(`${slug}: ${overrides[slug] ?? `${current.default} (default)`}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
