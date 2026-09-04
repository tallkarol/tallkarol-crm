/**
 * Routes inline card shells through components/ui/Card.
 *
 *   npx tsx scripts/card-codemod.ts          dry run
 *   npx tsx scripts/card-codemod.ts --write  apply
 *
 * AST, not regex. The hard part of this rewrite is the CLOSING tag: turning
 * `<div className="…shell…">` into `<Card …>` means finding the `</div>` that
 * matches it, and a regex cannot count nesting. The TypeScript parser already
 * knows, so it does the matching and this only computes text edits, applied
 * back-to-front so earlier offsets stay valid.
 *
 * Only plain string-literal classNames are touched. A shell assembled inside
 * cn() with conditionals is a judgement call about which branch is the surface,
 * and those are left alone rather than guessed at.
 *
 * FORM CONTROLS ARE NOT CARDS. input/select/textarea share the shell's visual
 * shape by coincidence — 68 of them — and wrapping an interactive control in a
 * passive presentational component risks ref, controlled-value and native-prop
 * regressions across every form in the app for no benefit. Their one real
 * defect was focus, and that is fixed globally in app/globals.css by a single
 * :focus-visible rule that also covers every button, link and summary, which no
 * component primitive would have reached.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import { isFrozen } from "./theme-scope"

const WRITE = process.argv.includes("--write")

/** Passive containers only. Link/button would need `as` plus prop threading. */
const HOSTS = new Set(["div", "section", "article"])

const RADIUS = ["rounded-2xl", "rounded-xl", "rounded-lg"] as const
const INTERACTIVE_BITS = [
  "hover:-translate-y-0.5",
  "hover:-translate-y-px",
  "hover:border-line-strong",
  "hover:shadow-hover",
  "motion-reduce:transition-none",
  "motion-reduce:hover:translate-y-0",
]

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name.startsWith(".next")) continue
      walk(p, out)
    } else if (name.endsWith(".tsx")) out.push(p)
  }
  return out
}

type Edit = { start: number; end: number; text: string }

/**
 * `Card` is already taken in 20-odd files — components/insights/Card is imported
 * under that name, and a few pages declare a local one. Aliasing beats renaming
 * theirs: the insights Card is a titled panel with its own API, a different
 * thing that happens to share a noun.
 */
function bindsCard(src: string) {
  return (
    /\bimport\s*\{[^}]*\bCard\b[^}]*\}\s*from\s*"(?!@\/components\/ui\/Card)/.test(src) ||
    /^\s*(?:export\s+)?(?:function|const|class)\s+Card\b/m.test(src)
  )
}

function planFile(rel: string, src: string) {
  const NAME = bindsCard(src) ? "TkCard" : "Card"
  const sf = ts.createSourceFile(rel, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const edits: Edit[] = []
  let converted = 0

  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node)) {
      const open = node.openingElement
      const tag = open.tagName.getText(sf)
      if (HOSTS.has(tag)) {
        const attr = open.attributes.properties.find(
          (p): p is ts.JsxAttribute =>
            ts.isJsxAttribute(p) && p.name.getText(sf) === "className",
        )
        const init = attr?.initializer
        if (attr && init && ts.isStringLiteral(init)) {
          const classes = init.text.split(/\s+/).filter(Boolean)
          const hasBorder = classes.includes("border") && classes.includes("border-line")
          const surface = classes.includes("bg-card") ? "card" : classes.includes("bg-well") ? "well" : null
          const radius = RADIUS.find((r) => classes.includes(r))
          if (hasBorder && surface && radius) {
            const elevation = classes.includes("shadow-card") ? "card" : "none"
            const interactive = INTERACTIVE_BITS.some((b) => classes.includes(b))
            const drop = new Set<string>([
              "border",
              "border-line",
              `bg-${surface}`,
              radius,
              "shadow-card",
              ...INTERACTIVE_BITS,
            ])
            const keep = classes.filter(
              (c) => !drop.has(c) && !(interactive && c.startsWith("transition-[")),
            )

            const props: string[] = []
            if (surface !== "card") props.push(`surface="${surface}"`)
            if (radius !== "rounded-2xl") props.push(`radius="${radius.replace("rounded-", "")}"`)
            if (elevation !== "card") props.push(`elevation="${elevation}"`)
            if (interactive) props.push("interactive")
            if (keep.length) props.push(`className="${keep.join(" ")}"`)

            // other attributes on the element survive verbatim
            const others = open.attributes.properties
              .filter((p) => p !== attr)
              .map((p) => p.getText(sf))
            const all = [...props, ...others].join(" ")

            edits.push({
              start: open.getStart(sf),
              end: open.getEnd(),
              text: `<${NAME}${all ? " " + all : ""}>`,
            })
            edits.push({
              start: node.closingElement.getStart(sf),
              end: node.closingElement.getEnd(),
              text: `</${NAME}>`,
            })
            converted++
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return { edits, converted, name: NAME }
}

const files = ["app", "components"]
  .flatMap((r) => walk(r))
  .filter((f) => !isFrozen(f) && !f.startsWith("components/ui/"))

let total = 0
const touched: [string, number][] = []

for (const rel of files) {
  const src = readFileSync(rel, "utf8")
  const { edits, converted, name } = planFile(rel, src)
  if (!converted) continue
  let out = src
  for (const e of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.text + out.slice(e.end)
  }
  if (!/from "@\/components\/ui\/Card"/.test(out)) {
    const imp =
      name === "Card"
        ? 'import { Card } from "@/components/ui/Card"'
        : 'import { Card as TkCard } from "@/components/ui/Card"'
    const lines = out.split("\n")
    const idx = lines.reduce((acc, l, i) => (/^import .*from ".*"$/.test(l) && i < 60 ? i : acc), -1)
    if (idx >= 0) lines.splice(idx + 1, 0, imp)
    else lines.splice(0, 0, imp)
    out = lines.join("\n")
  }
  total += converted
  touched.push([rel, converted])
  if (WRITE) writeFileSync(rel, out)
}

console.log(`${total} shells routed through <Card> across ${touched.length} files`)
for (const [f, n] of touched.sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`  x${n}  ${f}`)
if (touched.length > 20) console.log(`  … and ${touched.length - 20} more files`)
console.log(WRITE ? "\nWRITTEN." : "\nDRY RUN — nothing written.")
