/**
 * Statement parsing for the expense importer. Pure functions, safe on the
 * client — files are parsed in the browser, then annotated/committed via
 * server actions.
 *
 * Handles: bank/credit/debit CSV exports (header auto-detection, single
 * amount column or debit/credit pair), PayPal activity CSVs, OFX/QFX files,
 * and pasted free-text lines (receipts, vendor invoices, statement text).
 */

export type StagedRow = {
  key: string
  occurredOn: string // YYYY-MM-DD
  description: string
  amountCents: number // positive = money out (an expense)
  /** true when the row is money IN (refund/payment/income) — excluded by default */
  credit: boolean
  sourceKind: SourceKind
}

export type SourceKind = "card" | "paypal" | "ofx" | "paste"

/* ---------------- shared helpers ---------------- */

export function normalizeVendorToken(description: string) {
  return description
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 2)
    .join(" ")
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

/** Accepts 2026-08-12, 8/12/2026, 08/12/26, 12-Aug, Aug 12 2026, 20260812… */
export function parseDate(raw: string, fallbackYear = new Date().getFullYear()): string | null {
  const s = raw.trim()
  if (!s) return null
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/.exec(s)
  if (m) {
    const year = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return `${year}-${pad(+m[1])}-${pad(+m[2])}`
  }
  m = /^(\d{1,2})[/.](\d{1,2})$/.exec(s)
  if (m) return `${fallbackYear}-${pad(+m[1])}-${pad(+m[2])}`
  m = /^(\d{4})(\d{2})(\d{2})/.exec(s)
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31)
    return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[- ]([A-Za-z]{3,})\.?,?(?:[- ](\d{2,4}))?$/.exec(s)
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : fallbackYear
    return `${year}-${pad(MONTHS[m[2].slice(0, 3).toLowerCase()])}-${pad(+m[1])}`
  }
  m = /^([A-Za-z]{3,})\.?,? (\d{1,2})(?:,? (\d{2,4}))?$/.exec(s)
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : fallbackYear
    return `${year}-${pad(MONTHS[m[1].slice(0, 3).toLowerCase()])}-${pad(+m[2])}`
  }
  return null
}

/** "$1,234.56", "(45.00)", "-45", "1.234,56" → cents (sign preserved). */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/[$€£\s]/g, "")
  if (!s) return null
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.startsWith("-")) {
    negative = true
    s = s.slice(1)
  }
  if (s.startsWith("+")) s = s.slice(1)
  if (/^\d{1,3}(\.\d{3})+(,\d{2})$/.test(s)) s = s.replace(/\./g, "").replace(",", ".")
  else s = s.replace(/,/g, "")
  if (!/^\d+(\.\d+)?$/.test(s)) return null
  const cents = Math.round(parseFloat(s) * 100)
  return negative ? -cents : cents
}

function rowKey(date: string, cents: number, description: string) {
  return `${date}|${cents}|${normalizeVendorToken(description)}`
}

/* ---------------- CSV ---------------- */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ""
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += c
    } else if (c === '"') inQuotes = true
    else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++
      row.push(field)
      field = ""
      if (row.some((f) => f.trim() !== "")) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some((f) => f.trim() !== "")) rows.push(row)
  return rows
}

type ColumnMap = {
  date: number
  description: number[]
  amount: number | null
  debit: number | null
  credit: number | null
}

function detectColumns(header: string[]): ColumnMap | null {
  const h = header.map((s) => s.trim().toLowerCase())
  const find = (patterns: RegExp[]) => {
    for (const p of patterns) {
      const i = h.findIndex((c) => p.test(c))
      if (i !== -1) return i
    }
    return -1
  }
  const date = find([/^(transaction )?date$/, /^posted?( date)?$/, /date/])
  if (date === -1) return null
  const amount = find([/^amount$/, /^gross$/, /amount/])
  const debit = find([/^(debit|withdrawal|money out|charge)s?( amount)?$/])
  const credit = find([/^(credit|deposit|money in|payment)s?( amount)?$/])
  if (amount === -1 && debit === -1) return null
  const description: number[] = []
  for (const p of [/^name$/, /descri/, /payee|merchant|memo|detail|reference/]) {
    const i = h.findIndex((c, idx) => p.test(c) && !description.includes(idx))
    if (i !== -1) description.push(i)
  }
  if (description.length === 0) {
    // fall back to the widest non-date, non-amount column later
    description.push(-1)
  }
  return {
    date,
    description,
    amount: amount === -1 ? null : amount,
    debit: debit === -1 ? null : debit,
    credit: credit === -1 ? null : credit,
  }
}

function isPaypalHeader(header: string[]): boolean {
  const h = header.map((s) => s.trim().toLowerCase())
  return h.includes("gross") && (h.includes("fee") || h.includes("type")) && h.some((c) => c.includes("date"))
}

/**
 * Parse a statement CSV. `chargesAreNegative` describes the file's sign
 * convention (auto-guessed by the caller via guessSign, user-flippable).
 */
