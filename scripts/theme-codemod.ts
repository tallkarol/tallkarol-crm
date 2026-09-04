/**
 * Stage 4 — the sweep. 754 line utilities, 1,135 ink alphas, 190 shadows,
 * 8 scrims, 20 cream surfaces and the semantic-tone hexes, onto the token
 * vocabulary Stage 1 defined and Stage 2 locked.
 *
 *   npx tsx scripts/theme-codemod.ts          dry run, prints per-file rule hits
 *   npx tsx scripts/theme-codemod.ts --write  apply; re-run after, must be 0
 *
 * A codemod and not sed, for five reasons that are all load-bearing here:
 *   1. Order is a readable `stage` number. text-tk-slate/70 must run before
 *      bare text-tk-slate; get it wrong and you emit text-ink-2/70, which
 *      Tailwind compiles to nothing.
 *   2. Skip lists are data. 34 frozen sites plus the pinned substrings; sed
 *      cannot express "sweep line 29 of PayloadBlock but never line 30".
 *   3. Role-dependent rules are not regexes — the 54 bg-tk-slate sites split
 *      five ways (track / divider / mark / hover / chip).
 *   4. Idempotence is checkable.
 *   5. .ts files matter: four lib/ files return class strings from plain maps.
 *
 * REGEX NOTE, and it would have shipped a grey cage. A pattern ending `\]?\b`
 * CANNOT consume the closing bracket: `]` is not a word char, so `\b` after it
 * only holds if the next char is a word char, which never happens inside a
 * className. The engine backtracks `\]?` to empty and the match stops one
 * short, yielding `border-line]` — not a class, so Tailwind preflight falls
 * back to borderColor.DEFAULT = gray-200 on all 63 bracket-notation sites, in
 * BOTH themes, with no build error and no guard hit. Every bracket form below
 * is therefore matched explicitly and closed with (?![\w/[]).
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join } from "node:path"
import { SWEEP_ROOTS, SWEEP_EXT, PINNED, isFrozen } from "./theme-scope"

const WRITE = process.argv.includes("--write")

type Rule = { stage: number; id: string; re: RegExp; to: string }
const RULES: Rule[] = []
const t = (stage: number, id: string, re: RegExp, to: string) => RULES.push({ stage, id, re, to })

/* ---------------------------------------------------------------- stage 0 */
/* Hover FIRST. All three of these were unreachable as originally drafted: the
   line and surface rules carry the hover: prefix group, so they consumed these
   sites before a later hover rule could see them. Worse, the four
   hover:border-tk-slate/20 sites fell through line/base to hover:border-line —
   exactly the resting colour, deleting the affordance entirely. */

/* lib/cn.ts is a plain filter-and-join with NO tailwind-merge, so a leftover
   transition-colors reaches the element alongside the new transition-[...] and
   stylesheet order decides. Where transition-colors wins, transition-property
   excludes transform and the new 1px lift SNAPS instead of animating. */
/* Consumes its own trailing space. The alternative — leaving a double space
   and mopping up afterwards — is what destroyed the indentation of twelve
   files, because a whole-file whitespace collapse cannot tell a class gap from
   a line indent. */
