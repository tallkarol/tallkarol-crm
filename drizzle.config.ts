import { defineConfig } from "drizzle-kit"

if (!process.env.DATABASE_URL) {
  // drizzle-kit generate does not need a live DB; migrate does.
}

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "postgresql://localhost:5432/tallkarol_crm",
  },
})