export function parseStatementCsv(
  text: string,
  chargesAreNegative: boolean
): StagedRow[] {
  const rows = parseCsv(text)
  if (rows.length < 2) return []
  const header = rows[0]
  const paypal = isPaypalHeader(header)
  const cols = detectColumns(header)
  if (!cols) return []

  const h = header.map((s) => s.trim().toLowerCase())
  const typeCol = h.findIndex((c) => c === "type")
  const statusCol = h.findIndex((c) => c === "status")
  const out: StagedRow[] = []

  for (const row of rows.slice(1)) {
    const date = parseDate(row[cols.date] ?? "")
    if (!date) continue

    let cents: number | null = null
    if (cols.amount != null) cents = parseAmount(row[cols.amount] ?? "")
    if (cents == null && cols.debit != null) {
      const d = parseAmount(row[cols.debit] ?? "")
      const c = cols.credit != null ? parseAmount(row[cols.credit] ?? "") : null
      if (d != null && d !== 0) cents = Math.abs(d)
      else if (c != null && c !== 0) cents = -Math.abs(c)
    } else if (cents != null && cols.debit == null) {
      // single amount column: apply the file's sign convention
      cents = chargesAreNegative ? -cents : cents
    }
    if (cents == null || cents === 0) continue

    let description = cols.description
      .filter((i) => i >= 0)
      .map((i) => (row[i] ?? "").trim())
      .filter(Boolean)
      .join(" — ")
    if (!description) {
      description = row
        .filter((_, i) => i !== cols.date && i !== cols.amount)
        .map((f) => f.trim())
        .filter((f) => f && parseAmount(f) == null && !parseDate(f))
        .sort((a, b) => b.length - a.length)[0] ?? "Unknown"
    }
    if (paypal && typeCol !== -1 && row[typeCol]) description = `${description} (${row[typeCol].trim()})`
    if (paypal && statusCol !== -1 && row[statusCol] && !/^completed$/i.test(row[statusCol].trim())) continue

    out.push({
      key: rowKey(date, Math.abs(cents), description),
      occurredOn: date,
      description,
      amountCents: Math.abs(cents),
      credit: cents < 0,
      sourceKind: paypal ? "paypal" : "card",
    })
  }
  return dedupeBatch(out)
}

/** Guess the file's sign convention: most statements list charges as negatives. */
export function guessChargesAreNegative(text: string): boolean {
  const rows = parseCsv(text)
  if (rows.length < 2) return true
  const cols = detectColumns(rows[0])
  if (!cols || cols.amount == null || cols.debit != null) return false
  let neg = 0
  let pos = 0
  for (const row of rows.slice(1, 60)) {
    const cents = parseAmount(row[cols.amount] ?? "")
    if (cents == null || cents === 0) continue
    if (cents < 0) neg++
    else pos++
  }
  return neg >= pos
}

/* ---------------- OFX / QFX ---------------- */

export function parseOfx(text: string): StagedRow[] {
  const out: StagedRow[] = []
  const blocks = text.split(/<STMTTRN>/i).slice(1)
  for (const block of blocks) {
    const grab = (tag: string) => {
      const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block)
      return m ? m[1].trim() : ""
    }
    const date = parseDate(grab("DTPOSTED").slice(0, 8))
    const cents = parseAmount(grab("TRNAMT"))
    if (!date || cents == null || cents === 0) continue
    const description = [grab("NAME"), grab("MEMO")].filter(Boolean).join(" — ") || "Unknown"
    // OFX convention: money out is negative
    out.push({
      key: rowKey(date, Math.abs(cents), description),
      occurredOn: date,
      description,
      amountCents: Math.abs(cents),
      credit: cents > 0,
      sourceKind: "ofx",
    })
  }
  return dedupeBatch(out)
}

/* ---------------- pasted lines (receipts, vendor invoices) ---------------- */

/**
 * One expense per line: "8/12 Adobe $54.99", "Aug 3 — Railway 20.00",
 * "GoDaddy renewal 12/1/2026 149.17". A line needs a date and an amount;
 * everything else is the vendor/description.
 */
export function parsePaste(text: string): StagedRow[] {
  const out: StagedRow[] = []
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim().replace(/[–—·|]+/g, " ")
    if (!line) continue

    const amountMatches = Array.from(
      line.matchAll(/\(?-?\$\s?\d[\d,]*(?:\.\d{1,2})?\)?|\(?-?\d[\d,]*\.\d{2}\)?/g)
    )
    const amt = amountMatches[amountMatches.length - 1]
    if (!amt) continue
    const cents = parseAmount(amt[0].replace(/\$\s?/, ""))
    if (cents == null || cents === 0) continue

    let rest = (line.slice(0, amt.index) + " " + line.slice((amt.index ?? 0) + amt[0].length)).trim()
    let date: string | null = null
    const tokens = rest.split(/\s+/)
    for (let span = 3; span >= 1 && !date; span--) {
      for (let i = 0; i + span <= tokens.length; i++) {
        const candidate = tokens.slice(i, i + span).join(" ")
        const parsed = parseDate(candidate)
        if (parsed) {
          date = parsed
          tokens.splice(i, span)
          break
        }
      }
    }
    if (!date) continue
    const description = tokens.join(" ").replace(/\s+/g, " ").trim() || "Unknown"

    out.push({
      key: rowKey(date, Math.abs(cents), description),
      occurredOn: date,
      description,
      amountCents: Math.abs(cents),
      credit: cents < 0,
      sourceKind: "paste",
    })
  }
  return dedupeBatch(out)
}

/* ---------------- entry point ---------------- */

export function parseAnyStatement(filename: string, text: string): StagedRow[] {
  const lower = filename.toLowerCase()
  if (lower.endsWith(".ofx") || lower.endsWith(".qfx") || /<OFX>|<STMTTRN>/i.test(text.slice(0, 4000))) {
    return parseOfx(text)
  }
  if (lower.endsWith(".csv") || text.includes(",")) {
    const parsed = parseStatementCsv(text, guessChargesAreNegative(text))
    if (parsed.length > 0) return parsed
  }
  return parsePaste(text)
}

function dedupeBatch(rows: StagedRow[]): StagedRow[] {
  const seen = new Set<string>()
  const out: StagedRow[] = []
  for (const row of rows) {
    let key = row.key
    let n = 1
    while (seen.has(key)) key = `${row.key}#${++n}`
    seen.add(key)
    out.push({ ...row, key })
  }
  return out
}
