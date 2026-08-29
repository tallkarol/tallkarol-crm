import { and, count, eq, isNotNull } from "drizzle-orm"
import { db } from "@/db"
import { magicLinks, type User } from "@/db/schema"

/** "karolzbuczek@gmail.com" → "Karolzbuczek" — last-resort display name. */
function nameFromEmail(email: string) {
  const local = email.split("@")[0] ?? email
  return local ? local[0].toUpperCase() + local.slice(1) : email
}

/**
 * "Welcome, {name}" on the very first sign-in, "Welcome back, {name}" after.
 * A returning user has used more than one magic link for their email.
 */
export async function greetingFor(user: User | null): Promise<string> {
  if (!user) return "Dashboard"
  const name = user.name || nameFromEmail(user.email)
  const [row] = await db
    .select({ n: count() })
    .from(magicLinks)
    .where(and(eq(magicLinks.email, user.email), isNotNull(magicLinks.usedAt)))
  const returning = (row?.n ?? 0) > 1
  return returning ? `Welcome back, ${name}` : `Welcome, ${name}`
}
