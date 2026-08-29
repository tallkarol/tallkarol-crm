"use server"

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { appSettings, expenses } from "@/db/schema"
import { getSessionUser } from "@/lib/auth"
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories"
import { normalizeVendorToken } from "@/lib/import-parse"
import { ROUTES } from "@/lib/nav"

const RULES_KEY = "vendor_rules"

type VendorRule = { vendor?: string; category: string; clientId: string | null }

/** Starter rules for vendors the business already uses; learned rules override. */
const DEFAULT_RULES: Record<string, VendorRule> = {
  "RAILWAY APP": { vendor: "Railway", category: "hosting", clientId: null },
  RAILWAY: { vendor: "Railway", category: "hosting", clientId: null },
  "ADOBE CREATIVE": { vendor: "Adobe", category: "software", clientId: null },
  ADOBE: { vendor: "Adobe", category: "software", clientId: null },
  "RESEND COM": { vendor: "Resend", category: "software", clientId: null },
  GODADDY: { vendor: "GoDaddy", category: "hosting", clientId: null },
  "GODADDY COM": { vendor: "GoDaddy", category: "hosting", clientId: null },
  NAMECHEAP: { vendor: "Namecheap", category: "hosting", clientId: null },
  "NAMECHEAP INC": { vendor: "Namecheap", category: "hosting", clientId: null },
  SHOPIFY: { vendor: "Shopify", category: "software", clientId: null },
  VERCEL: { vendor: "Vercel", category: "hosting", clientId: null },
  FIGMA: { vendor: "Figma", category: "software", clientId: null },
  OPENAI: { vendor: "OpenAI", category: "software", clientId: null },
  ANTHROPIC: { vendor: "Anthropic", category: "software", clientId: null },
  "GOOGLE GSUITE": { vendor: "Google Workspace", category: "software", clientId: null },
  MAILCHIMP: { vendor: "Mailchimp", category: "software", clientId: null },
  ENVATO: { vendor: "Envato", category: "software", clientId: null },
}

async function loadRules(): Promise<Record<string, VendorRule>> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, RULES_KEY),
  })
  const stored = (row?.value ?? {}) as Record<string, VendorRule>
  return { ...DEFAULT_RULES, ...stored }
}

export type ImportRowInput = {
  key: string
  occurredOn: string
  description: string
  amountCents: number
  sourceKind: string
}

export type ImportAnnotation = {
  key: string
  duplicate: boolean
  vendor: string
  category: string
  clientId: string | null
  ruleMatched: boolean
}

/** Server pass over a parsed batch: duplicate detection + vendor-rule hits. */
export async function annotateImport(
  rows: ImportRowInput[]
): Promise<ImportAnnotation[]> {
  const user = await getSessionUser()
  if (!user) return []

  const [existing, rules] = await Promise.all([
    db.select().from(expenses),
    loadRules(),
  ])
  const existingKeys = new Set(
    existing.map(
      (e) => `${e.occurredOn}|${e.amountCents}|${normalizeVendorToken(`${e.vendor} ${e.description}`)}`
    )
  )
  const existingLoose = new Set(existing.map((e) => `${e.occurredOn}|${e.amountCents}`))

  return rows.slice(0, 1000).map((row) => {
    const token = normalizeVendorToken(row.description)
    const firstWord = token.split(" ")[0]
    const rule = rules[token] ?? rules[firstWord] ?? null
    const dupKey = `${row.occurredOn}|${row.amountCents}|${token}`
    return {
      key: row.key,
      duplicate:
        existingKeys.has(dupKey) ||
        existingLoose.has(`${row.occurredOn}|${row.amountCents}`),
      vendor: rule?.vendor ?? titleCase(row.description),
      category: rule?.category ?? "other",
      clientId: rule?.clientId ?? null,
      ruleMatched: rule != null,
    }
  })
}

function titleCase(s: string) {
  const cleaned = s.replace(/\s+/g, " ").trim()
  if (cleaned.length <= 3) return cleaned
  return cleaned
    .toLowerCase()
    .split(" ")
    .slice(0, 5)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
}

export type CommitRowInput = {
  occurredOn: string
  vendor: string
  description: string
  amountCents: number
  category: string
  clientId: string | null
  sourceKind: string
}

export async function commitImport(
  rows: CommitRowInput[]
): Promise<{ ok: boolean; inserted: number; error?: string }> {
  const user = await getSessionUser()
  if (!user) return { ok: false, inserted: 0, error: "Sign in first." }

  const clients = await db.query.clients.findMany()
  const clientIds = new Set(clients.map((c) => c.id))
  const valid = rows
    .slice(0, 1000)
    .filter(
      (r) =>
        /^\d{4}-\d{2}-\d{2}$/.test(r.occurredOn) &&
        r.vendor.trim() &&
        Number.isInteger(r.amountCents) &&
        r.amountCents > 0
    )
  if (valid.length === 0) return { ok: false, inserted: 0, error: "Nothing to import." }

  await db.insert(expenses).values(
    valid.map((r) => ({
      occurredOn: r.occurredOn,
      vendor: r.vendor.trim(),
      description: r.description.trim(),
      amountCents: r.amountCents,
      category: EXPENSE_CATEGORIES.includes(r.category as never) ? r.category : "other",
      clientId: r.clientId && clientIds.has(r.clientId) ? r.clientId : null,
      source: ["card", "paypal", "ofx", "paste"].includes(r.sourceKind) ? r.sourceKind : "import",
    }))
  )

  // Learn: future imports of the same vendor pre-fill this category/client.
  const rulesRow = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, RULES_KEY),
  })
  const stored = (rulesRow?.value ?? {}) as Record<string, VendorRule>
  for (const r of valid) {
    // Key on the statement's own text so the next import of the same vendor
    // string matches, regardless of how the display vendor was edited.
    const token = normalizeVendorToken(r.description || r.vendor)
    if (!token) continue
    stored[token] = {
      vendor: r.vendor.trim(),
      category: r.category,
      clientId: r.clientId && clientIds.has(r.clientId) ? r.clientId : null,
    }
  }
  await db
    .insert(appSettings)
    .values({ key: RULES_KEY, value: stored, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: stored, updatedAt: new Date() } })

  revalidatePath(ROUTES.expenses)
  revalidatePath(ROUTES.retainers)
  return { ok: true, inserted: valid.length }
}
