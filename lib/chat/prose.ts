/**
 * The light markdown a reply is written in, parsed to a small tree.
 *
 * PURE: no DOM, no HTML. components/chat/Prose.tsx builds every node from
 * this tree, so a reply cannot inject markup — and the check script can
 * hold the parser to the constructs the models actually emit. Against the
 * first 68 replies in production: pipe tables, blockquotes, italics, a
 * heading followed by its paragraph in the same block, nested bullets and
 * bare CRM paths all printed raw. This handles those and nothing exotic.
 *
 * Links are the one place text becomes something clickable, so they are
 * narrow on purpose: `https://` URLs, and paths into the CRM whose first
 * segment is one this file knows. `javascript:`, `data:` and `http://` stay
 * text. Images are not parsed — an assistant-side picture is a separate
 * piece of work with its own rules.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "italic"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "link"; href: string; external: boolean; children: Inline[] }

export type ListItem = {
  children: Inline[]
  /** `- [ ]` / `- [x]`; null for an ordinary item. */
  checked: boolean | null
  /** A list indented under this item. */
  sub: List | null
}

export type List = { kind: "list"; ordered: boolean; start: number; items: ListItem[] }

export type Block =
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | List
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "quote"; children: Block[] }
  | { kind: "code"; language: string; text: string }
  | { kind: "rule" }

/** First path segments a bare `/…` may link to. Everything else stays text. */
export const LINKABLE_ROOTS = [
  "chat",
  "tasks",
  "support",
  "inbox",
  "timesheet",
  "clients",
  "projects",
  "products",
  "punchlists",
  "doc",
  "meeting-notes",
  "insights",
  "invoices",
  "proposals",
  "reports",
  "worksheets",
  "calendar",
  "leads",
  "inquiries",
  "notebooks",
  "slinks",
  "retainers",
  "contracts",
  "inspiration",
  "activity",
  "usage",
  "hivemind",
  "delivery",
  "revenue",
  "expenses",
  "uptime",
  "vault",
  "pipeline",
  "settings",
] as const

const ROOTS = new Set<string>(LINKABLE_ROOTS)

