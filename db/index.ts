import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

type Db = PostgresJsDatabase<typeof schema>

declare global {
  // eslint-disable-next-line no-var
  var __tk_crm_db_v27: Db | undefined
}

export function getDb(): Db {
  if (global.__tk_crm_db_v27) return global.__tk_crm_db_v27

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set")
  }
  // *.railway.internal only resolves inside Railway. Local dev needs the
  // public URL from Postgres → Connect (the one that looks like *.rlwy.net).
  if (
    connectionString.includes(".railway.internal") &&
    process.env.RAILWAY_ENVIRONMENT == null
  ) {
    throw new Error(
      "DATABASE_URL uses *.railway.internal, which does not work on your laptop. In Railway → Postgres → Connect, copy the public URL into crm/.env.local."
    )
  }

  // Railway's hobby cap used to be tight: leftover Next processes opened 10
  // each and tripped `too many clients already` — a 500 on every page. The
  // server allows 500 now (18 in use, 24 Sep 2026), and at 3 a dashboard's
  // ~37 reads queued in a dozen waves of ~150 ms from the laptop. 8 halves
  // that and still leaves room for every stray process.
  const client = postgres(connectionString, {
    max: 8,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    // TK_DB_TRACE=1 prints every query as it is sent, with the ms since the
    // process started — gaps between lines are the waterfalls a page waits on.
    ...(process.env.TK_DB_TRACE
      ? {
          debug: (_conn: number, query: string) =>
            console.log(`[db] ${Math.round(performance.now())} ${query.replace(/\s+/g, " ").slice(0, 140)}`),
        }
      : {}),
  })
  const db = drizzle(client, { schema })
  // Cache in EVERY environment. `db` below is a proxy that calls getDb() on
  // each property access, so without this production opened a fresh pool per
  // `db.query…` — none of them ever closed — until Postgres answered
  // `too many clients already` and every page 500'd. Dev needs the global too:
  // it is what survives HMR (bump the name when the schema changes).
  global.__tk_crm_db_v27 = db
  return db
}

/** Convenience — same as getDb() */
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb()
    const value = Reflect.get(real, prop, real)
    return typeof value === "function" ? value.bind(real) : value
  },
})
