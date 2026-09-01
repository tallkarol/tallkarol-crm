import { eq } from "drizzle-orm"
import { db } from "@/db"
import { appSettings } from "@/db/schema"

export type BillingProfile = {
  billTo: string[]
  customerId: string | null
  senderEmail: string | null
}

export function readBilling(value: unknown): BillingProfile {
  const v = (value ?? {}) as Record<string, unknown>
  return {
    billTo: Array.isArray(v.billTo) ? v.billTo.map(String).filter(Boolean) : [],
    customerId: typeof v.customerId === "string" && v.customerId ? v.customerId : null,
    senderEmail: typeof v.senderEmail === "string" && v.senderEmail ? v.senderEmail : null,
  }
}

export type InvoiceSender = { lines: string[]; email: string }

const SENDER_FALLBACK: InvoiceSender = {
  lines: ["Karol Buczek"],
  // Billing address, not the outbound one — Resend still sends as hello@.
  email: "invoices@tallkarol.com",
}

export async function getInvoiceSender(): Promise<InvoiceSender> {
  const row = await db.query.appSettings.findFirst({
    where: eq(appSettings.key, "invoice_sender"),
  })
  const v = (row?.value ?? {}) as Record<string, unknown>
  return {
    lines: Array.isArray(v.lines) && v.lines.length ? v.lines.map(String) : SENDER_FALLBACK.lines,
    email: typeof v.email === "string" && v.email ? v.email : SENDER_FALLBACK.email,
  }
}

export type InvoiceLine = {
  text: string
  /** "20%" style allocation pulled from the line, shown in its own column. */
  allocation: string | null
  /** Indent level: 0 = headline continuation, 1 = "-", 2 = "--". */
  depth: number
}

/**
 * The description field is the invoice body. Multiline text renders one table
 * row per line ("-" bullets, "--" sub-bullets, trailing "(NN%)" or "NN%"
 * moves to the allocation column). Single-line prose renders as one row.
 */
export function parseDescription(description: string): { headline: string | null; lines: InvoiceLine[] } {
  const raw = description
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  if (raw.length === 0) return { headline: null, lines: [] }
  if (raw.length === 1 && !raw[0].startsWith("-")) {
    return { headline: null, lines: [{ text: raw[0], allocation: null, depth: 0 }] }
  }

  let headline: string | null = null
  const lines: InvoiceLine[] = []
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i]
    if (i === 0 && !line.startsWith("-")) {
      headline = line
      continue
    }
    const depth = line.startsWith("--") ? 2 : line.startsWith("-") ? 1 : 0
    let text = line.replace(/^-+\s*/, "")
    let allocation: string | null = null
    const m = /(?:\(\s*(\d{1,3})\s*%\s*\)|(\d{1,3})\s*%)\s*$/.exec(text)
    if (m) {
      allocation = `${m[1] ?? m[2]}%`
      text = text.slice(0, m.index).replace(/[\s·—–-]+$/, "").trim()
    }
    lines.push({ text, allocation, depth })
  }
  return { headline, lines }
}
