/**
 * Wrap a "use server" file's exported actions in tracked(), one file at a
 * time, so each change is reviewable on its own:
 *
 *   export async function setStatus(id: string) { … }
 *     →
 *   export const setStatus = tracked("peek.setStatus", async function setStatus(id: string) { … })
 *
 * The name keeps its function name for stack traces and recursion. The
 * namespace is the file: lib/peek-actions.ts → peek, app/(admin)/delivery/actions.ts
 * → delivery. Overloaded and default exports are skipped and named. A file
 * that is not "use server" is refused. AST-based: a regex cannot find a
 * function's closing brace.
 *
 *   npx tsx scripts/activity-wrap-actions.ts lib/peek-actions.ts [more files…]
 *   npm run activity:scan     # then refresh the catalog's wrapped count
 */
import { readFileSync, writeFileSync } from "node:fs"
import { basename, dirname } from "node:path"
import ts from "typescript"

function namespaceFor(file: string): string {
  const base = basename(file).replace(/\.(ts|tsx)$/, "")
  const raw = base === "actions" ? basename(dirname(file)).replace(/[()]/g, "") : base.replace(/-?actions$/, "")
  return raw.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
}

let failures = 0

for (const file of process.argv.slice(2)) {
  const src = readFileSync(file, "utf8")
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const first = sf.statements[0]
  const isServer = first && ts.isExpressionStatement(first) && ts.isStringLiteral(first.expression) && first.expression.text === "use server"
  if (!isServer) {
    console.log(`✗ ${file}: not a "use server" file — left alone`)
    failures += 1
    continue
  }

  const ns = namespaceFor(file)
  const declarations = new Map<string, number>()
  sf.statements.forEach((st) => {
    if (ts.isFunctionDeclaration(st) && st.name) declarations.set(st.name.text, (declarations.get(st.name.text) ?? 0) + 1)
  })

  const edits: { at: number; end: number; text: string }[] = []
  const wrapped: string[] = []
  const skipped: string[] = []
  sf.statements.forEach((st) => {
    if (!ts.isFunctionDeclaration(st) || !st.name || !st.body) return
    const mods = ts.getModifiers(st) ?? []
    const has = (kind: ts.SyntaxKind) => mods.some((m) => m.kind === kind)
    if (!has(ts.SyntaxKind.ExportKeyword) || !has(ts.SyntaxKind.AsyncKeyword)) return
    const name = st.name.text
    if (has(ts.SyntaxKind.DefaultKeyword) || (declarations.get(name) ?? 0) > 1) {
      skipped.push(name)
      return
    }
    const start = st.getStart(sf)
    const header = src.slice(start, st.name.getEnd())
    if (!/^export\s+async\s+function\s+\w+$/.test(header)) {
      skipped.push(name)
      return
    }
    edits.push({ at: start, end: st.name.getEnd(), text: `export const ${name} = tracked("${ns}.${name}", async function ${name}` })
    edits.push({ at: st.getEnd(), end: st.getEnd(), text: ")" })
    wrapped.push(name)
  })

  if (!wrapped.length) {
    console.log(`· ${file}: nothing to wrap${skipped.length ? ` (skipped ${skipped.join(", ")})` : ""}`)
    continue
  }

  if (!src.includes('from "@/lib/activity/tracked"')) {
    const imports = sf.statements.filter(ts.isImportDeclaration)
    const after = imports.length ? imports[imports.length - 1].getEnd() : first.getEnd()
    edits.push({ at: after, end: after, text: `\nimport { tracked } from "@/lib/activity/tracked"` })
  }

  let out = src
  edits
    .sort((a, b) => b.at - a.at)
    .forEach((e) => {
      out = out.slice(0, e.at) + e.text + out.slice(e.end)
    })
  writeFileSync(file, out)
  console.log(`✓ ${file}: ${wrapped.length} wrapped as ${ns}.*${skipped.length ? ` · skipped ${skipped.join(", ")}` : ""}`)
}

if (failures) process.exit(1)
