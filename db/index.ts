import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

type Db = PostgresJsDatabase<typeof schema>

declare global {
  // eslint-disable-next-line no-var
  var __tk_crm_db: Db | undefined
}

export function getDb(): Db {
  if (global.__tk_crm_db) return global.__tk_crm_db

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set")
  }

  const client = postgres(connectionString, { max: 10 })
  const db = drizzle(client, { schema })
  if (process.env.NODE_ENV !== "production") {
    global.__tk_crm_db = db
  }
  return db
}

/** Convenience — same as getDb() */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb()
    const value = Reflect.get(real, prop, receiver)
    return typeof value === "function" ? value.bind(real) : value
  },
})
