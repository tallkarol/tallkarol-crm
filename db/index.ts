import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

type Db = PostgresJsDatabase<typeof schema>

declare global {
  // eslint-disable-next-line no-var
  var __tk_crm_db_v17: Db | undefined
}

export function getDb(): Db {
  if (global.__tk_crm_db_v17) return global.__tk_crm_db_v17

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

  // Railway's hobby cap is tight. Leftover Next processes used to open 10
  // each and trip `too many clients already` — a 500 on every page.
  const client = postgres(connectionString, {
    max: 3,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  })
  const db = drizzle(client, { schema })
  if (process.env.NODE_ENV !== "production") {
    global.__tk_crm_db_v17 = db
  }
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
