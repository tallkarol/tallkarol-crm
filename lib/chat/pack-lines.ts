/**
 * A line a desk may land in its pack.
 *
 * PURE — no db, no fs. The CRM imports it to build the approval card's
 * preview; the worker on the Mac imports the same functions to write the
 * file, so what the card shows is exactly what lands (the stance every
 * mutating tool takes, see tools.ts). The packs live on the Mac, which is
 * why the write itself never happens in the CRM.
 *
 * Targets are the rows the persona contracts already name: the client
 * manager proposes PROMISES / PRIORITIES / PEOPLE / HISTORY / OPEN rows in
 * `relationship.md`, the product owner a `decisions.md` entry, the coach a
 * journal line in `me`. Nothing else is reachable — not `claims.md`, not
 * `personas/**`, not a slot's prose. A pack's facts still grow only through
 * the pack's own gate.
 */

export const PACK_LINE_TARGETS = [
  "promise",
  "priority",
  "person",
  "history",
  "open",
  "decision",
  "journal",
] as const

export type PackLineTarget = (typeof PACK_LINE_TARGETS)[number]

export type PackKind = "client" | "product" | "me"

export function packKindOf(ref: string): PackKind | null {
  if (ref === "me") return "me"
  if (ref.startsWith("clients/")) return "client"
  if (ref.startsWith("products/")) return "product"
  return null
}

/** Which desk may land which target, and on which kind of pack. */
const ALLOWED: Record<string, { kind: PackKind; targets: readonly PackLineTarget[] }> = {
  coach: { kind: "me", targets: ["journal"] },
  "client-manager": {
    kind: "client",
    targets: ["promise", "priority", "person", "history", "open"],
  },
  "product-owner": { kind: "product", targets: ["decision"] },
}

export function allowed(persona: string, packRef: string, target: PackLineTarget): boolean {
  const rule = ALLOWED[persona]
  if (!rule) return false
  if (packKindOf(packRef) !== rule.kind) return false
  return rule.targets.includes(target)
}

/** The cells each target takes, for the tool schema and the preview. */
export const CELLS: Record<PackLineTarget, { required: readonly string[]; optional: readonly string[] }> = {
  promise: { required: ["promise"], optional: ["due"] },
  priority: { required: ["priority"], optional: [] },
  person: { required: ["name", "role"], optional: ["how"] },
  history: { required: ["line"], optional: [] },
  open: { required: ["line"], optional: [] },
  decision: { required: ["decision", "why"], optional: ["rulesOut"] },
  journal: { required: ["line"], optional: [] },
}

export type RenderedLine = {
  /** Pack-relative: `relationship.md`, `decisions.md`, `journal/2026-09-10.md`. */
  file: string
  /** The `## HEADING` the row belongs under; null for a file that is one table. */
  section: string | null
  shape: "table" | "list" | "journal"
  markdown: string
}

export type LineMeta = {
  /** YYYY-MM-DD in Karol's zone. */
  date: string
  /** Where the line came from — `chat:17bf15c4`. */
  source: string
  /** `<!-- crm:<call id> -->` — the idempotency mark; a file that has it is left alone. */
  marker: string
}

/** One line, no pipes, bounded — a cell cannot break the table it lands in. */
function cell(value: unknown, max = 500): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\|/g, "\\|")
    .trim()
    .slice(0, max)
}

export function marker(callId: string): string {
  return `<!-- crm:${callId} -->`
}

export function renderLine(
  target: PackLineTarget,
  cells: Record<string, unknown>,
  meta: LineMeta
): RenderedLine {
  const c = (key: string, max?: number) => cell(cells[key], max)
  const missing = CELLS[target].required.filter((key) => !c(key))
  if (missing.length) throw new Error(`${target} needs ${missing.join(", ")}.`)

  switch (target) {
    case "promise":
      return {
        file: "relationship.md",
        section: "PROMISES",
        shape: "table",
        markdown: `| ${meta.date} | ${c("promise")} | ${c("due") || "—"} | open | ${meta.source} ${meta.marker} |`,
      }
    case "priority":
      return {
        file: "relationship.md",
        section: "PRIORITIES",
        shape: "table",
        markdown: `| ${meta.date} | ${c("priority")} | ${meta.source} ${meta.marker} |`,
      }
    case "person":
      return {
        file: "relationship.md",
        section: "PEOPLE",
        shape: "table",
        markdown: `| ${c("name")} | ${c("role")} | ${c("how") || "—"} ${meta.marker} |`,
      }
    case "history":
    case "open":
      return {
        file: "relationship.md",
        section: target === "history" ? "HISTORY" : "OPEN",
        shape: "list",
        markdown: `- ${meta.date} — ${c("line")} ${meta.marker}`,
      }
    case "decision":
      return {
        file: "decisions.md",
        section: null,
        shape: "table",
        markdown: `| ${meta.date} | ${c("decision")} | ${c("why")} | ${c("rulesOut") || "—"} | ${meta.source} ${meta.marker} |`,
      }
    case "journal":
      return {
        file: `journal/${meta.date}.md`,
        section: null,
        shape: "journal",
        markdown: `- ${c("line", 2000)} ${meta.marker}`,
      }
  }
}

