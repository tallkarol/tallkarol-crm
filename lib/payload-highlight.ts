/**
 * A deliberately small highlighter for ticket payloads.
 *
 * Not a parser — one escaped pass per block with an alternation regex, so a
 * token can never be highlighted twice and no untrusted text escapes. Enough
 * to make an error JSON or a stack trace readable at a glance; nothing more.
 */

type Rule = { re: string; cls: string }

const STRING = `"(?:[^"\\\\\\n]|\\\\.)*"`
const SQ_STRING = `'(?:[^'\\\\\\n]|\\\\.)*'`

const RULES: Record<string, Rule[]> = {
  json: [
    { re: `${STRING}(?=\\s*:)`, cls: "key" },
    { re: STRING, cls: "str" },
    { re: `\\b(?:true|false|null)\\b`, cls: "lit" },
    { re: `-?\\b\\d+(?:\\.\\d+)?(?:e[+-]?\\d+)?\\b`, cls: "num" },
  ],
  log: [
    { re: `^\\[[^\\]\\n]*\\]`, cls: "dim" },
    { re: `^\\d{4}-\\d{2}-\\d{2}[T ][\\d:.]+Z?`, cls: "dim" },
    {
      re: `\\b(?:ERROR|FATAL|Fatal error|CRITICAL|WARN|WARNING|Warning|Uncaught|Exception|Traceback|failed|denied)\\b`,
      cls: "err",
    },
    { re: `\\b[45]\\d{2}\\b`, cls: "err" },
    { re: `\\b(?:INFO|DEBUG|TRACE|NOTICE|GET|POST|PUT|PATCH|DELETE)\\b`, cls: "key" },
    { re: `\\b[23]\\d{2}\\b`, cls: "lit" },
    { re: STRING, cls: "str" },
    { re: SQ_STRING, cls: "str" },
  ],
  sql: [
    { re: `--[^\\n]*`, cls: "dim" },
    { re: SQ_STRING, cls: "str" },
    {
      re: `\\b(?:SELECT|FROM|WHERE|AND|OR|NOT|NULL|ORDER\\s+BY|GROUP\\s+BY|HAVING|LIMIT|OFFSET|JOIN|LEFT|INNER|ON|AS|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|UNIQUE|INDEX|TABLE|CONCURRENTLY|IF\\s+NOT\\s+EXISTS|COUNT|SUM|CASE|WHEN|THEN|END)\\b`,
      cls: "lit",
    },
    { re: `\\b\\d+(?:\\.\\d+)?\\b`, cls: "num" },
  ],
  diff: [
    { re: `^@@[^\\n]*`, cls: "dim" },
    { re: `^\\+[^\\n]*`, cls: "add" },
    { re: `^-[^\\n]*`, cls: "err" },
  ],
  csv: [{ re: `^[^\\n]+`, cls: "key" }],
  yaml: [
    { re: `#[^\\n]*`, cls: "dim" },
    { re: `^\\s*[\\w.-]+(?=:)`, cls: "key" },
    { re: STRING, cls: "str" },
    { re: SQ_STRING, cls: "str" },
  ],
  html: [
    { re: `&lt;!--[\\s\\S]*?--&gt;`, cls: "dim" },
    { re: `&lt;/?[\\w-]+`, cls: "key" },
    { re: STRING, cls: "str" },
  ],
  liquid: [
    { re: `\\{%[\\s\\S]*?%\\}`, cls: "lit" },
    { re: `\\{\\{[\\s\\S]*?\\}\\}`, cls: "key" },
    { re: STRING, cls: "str" },
    { re: SQ_STRING, cls: "str" },
  ],
}

const CODE_RULES: Rule[] = [
  { re: `//[^\\n]*`, cls: "dim" },
  { re: `#[^\\n]*`, cls: "dim" },
  { re: `/\\*[\\s\\S]*?\\*/`, cls: "dim" },
  { re: STRING, cls: "str" },
  { re: SQ_STRING, cls: "str" },
  { re: "`(?:[^`\\\\]|\\\\.)*`", cls: "str" },
  {
    re: `\\b(?:const|let|var|function|return|await|async|export|import|from|if|else|for|while|new|class|extends|try|catch|throw|typeof|interface|type|public|private|foreach|echo|use|null|undefined|true|false|this|\\$this)\\b`,
    cls: "lit",
  },
  { re: `\\b\\d+(?:\\.\\d+)?\\b`, cls: "num" },
]

const cache = new Map<string, RegExp>()

function compiled(lang: string) {
  const cached = cache.get(lang)
  if (cached) return cached
  const rules = RULES[lang] ?? CODE_RULES
  const re = new RegExp(rules.map((r) => `(${r.re})`).join("|"), "gm")
  cache.set(lang, re)
  return re
}

function classes(lang: string) {
  return (RULES[lang] ?? CODE_RULES).map((r) => r.cls)
}

export function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

/** Escaped, span-wrapped HTML for one payload body. Safe to inject. */
export function highlightPayload(body: string, lang: string) {
  const escaped = escapeHtml(body)
  const re = compiled(lang)
  const cls = classes(lang)
  re.lastIndex = 0
  return escaped.replace(re, (match, ...groups) => {
    const idx = groups.slice(0, cls.length).findIndex((g) => g !== undefined)
    if (idx === -1) return match
    return `<span class="tk-${cls[idx]}">${match}</span>`
  })
}