t(0, "hover/btn-strip-transition", /\btransition-colors[ \t]+(?=[^"'`]*hover:border-tk-teal)/g, "")
t(
  0,
  "hover/btn",
  /\bhover:border-tk-teal(?:\/(?:40|50))?(?![-\w])/g,
  "hover:border-line-strong hover:-translate-y-px transition-[transform,box-shadow,border-color,color] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
)
t(0, "hover/ladder", /\bhover:border-tk-slate\/(?:20|25|30|35|40|50)(?![\w/[])/g, "hover:border-line-strong")
t(0, "hover/row", /\bhover:bg-tk-linen(?![-/\w])/g, "hover:bg-well transition-colors duration-[120ms]")

/* ---------------------------------------------------------------- stage 1 */
/* All 21 placeholder sites use the placeholder:text-* VARIANT, which reads
   textColor; bare placeholder-tk-slate is unreachable dead config. Bare
   placeholder:text-tk-slate resolves to --ink-2, body weight, too dark. */
t(1, "ink/placeholder-bare", /placeholder:text-tk-slate(?![-/\w])/g, "placeholder:text-ink-3")

/* ---------------------------------------------------------------- stage 2 */
/* Neutral chips. Roles 1-4 (tracks, dividers, marks, hovers) are exact-site
   rules below and run before this catch-all. */
t(2, "chip/slate-surface", /\bbg-tk-slate\/(?:\[0?\.(?:0[6-9]|13)\]|5|8|10|12|15)(?![\w/[])/g, "bg-well")

/* Eight scrims, every one measuring exactly 1.0000:1 in dark: tk-onyx is the
   locked literal #0F1615 and the dark canvas is ALSO #0F1615, so each paints
   the canvas onto the canvas. Two carry no blur and are 100% invisible. */
t(2, "scrim", /\bbg-tk-onyx\/(?:30|35|40|45|55)\b/g, "bg-scrim")

/* ---------------------------------------------------------------- stage 3 */
/* THE LINE — 804 sites onto two weights. Bracket forms matched explicitly. */
t(
  3,
  "line/base",
  /\b((?:hover:|focus:|focus-visible:|group-hover:)?)border(-[tblrxy])?-tk-slate\/(?:\[0?\.0[6-9]\]|10|12|15|20|8)(?![\w/[])/g,
  "$1border$2-line",
)
t(
  3,
  "line/strong",
  /\b((?:hover:|focus:|group-hover:|focus-visible:)?)border(-[tblrxy])?-tk-slate\/(?:25|30|35|40|50)(?![\w/[])/g,
  "$1border$2-line-strong",
)
t(3, "line/divide", /\bdivide-tk-slate\/(?:\[0?\.06\]|10|8)(?![\w/[])/g, "divide-line")
t(3, "line/ring", /\bring-tk-slate\/(?:10|15)(?![\w/[])/g, "ring-line")

/* THE INK — 1,135 alphas onto three steps. The mockup's own comments settle
   the fold: --ink-2 is "slate @ ~80% over white", --ink-3 is "slate @ 70% —
   the pack's floor". The word floor decides everything under 70.
   20 IS ABSENT FROM ink/floor ON PURPOSE: the only three text-tk-slate/20
   sites are disabled controls where the alpha is the ONLY signal, and the
   enabled sibling sits at /30. A flat fold makes disabled and enabled
   identical. Stage 8 hand-fixes them to text-ink-3 opacity-40 + aria-disabled. */
t(3, "ink/up", /\btext-tk-slate\/(?:75|80|85)(?![\w/[])/g, "text-tk-slate")
t(3, "ink/floor", /\btext-tk-slate\/(?:25|3[05]|40|45|50|55|60|65|70)(?![\w/[])/g, "text-ink-3")
t(3, "ink/onyx-75", /\btext-tk-onyx\/75(?![\w/[])/g, "text-tk-slate")
t(3, "ink/onyx-90", /\btext-tk-onyx\/90(?![\w/[])/g, "text-tk-onyx")
t(3, "ink/decoration", /\bdecoration-tk-slate\/30(?![\w/[])/g, "decoration-ink-3")

/* TONE TINTS. 055 must precede 05 or the shorter branch wins and strands a digit. */
t(3, "hex/warn-tint-lo", /\bbg-\[#8A5A05\]\/\[0?\.(?:055|05|06|07)\](?![\w/[])/g, "bg-warn-soft")
t(3, "hex/warn-tint-hi", /\bbg-\[#8A5A05\]\/1[02](?![\w/[])/g, "bg-warn-soft")
t(3, "hex/bad-tint", /\bbg-\[#(?:B4322A|A62228|A32C1E)\]\/(?:\[0?\.07\]|10|11)(?![\w/[])/g, "bg-bad-soft")
t(3, "hex/good-tint", /\bbg-\[#(?:26684A|1B6B3A)\]\/(?:\[0?\.0[56]\]|10)(?![\w/[])/g, "bg-good-soft")

/* TONE BORDERS AND RINGS -> transparent, mockup rule 3. Transparent and not
   deletion: removing a 1px border shifts layout by 2px on 10 elements.
   Measured on the dark card these are 1.13-1.43:1 — effectively invisible —
   while the tint underneath already carries the tone at 5.2-6.4:1.
   The proof it matters: DeliveryLedger:58 is
   `alert ? border-[#8A5A05]/40 : border-tk-slate/15`, i.e. in dark the ALERT
   border is 1.43 and the CALM one 1.52 — the escalation reads as a
   de-escalation. */
t(
  3,
  "hex/tone-border",
  /\bborder-\[#(?:8A5A05|B4322A|A62228|A32C1E|26684A)\]\/(?:\[[0-9.]+\]|\d{2})(?![\w/[])/g,
  "border-transparent",
)
t(3, "hex/tone-ring", /\bring-\[#(?:8A5A05|B4322A|A62228|A32C1E)\]\/(?:\[[0-9.]+\]|\d{2})(?![\w/[])/g, "ring-transparent")

/* TONE TEXT AND SOLID FILLS. */
t(3, "hex/warn-text", /\btext-\[#(?:8A5A05|B4790A|A97A22)\](?![\w/[])/g, "text-warn")
t(3, "hex/bad-text", /\btext-\[#(?:B4322A|A62228|A32C1E)\](?![\w/[])/g, "text-bad")
t(3, "hex/good-text", /\btext-\[#(?:26684A|2E7D57|1B6B3A|2E7D32)\](?![\w/[])/g, "text-good")
t(3, "hex/warn-fill", /\bbg-\[#(?:8A5A05|B4790A|A97A22)\](?![\w/[])/g, "bg-warn")
t(3, "hex/bad-fill", /\bbg-\[#(?:B4322A|A62228|A32C1E)\](?![\w/[])/g, "bg-bad")
t(3, "hex/good-fill", /\bbg-\[#(?:26684A|2E7D57|1B6B3A|2E7D32)\](?![\w/[])/g, "bg-good")

/* ---------------------------------------------------------------- stage 4 */
/* SURFACES. The bare renames are pure — zero pixel change in either theme,
   they already resolve through the bridge. The alpha ones are not:
   bg-white/80 composites to #151E1E in dark, DARKER than the card #172020, so
   the "soft recessed" state is a hole punched below the card plane — the exact
   inverse of the well-is-lighter rule. */
t(4, "surface/card", /\bbg-white(?![-/\w])/g, "bg-card")
t(4, "surface/card-alpha", /\bbg-white\/(?:1[05]|25|5[05]|60|70|80|90|95)(?![\w/[])/g, "bg-well")
t(4, "surface/linen", /\b((?:hover:|group-hover:)?)bg-tk-linen(?![-/\w])/g, "$1bg-well")
t(4, "surface/linen-alpha", /\bbg-tk-linen\/(?:\[[0-9.]+\]|\d{1,2})(?![\w/[])/g, "bg-well")
t(4, "surface/accent", /\bbg-tk-teal(?![-/\w])/g, "bg-accent")
/* The highest-severity item in the sweep, and a legibility failure rather than
   a palette one: arbitrary values get no channel mapping, so #FAF6EE stays
   near-white in dark (17.00:1 against the canvas) while the ink on it is
   theme-driven — text-tk-onyx becomes --ink #F1EADC at 1.11:1. Light moves
   1.03:1, imperceptible. */
t(4, "surface/cream-hover", /\bhover:(!?)bg-\[#(?:FAF6EE|FCFAF5|FAF7F0|F7FAF9)\](?![\w/[])/g, "hover:$1bg-well")
t(4, "surface/cream", /\b(!?)bg-\[#(?:FAF6EE|FCFAF5|FAF7F0|F7FAF9)\](?![\w/[])/g, "$1bg-well")

/* ---------------------------------------------------------------- stage 5 */
/* ELEVATION. shadow-sm is 1.0090:1 on the dark canvas and 1.1044:1 in light —
   the identical class carrying 11.6x more perceptual weight in one theme. */
t(5, "shadow/hover", /\bhover:shadow-sm\b/g, "hover:shadow-hover")
t(5, "shadow/base", /\bshadow-sm\b/g, "shadow-card")
t(5, "shadow/overlay", /\bshadow-(?:2xl|xl|lg)\b/g, "shadow-overlay")
/* rgba(15,22,21,...) IS the dark canvas, so this literal composites to exactly
   #0F1615 — 1.0000:1, provably zero. */
t(5, "shadow/literal-canvas", /\bshadow-\[0_16px_36px_-12px_rgba\(15,22,21,\.28\)\]/g, "shadow-overlay")
/* Slate is LIGHTER than the dark card, so a slate inset tab underline inverts
   into a faint light line at 1.0196:1. A real border on --line is 1.270/1.256. */
t(5, "tab/underline", /\bshadow-\[inset_0_-1px_0_rgba\(31,44,43,0?\.15\)\]/g, "border-b border-line")

/* ------------------------------------------------------- exact-site rules */
/* Applied BEFORE the regex rules, per file. These are the cases where the
   correct replacement depends on the element's ROLE, which no regex can see. */
const SITE_RULES: Record<string, [string, string][]> = {
  /* bg-white/N that are NOT surfaces. --on-accent-rgb is linen 241 234 220 in
     BOTH themes, which is the right token for a mark on always-dark chrome. */
  "components/dashboard/WeekBoard.tsx": [["bg-white/15", "bg-on-accent/15"]],
  "components/ui/Dropdown.tsx": [
    ["bg-white/25", "bg-on-accent/25"],
    ["bg-tk-slate/10", "bg-line"],
  ],
  "components/support/Dropdown.tsx": [
    ["bg-white/25", "bg-on-accent/25"],
    ["bg-tk-slate/10", "bg-line"],
  ],
  /* border-white on always-dark chrome: mapped it was 1.0000:1. The outer
     border-tk-slate/20 on :29 is NOT exempt — that edge faces the page canvas. */
  "components/support/PayloadBlock.tsx": [
    ["border-b border-white/10", "border-b border-on-accent/10"],
    ["border border-white/15", "border border-on-accent/15"],
  ],
  "components/support/CopyButton.tsx": [['"border-white/15 text-tk-linen/65', '"border-on-accent/15 text-tk-linen/65']],

  /* Role 1 — meter/progress TRACKS -> bg-well (a blanket bg-line would turn
     every track into a hairline). */
  "components/clients/HoursMeter.tsx": [["bg-tk-slate/10", "bg-well"]],
  /* :411 is a band-header rule; bg-line/[0.09] holds the light weight where a
     plain bg-well would paint linen on linen at 1.03:1 and vanish. */
  "components/delivery/DeliveryLedger.tsx": [["bg-tk-slate/[0.09]", "bg-line"]],
  "components/punchlist/PunchlistList.tsx": [["bg-tk-slate/10", "bg-well"]],
  "components/punchlist/PunchlistBody.tsx": [["bg-tk-slate/12", "bg-well"]],

  /* Role 2 — hairline DIVIDERS drawn as a filled span -> bg-line. */
  "components/tasks/TaskFilterBar.tsx": [["bg-tk-slate/10", "bg-line"]],
  "components/support/TicketQueue.tsx": [["bg-tk-slate/10", "bg-line"]],
  "components/clients/ActivityFeed.tsx": [["before:bg-tk-slate/10", "before:bg-line"]],
  "components/clients/StatusBoard.tsx": [["gap-px bg-tk-slate/10", "gap-px bg-line"]],
  "components/revenue/YearGapBar.tsx": [["before:bg-tk-slate/20", "before:bg-line-strong"]],

  /* Role 3 — toggle-off / idle / muted MARKS -> bg-line-strong. */
  "components/clients/ClientAvatar.tsx": [['"bg-tk-slate/20 text-tk-slate/70"', '"bg-line-strong text-ink-3"']],
  "components/support/MonitorRow.tsx": [["bg-tk-slate/20", "bg-line-strong"]],
  "lib/app-health.ts": [['idle: "bg-tk-slate/20"', 'idle: "bg-line-strong"']],

  /* The --accent-mark repoints. Stage 1 moved --accent #0E8A84 -> #0A7671 in
     dark, which against the WELL is 3.555 -> 2.739: a NEW WCAG 1.4.11 failure
     on solid teal marks that carry no label. --accent-mark holds them at the
     old value. Until this lands the regression is live, so it ships here. */
  "components/HideMoneyToggle.tsx": [["bg-tk-teal", "bg-accent-mark"]],
  "components/settings/KindToggles.tsx": [["bg-tk-teal", "bg-accent-mark"]],
  "components/punchlist/ItemState.tsx": [
    ["bg-tk-teal", "bg-accent-mark"],
    ["border-amber-500 ring-4 ring-amber-500/10", "border-warn ring-4 ring-warn/10"],
    ["bg-amber-500", "bg-warn"],
  ],
  "components/punchlist/ItemRow.tsx": [
    ["bg-tk-teal", "bg-accent-mark"],
    ["bg-amber-500", "bg-warn"],
  ],
  "components/revenue/YearRunway.tsx": [["bg-tk-teal", "bg-accent-mark"]],
  "components/inbox/InboxConsole.tsx": [["bg-tk-teal", "bg-accent-mark"]],

  /* The unmapped-family hand edits. amber-300/400/500 and red-400 stay
     unmapped because a blanket map takes a pale rim to a heavy stroke in light
     (#FCD34D 1.44 -> 5.92). #F59E0B is 2.15:1 on the LIGHT card, under the 3:1
     mark floor, so bg-amber-500 -> bg-warn fixes light too. */
  "components/tasks/TaskComposer.tsx": [
    ["border-amber-300 bg-amber-50 text-amber-800", "border-transparent bg-warn-soft text-warn"],
  ],
  "components/timesheet/LedgerFilters.tsx": [
    ["border-amber-400 bg-amber-50 text-amber-800", "border-transparent bg-warn-soft text-warn"],
  ],
  /* A real data signal, not chrome: at 5.92 vs 1.25 light and 9.59 vs 1.27
     dark the escalation finally reads. */
  "components/timesheet/PunchQueue.tsx": [["border-amber-300", "border-warn"]],
  "components/settings/DeviceTokenManager.tsx": [["hover:border-red-400", "hover:border-bad"]],

  /* Inverted chips. bg-tk-onyx is unmapped so in dark it IS the canvas
     (1.0000:1), while border-tk-onyx IS mapped to --ink and paints a 13.88:1
     linen outline around nothing. */
  "app/(admin)/vault/page.tsx": [["border-tk-onyx bg-tk-onyx text-white", "border-ink bg-ink text-canvas"]],
  "components/clients/ClientRoster.tsx": [["border-tk-onyx bg-tk-onyx text-white", "border-ink bg-ink text-canvas"]],
}

/* --------------------------------------------------------------- engine */
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

/** Pins sorted longest-first and matched against the ALREADY masked text, so a
 *  short pin nested inside a long one cannot false-trip.
 *
 *  Pins are whole class strings, never fragments: text-[#54C3AB] occurs TWICE
 *  in PayloadBlock (bare at :31, inside hover: at :45), so a fragment pin
 *  would be ambiguous about which one it protects.
 *
 *  ALL occurrences are masked, and the assertion is "at least once", not
 *  "exactly once". uptime/page.tsx:79 and :113 are two byte-identical <pre>
 *  blocks — a legitimate duplicate that an exactly-once rule aborts on. A pin
 *  matching ZERO times is still fatal: it means the file moved out from under
 *  the pin and the literal it was protecting is now exposed to the rules.
 *
 *  The sentinel carries NO surrounding whitespace on purpose. It used to be
 *  ` PIN0 `, and dedupeClasses() below strips whitespace before a closing
 *  quote — so a pin sitting at the END of a className lost the sentinel's
 *  trailing space and unmask() could no longer find it, silently dropping the
 *  pinned literal. The idempotence re-run is what caught it. */
function mask(rel: string, text: string) {
  const pins = [...(PINNED[rel] ?? [])].sort((a, b) => b.length - a.length)
  let out = text
  pins.forEach((pin, i) => {
    const n = out.split(pin).length - 1
    if (n < 1) {
      console.error(`FATAL ${rel}: pinned substring no longer present — it is now unprotected:`)
      console.error(`  ${pin}`)
      process.exit(2)
    }
    out = out.split(pin).join(`__TKPIN${i}__`)
  })
  return { text: out, pins }
}
function unmask(text: string, pins: string[]) {
  let out = text
  pins.forEach((pin, i) => {
    out = out.split(`__TKPIN${i}__`).join(pin)
  })
  return out
}

/** hover/btn is the only rule that ADDS classes, so it is the only shape that
 *  is not naturally idempotent. Two sites already ship the mockup recipe and
 *  are where a duplicate lands first.
 *
 *  THIS FUNCTION MUST ONLY EVER TOUCH REPEATED CLASS TOKENS.
 *
 *  It used to end with `.replace(/[ \t]{2,}/g, " ")` plus two className
 *  trimmers, all applied to the WHOLE FILE. That collapses every run of two or
 *  more spaces anywhere in the source — i.e. it destroys all indentation in
 *  every file the codemod touches, and rewrites `{" "}` to `{""}`, which is a
 *  behaviour change in JSX. It did exactly that to twelve files on its first
 *  run. Whitespace normalisation belongs to a formatter, never here; the
 *  double space that `hover/btn-strip-transition` used to leave behind is now
 *  consumed by that rule's own pattern instead. */
function dedupeClasses(text: string): string {
  return text
    .replace(/(hover:-translate-y-px)([ \t]+\1)+/g, "$1")
    .replace(/(motion-reduce:hover:translate-y-0)([ \t]+\1)+/g, "$1")
    .replace(/(motion-reduce:transition-none)([ \t]+\1)+/g, "$1")
    .replace(/(hover:border-line-strong)([ \t]+\1)+/g, "$1")
}

const files = SWEEP_ROOTS.flatMap((r) => (existsSync(r) ? walk(r) : [])).filter((f) => !isFrozen(f))
const byRule: Record<string, number> = {}
let touched = 0
let edits = 0

for (const rel of files) {
  const original = readFileSync(rel, "utf8")
  const { text: masked, pins } = mask(rel, original)
  let src = masked
  const hits: string[] = []

  for (const [from, to] of SITE_RULES[rel] ?? []) {
    const n = src.split(from).length - 1
    if (n > 0) {
      src = src.split(from).join(to)
      byRule["(exact-site rules)"] = (byRule["(exact-site rules)"] ?? 0) + n
      edits += n
      hits.push(`  site   x${String(n).padEnd(3)} ${from}  ->  ${to}`)
    }
  }

  for (const stage of [0, 1, 2, 3, 4, 5]) {
    for (const r of RULES.filter((x) => x.stage === stage)) {
      const m = src.match(r.re)
      if (!m) continue
      src = src.replace(r.re, r.to)
      byRule[r.id] = (byRule[r.id] ?? 0) + m.length
      edits += m.length
      hits.push(`  ${r.id.padEnd(24)} x${String(m.length).padEnd(3)} ${Array.from(new Set(m)).slice(0, 3).join("  ")}`)
    }
  }

  src = dedupeClasses(src)
  const final = unmask(src, pins)
  if (final !== original) {
    touched++
    if (process.env.TK_VERBOSE) {
      console.log(`\n${rel}`)
      for (const h of hits) console.log(h)
    }
    if (WRITE) writeFileSync(rel, final)
  }
}

console.log(`${edits} edits across ${touched} files (${files.length} scanned, frozen excluded)\n`)
for (const [id, n] of Object.entries(byRule).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${id.padEnd(26)} ${n}`)
}
console.log(WRITE ? "\nWRITTEN. Re-run without --write; it must report 0 edits." : "\nDRY RUN — nothing written.")