/** What the card calls it. */
export function describeTarget(target: PackLineTarget): string {
  switch (target) {
    case "promise":
      return "PROMISES row"
    case "priority":
      return "PRIORITIES row"
    case "person":
      return "PEOPLE row"
    case "history":
      return "HISTORY line"
    case "open":
      return "OPEN line"
    case "decision":
      return "decision"
    case "journal":
      return "journal line"
  }
}

const TABLE_ROW = /^\s*\|/
const TABLE_SEP = /^\s*\|\s*:?-{2,}/
const HEADING = /^##\s+/

function isPlaceholderRow(line: string): boolean {
  // `| | | |` — the template's empty row; cells are blank once the pipes go.
  return TABLE_ROW.test(line) && line.replace(/\|/g, "").trim() === ""
}

function isPlaceholderItem(line: string): boolean {
  // `- YYYY-MM-DD —` with nothing after the dash.
  return /^-\s+YYYY-MM-DD\s+—\s*$/.test(line.trim())
}

/**
 * The line in the file, or the file unchanged when the marker is already
 * there. Table rows go after the last real row of the section's table (the
 * template's blank row is dropped); a decision goes newest-first, right
 * under the separator; list lines go at the end of their section; a journal
 * file is created on its first line. A section the file does not have is an
 * error, never a guess — a hand-edited heading fails visibly on the card.
 */
export function insertLine(
  text: string,
  line: RenderedLine,
  mark: string
): { text: string; changed: boolean } {
  if (text.includes(mark)) return { text, changed: false }

  if (line.shape === "journal") {
    const date = line.file.replace(/^journal\//, "").replace(/\.md$/, "")
    if (!text.trim()) return { text: `# ${date}\n\n${line.markdown}\n`, changed: true }
    const body = text.endsWith("\n") ? text : `${text}\n`
    return { text: `${body}${line.markdown}\n`, changed: true }
  }

  const lines = text.split("\n")

  // Where the section starts, or 0 for a one-table file.
  let start = 0
  if (line.section) {
    start = lines.findIndex((l) => HEADING.test(l) && l.replace(HEADING, "").trim() === line.section)
    if (start < 0) throw new Error(`${line.file} has no "## ${line.section}" section.`)
    start += 1
  }
  // Where it ends: the next heading, or the end of the file.
  let end = lines.length
  for (let i = start; i < lines.length; i++) {
    if (HEADING.test(lines[i])) {
      end = i
      break
    }
  }

  if (line.shape === "table") {
    let head = -1
    for (let i = start; i < end; i++) {
      if (TABLE_ROW.test(lines[i]) && i + 1 < end && TABLE_SEP.test(lines[i + 1])) {
        head = i
        break
      }
    }
    if (head < 0) {
      throw new Error(
        `${line.file} has no table under ${line.section ? `"## ${line.section}"` : "its heading"}.`
      )
    }
    let last = head + 1
    while (last + 1 < end && TABLE_ROW.test(lines[last + 1])) last += 1
    const rows = lines.slice(head + 2, last + 1).filter((l) => !isPlaceholderRow(l))
    const ordered = line.section === null ? [line.markdown, ...rows] : [...rows, line.markdown]
    const out = [...lines.slice(0, head + 2), ...ordered, ...lines.slice(last + 1)]
    return { text: out.join("\n"), changed: true }
  }

  // A list section: keep everything, drop the template placeholder, append
  // after the last non-blank line so the blank before the next heading stays.
  const body = lines.slice(start, end).filter((l) => !isPlaceholderItem(l))
  let lastText = body.length - 1
  while (lastText >= 0 && body[lastText].trim() === "") lastText -= 1
  const next = [...body.slice(0, lastText + 1), line.markdown]
  // A section that was only prose keeps one blank line between prose and the list.
  if (lastText >= 0 && !body[lastText].trim().startsWith("-")) {
    next.splice(lastText + 1, 0, "")
  }
  // Exactly one blank line before the next heading; a trailing newline at the end of the file.
  next.push("")
  const out = [...lines.slice(0, start), ...next, ...lines.slice(end)]
  return { text: out.join("\n"), changed: true }
}
