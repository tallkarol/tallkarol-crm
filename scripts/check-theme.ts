/**
 * Theme guard. Holds the vocabulary the sweep established.
 *
 * Pure: node:fs and node:path only, no database. Most scripts/check-*.ts open
 * a Postgres connection; this one runs on every build once Stage 8 wires
 * prebuild, and railway.json's buildCommand is `npm run build`, so a
 * connection here would be a connection on every deploy.
 *
 * app/globals.css is EXEMT from the literal-hex ratchet by construction — the
 * walk collects .ts/.tsx only. Its literals are token definitions and the
 * always-onyx .tk-payload highlighter block, both correct.
 *
 *   npm run check:theme          report
 *   npm run check:theme:update   re-baseline the ratchet (a speed bump, not a
 *                                lock — a number going up is visible in the diff)
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { SWEEP_ROOTS, SWEEP_EXT, isFrozen } from "./theme-scope"

const UPDATE = process.argv.includes("--update")
const BASELINE = "scripts/theme-baseline.json"

let failures = 0
let advisories = 0

function fail(msg: string) {
  failures++
  console.log(`  FAIL  ${msg}`)
}
function warn(msg: string) {
  advisories++
  console.log(`  warn  ${msg}`)
}

/** readdirSync walk: globSync is a Node 22 API and @types/node here is ^20. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue
      walk(p, out)
    } else if (SWEEP_EXT.test(name)) out.push(p)
  }
  return out
}

const files = SWEEP_ROOTS.flatMap((r) => (existsSync(r) ? walk(r) : [])).filter((f) => !isFrozen(f))

/* ------------------------------------------------------------------ rule 1 */
/* Dark-block parity. The two dark blocks in globals.css are duplicated on
   purpose — light-dark() only accepts <color> and these are bare triplets, and
   CSS cannot union a selector across a media boundary. This is the load-bearing
   half of that decision. They are compared to EACH OTHER, never to :root:
   the rail family and --chart-halo are theme-invariant and correctly live in
   :root alone. */
console.log("dark-block parity")
{
  const css = readFileSync("app/globals.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "")
  const grab = (re: RegExp) => {
    const m = css.match(re)
    if (!m) return null
    const decls = m[0].match(/--[a-z0-9-]+\s*:/g) || []
    return decls.map((d) => d.replace(/\s*:$/, "")).sort()
  }
  const a = grab(/@media \(prefers-color-scheme: dark\)[\s\S]*?\n {2}\}/)
  const b = grab(/:root\[data-theme="dark"\][\s\S]*?\n\}/)
  if (!a || !b) fail("could not locate both dark blocks in app/globals.css")
  else {
    const only = (x: string[], y: string[]) => x.filter((t) => !y.includes(t))
    const missB = only(a, b)
    const missA = only(b, a)
    if (missB.length) fail(`in the media block but not [data-theme="dark"]: ${missB.join(", ")}`)
    if (missA.length) fail(`in [data-theme="dark"] but not the media block: ${missA.join(", ")}`)
    if (!missA.length && !missB.length) console.log(`  ok    ${a.length} tokens, both blocks identical`)
  }
}

/* ------------------------------------------------------------------ rule 2 */
/* An alpha modifier on a locked token. --line and --line-strong ARE the two
   weights; a caller alpha adds a third. Tailwind 3.4's withAlphaValue() calls
   parseColor(), parseColor("var(--line)") returns null, and the candidate is
   DROPPED — no CSS and no build error. Because the failure is silent this rule
   is fatal from day one.
   rail-* and accent-* are excluded: different families, alpha-capable, and 23
   rail alpha sites across 5 files are correct today. */
const LOCKED_ALPHA =
  /(?<![\w-])(?:border|divide|ring|outline|bg|text|fill|stroke)-(?:line-strong|line|well|card|canvas|ink-2|ink-3|ink)\/(?:\[|\d)/g

console.log("alpha on a locked token")
{
  let hits = 0
  for (const f of files) {
    const src = readFileSync(f, "utf8")
    for (const line of src.split("\n")) {
      const m = line.match(LOCKED_ALPHA)
      if (m) {
        hits++
        fail(`${f}: ${m.join(" ")}  — the token already carries its alpha; use the other weight`)
      }
    }
  }
  if (!hits) console.log("  ok    no caller-side alphas on line/surface/ink tokens")
}

/* ------------------------------------------------------------------ rule 3 */
/* Literal hex ratchet. ADVISORY until Stage 8, because Stages 4-6 are what
   retire the population. A file may only go down. */
const LITERAL_HEX = /-\[#[0-9A-Fa-f]{3,8}\]/g

console.log("literal hex ratchet")
{
  const counts: Record<string, number> = {}
  for (const f of files) {
    const n = (readFileSync(f, "utf8").match(LITERAL_HEX) || []).length
    if (n) counts[f] = n
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (UPDATE) {
    writeFileSync(
      BASELINE,
      JSON.stringify(
        {
          note:
            "Per-file arbitrary-hex counts. A file may only go DOWN. --update re-baselines " +
            "and can launder a new violation: it is a speed bump, not a lock. A number going " +
            "up is visible in the diff — that is the enforcement.",
          total,
          counts,
        },
        null,
        2,
      ) + "\n",
    )
    console.log(`  ok    baseline written: ${total} hits across ${Object.keys(counts).length} files`)
  } else if (!existsSync(BASELINE)) {
    warn(`no ${BASELINE} yet — run npm run check:theme:update`)
  } else {
    const base = JSON.parse(readFileSync(BASELINE, "utf8")) as { total: number; counts: Record<string, number> }
    let regressed = 0
    for (const [f, n] of Object.entries(counts)) {
      const was = base.counts[f] ?? 0
      if (n > was) {
        regressed++
        warn(`${f}: ${was} -> ${n} literal hexes`)
      }
    }
    if (!regressed) console.log(`  ok    ${total} hits, none above baseline (was ${base.total})`)
  }
}

/* ------------------------------------------------------------------ rule 4 */
/* Families deliberately left unmapped in tailwind.config.ts, because a blanket
   map turns a pale rim into a heavy stroke in LIGHT (amber-300 #FCD34D goes
   1.44 -> 5.92). Each is a per-site decision. ADVISORY until Stage 8. */
const UNMAPPED_FAMILY = /(?<![\w-])(?:border|ring|bg|text)-(?:amber-(?:300|400|500)|red-400|black)(?![\w-])/g

console.log("deliberately-unmapped families")
{
  let hits = 0
  for (const f of files) {
    const m = readFileSync(f, "utf8").match(UNMAPPED_FAMILY)
    if (m) {
      hits += m.length
      warn(`${f}: ${Array.from(new Set(m)).join(" ")}`)
    }
  }
  if (!hits) console.log("  ok    none")
}

console.log("")
if (advisories) console.log(`${advisories} advisory finding(s) — not fatal yet; prebuild wires in at Stage 8`)
if (failures) {
  console.log(`${failures} check(s) FAILED`)
  process.exit(1)
}
console.log("all fatal checks passed")