const FENCE = /^\s*```\s*([A-Za-z0-9_+-]*)\s*$/
const HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE = /^\s{0,3}>\s?(.*)$/
const BULLET = /^(\s*)([-*•+]|\d+[.)])\s+(.*)$/
const TASK = /^\[([ xX])\]\s+(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

/* ---------- blocks ---------- */

export function parseProse(text: string): Block[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  return parseLines(lines)
}

function isTableStart(lines: string[], i: number): boolean {
  return lines[i].includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")
}

function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i]
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    isTableStart(lines, i)
  )
}

function parseLines(lines: string[]): Block[] {
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const language = fence[1] ?? ""
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) {
        body.push(lines[i])
        i++
      }
      i++ // the closing fence, or past the end
      blocks.push({ kind: "code", language, text: body.join("\n") })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline(heading[2]),
      })
      i++
      continue
    }

    if (RULE.test(line)) {
      blocks.push({ kind: "rule" })
      i++
      continue
    }

    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(QUOTE.exec(lines[i])![1])
        i++
      }
      blocks.push({ kind: "quote", children: parseLines(inner) })
      continue
    }

    if (isTableStart(lines, i)) {
      const header = splitRow(lines[i])
      i += 2
      const rows: Inline[][][] = []
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]).map(parseInline))
        i++
      }
      blocks.push({ kind: "table", header: header.map(parseInline), rows })
      continue
    }

    if (BULLET.test(line)) {
      const taken: string[] = []
      while (i < lines.length && lines[i].trim() && (BULLET.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) {
        taken.push(lines[i])
        i++
      }
      blocks.push(parseList(taken))
      continue
    }

    // A paragraph: this line and the ones after it until a blank or a block start.
    const para: string[] = [line]
    i++
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) {
      para.push(lines[i])
      i++
    }
    blocks.push({ kind: "paragraph", children: parseInline(para.join("\n")) })
  }
  return blocks
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  // `\|` inside a cell is a literal pipe.
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.replace(/\\\|/g, "|").trim())
}

/**
 * Bullets nest by indent: an item indented deeper than the one before it
 * becomes that item's sub-list. A line that is indented but has no bullet
 * continues the previous item.
 */
function parseList(lines: string[]): List {
  type Frame = { indent: number; list: List }
  const root: List = { kind: "list", ordered: false, start: 1, items: [] }
  const stack: Frame[] = []
  let first = true

  for (const raw of lines) {
    const m = BULLET.exec(raw)
    if (!m) {
      // Continuation text for the deepest open item.
      const frame = stack[stack.length - 1]
      const last = frame?.list.items[frame.list.items.length - 1]
      if (last) last.children = last.children.concat({ kind: "text", text: "\n" }, parseInline(raw.trim()))
      continue
    }
    const indent = m[1].replace(/\t/g, "  ").length
    const marker = m[2]
    const ordered = /^\d/.test(marker)
    const body = m[3]

    if (first) {
      root.ordered = ordered
      root.start = ordered ? Number.parseInt(marker, 10) || 1 : 1
      stack.push({ indent, list: root })
      first = false
    }

    // Close frames deeper than this line; open one when it is deeper than the top.
    while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop()
    let top = stack[stack.length - 1]
    if (indent > top.indent + 1) {
      const parent = top.list.items[top.list.items.length - 1]
      if (parent) {
        const sub: List = { kind: "list", ordered, start: ordered ? Number.parseInt(marker, 10) || 1 : 1, items: [] }
        parent.sub = sub
        stack.push({ indent, list: sub })
        top = stack[stack.length - 1]
      }
    }

    const task = TASK.exec(body)
    top.list.items.push({
      children: parseInline(task ? task[2] : body),
      checked: task ? task[1] !== " " : null,
      sub: null,
    })
  }
  return root
}

/* ---------- inline ---------- */

const INLINE =
  /(`[^`\n]+`)|(\[[^\]\n]+\]\((?:https:\/\/|\/)[^)\s]+\))|(https:\/\/[^\s<>()]*[^\s<>().,;:!?'"])|(\*\*[^*\n]+?\*\*)|(\*(?!\s)[^*\n]+?(?<!\s)\*)|((?<![A-Za-z0-9])_(?!\s)[^_\n]+?(?<!\s)_(?![A-Za-z0-9]))/g

const BARE_PATH = /(^|[\s(])(\/[a-z][a-z0-9-]*(?:\/[^\s)<>]*|\?[^\s)<>]*)?)/g

export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of Array.from(text.matchAll(INLINE))) {
    const at = m.index ?? 0
    if (at > last) out.push(...plainWithPaths(text.slice(last, at)))
    const [whole, code, link, url, bold, star, under] = m
    if (code) {
      out.push({ kind: "code", text: code.slice(1, -1) })
    } else if (link) {
      const close = link.indexOf("](")
      const label = link.slice(1, close)
      const href = link.slice(close + 2, -1)
      out.push(linkNode(href, parseInline(label)) ?? { kind: "text", text: whole })
    } else if (url) {
      out.push(linkNode(url, [{ kind: "text", text: url }]) ?? { kind: "text", text: url })
    } else if (bold) {
      out.push({ kind: "bold", children: parseInline(bold.slice(2, -2)) })
    } else if (star || under) {
      const inner = (star ?? under)!.slice(1, -1)
      out.push({ kind: "italic", children: parseInline(inner) })
    }
    last = at + whole.length
  }
  if (last < text.length) out.push(...plainWithPaths(text.slice(last)))
  return out
}

/** Plain text, with bare CRM paths (`/tasks/…`) turned into links. */
function plainWithPaths(text: string): Inline[] {
  const out: Inline[] = []
  let last = 0
  for (const m of Array.from(text.matchAll(BARE_PATH))) {
    const at = (m.index ?? 0) + m[1].length
    const path = trimTrail(m[2])
    const link = linkNode(path, [{ kind: "text", text: path }])
    if (!link) continue
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) })
    out.push(link)
    last = at + path.length
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) })
  return out
}

/** A path at the end of a sentence carries the sentence's full stop; give it back. */
function trimTrail(path: string): string {
  return path.replace(/[.,;:!?'"]+$/, "")
}

/**
 * The only door from text to an href. `https://` anywhere; a path only when
 * its first segment is a CRM route. Anything else — `javascript:`, `data:`,
 * `http://`, an unknown path — is returned as null and rendered as text.
 */
export function linkNode(href: string, children: Inline[]): Inline | null {
  if (/^https:\/\/[^\s]+$/i.test(href)) return { kind: "link", href, external: true, children }
  const path = /^\/([a-z][a-z0-9-]*)(?:[/?#]|$)/.exec(href)
  if (path && ROOTS.has(path[1])) return { kind: "link", href, external: false, children }
  return null
}

/** The tree flattened back to text — what a Copy button lifts, what a check can compare. */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => (n.kind === "text" || n.kind === "code" ? n.text : inlineText(n.children)))
    .join("")
}
