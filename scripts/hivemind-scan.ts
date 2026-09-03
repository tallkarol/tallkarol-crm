/**
 * Scans the daedalus-hive-mind plugin repo and writes the graph the
 * /hivemind page renders. Run it again whenever the hive changes.
 *
 *   npm run hivemind:scan
 *
 * Why a scan-to-JSON rather than reading the filesystem at request time:
 * the CRM runs on Railway, where ~/Work/daedalus-hive-mind does not exist.
 * The committed JSON is what ships; this script is how it gets refreshed.
 *
 * Discipline borrowed from the spec-sheet skill: nothing is asserted that a
 * file didn't say. Every node carries the path it was read from, and the
 * only hand-authored input is LANES / ROUTINES below — the editorial layer
 * that lives in prose (the README org chart, the cadences in each SKILL.md)
 * and cannot be parsed out. Each of those still names its evidence file.
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from "node:fs"
import { join, relative, basename } from "node:path"
import { homedir } from "node:os"

const ROOT =
  process.env.DAEDALUS_HIVE_MIND ?? join(homedir(), "Work", "daedalus-hive-mind")

const OUT = join(process.cwd(), "content", "hivemind.json")

// ---------------------------------------------------------------- types

export type NodeKind =
  | "root"
  | "lane"
  | "agent"
  | "skill"
  | "command"
  | "script"
  | "reference"
  | "routine"
  | "pipeline"

type GraphNode = {
  id: string
  label: string
  kind: NodeKind
  lane?: string
  /** One-line summary — the frontmatter description, trimmed. */
  blurb?: string
  /** Repo-relative path this node was read from. */
  source?: string
  /** Extra facts worth showing in the inspector. */
  meta?: Record<string, string>
}

type GraphLink = {
  source: string
  target: string
  /** contains = structural parent; loads = runtime dependency; fires = hook. */
  rel: "contains" | "loads" | "fires" | "feeds"
}

// ---------------------------------------------------------------- helpers

function read(path: string): string {
  return readFileSync(path, "utf8")
}

function rel(path: string): string {
  return relative(ROOT, path)
}

/** Minimal YAML-ish frontmatter reader — these files only use scalars. */
function frontmatter(text: string): Record<string, string> {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return {}
  const out: Record<string, string> = {}
  let key: string | null = null
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([a-zA-Z][\w-]*):\s?(.*)$/.exec(line)
    if (kv) {
      key = kv[1]
      out[key] = kv[2].trim()
    } else if (key && line.trim()) {
      // A wrapped scalar continues the previous key.
      out[key] = `${out[key]} ${line.trim()}`.trim()
    }
  }
  return out
}

/** First sentence, so the inspector gets a line rather than a paragraph. */
function firstSentence(text: string, max = 190): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (!clean) return ""
  const cut = /^(.+?[.!?])(\s|$)/.exec(clean)
  const s = cut ? cut[1] : clean
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

function dirs(path: string): string[] {
  if (!existsSync(path)) return []
  return readdirSync(path)
    .filter((n) => !n.startsWith("."))
    .filter((n) => statSync(join(path, n)).isDirectory())
    .sort()
}

function files(path: string, ext: string): string[] {
  if (!existsSync(path)) return []
  return readdirSync(path)
    .filter((n) => !n.startsWith(".") && n.endsWith(ext))
    .sort()
}

// ---------------------------------------------------------------- editorial

/**
 * The lanes come from the README's org chart, which is an ASCII diagram —
 * the one thing here that can't be parsed. Membership is asserted; the
 * `source` is where to go check it.
 */
const LANES: {
  id: string
  label: string
  blurb: string
  members: string[]
}[] = [
  {
    id: "lane:build",
    label: "Build",
    blurb:
      "Design and implementation in one context; security and QA review the result in parallel, not as a relay.",
    members: ["db-specialist", "security-reviewer", "ux-builder", "qa", "design-system", "browser-check"],
  },
  {
    id: "lane:content",
    label: "Content",
    blurb:
      "Drafts from approved claims and from evidence — supply (what was built) and demand (what people search).",
    members: ["content-runner", "blogo", "casestudio", "scout", "demand-scout"],
  },
  {
    id: "lane:delivery",
    label: "Delivery",
    blurb: "Handoff and training material for the people who will use what shipped.",
    members: ["docent"],
  },
  {
    id: "lane:care",
    label: "Care",
    blurb: "The healing routine: weekly audit → Karol picks → approved maintenance → monthly report from the log.",
    members: ["caretaker", "website-care"],
  },
  {
    id: "lane:ledger",
    label: "Ledger",
    blurb: "Work becomes evidence becomes money: the clock, the reconcile, the estimate, the invoice.",
    members: ["purser", "timeclock", "estimator", "log-session", "session-log"],
  },
  {
    id: "lane:planning",
    label: "Planning & intake",
    blurb: "Turning a request into a scoped, priced, tracked thing before anyone builds it.",
    members: ["blueprint", "spec-sheet", "punchlist", "follow-up", "leftoff"],
  },
  {
    id: "lane:foundation",
    label: "Foundation",
    blurb: "What every lane loads first: the operating manual and the brand layer.",
    members: ["team-charter", "client-pack"],
  },
]

/**
 * Routines — the parts that run on a cadence rather than on a prompt. Hook
 * routines are verified against hooks/hooks.json below (a routine claiming a
 * hook that isn't wired is dropped); cadence routines are declared, and each
 * names the file that documents it.
 */
const ROUTINES: {
  id: string
  label: string
  blurb: string
  cadence: string
  /** Hook script basename, when this routine is wired as a hook. */
  hookScript?: string
  source: string
  drives: string[]
}[] = [
  {
    id: "routine:meter",
    label: "Agent meter",
    blurb:
      "Records agent-active turns and token usage per client across every session, so hours exist before anyone tries to remember them.",
    cadence: "every prompt, stop, subagent start/stop, session end",
    hookScript: "meter-hook.sh",
    source: "skills/timeclock/SKILL.md",
    drives: ["timeclock", "log-session"],
  },
  {
    id: "routine:leftoff",
    label: "Left-off reporter",
    blurb:
      "Reports what every conversation is doing to the CRM board — working, waiting on Karol, blocked on a permission prompt, parked.",
    cadence: "same five events, plus permission prompts",
    hookScript: "leftoff-hook.sh",
    source: "skills/leftoff/SKILL.md",
    drives: ["leftoff"],
  },
  {
    id: "routine:summarize",
    label: "Session summarizer",
    blurb:
      "At session end a headless call turns the transcript into one invoice-voice line, while the transcript is still on disk.",
    cadence: "session end, plus a weekly sweep",
    source: "skills/session-log/SKILL.md",
    drives: ["session-log"],
  },
  {
    id: "routine:care",
    label: "Care cycle",
    blurb: "Read-only audit → fix picklist → Karol picks → approved ops only, backup-first.",
    cadence: "weekly, per care client",
    source: "skills/website-care/SKILL.md",
    drives: ["caretaker", "website-care"],
  },
  {
    id: "routine:scout",
    label: "Daily scout",
    blurb:
      "Mines the day's work for a search-relevant nugget. Zero good nuggets is a correct outcome — it never invents one.",
    cadence: "daily, or right after a notable fix",
    source: "skills/scout/SKILL.md",
    drives: ["scout"],
  },
  {
    id: "routine:briefs",
    label: "Demand briefs",
    blurb: "Reads the ranked search-opportunity queue and pitches cadence-aware briefs against the claim bank.",
    cadence: "monthly, per site",
    source: "skills/demand-scout/SKILL.md",
    drives: ["demand-scout"],
  },
  {
    id: "routine:invoice",
    label: "Month-end close",
    blurb: "Purser reconciles the period, Karol picks the fixes, then the invoice renders from the timeclock.",
    cadence: "monthly, per client",
    source: "commands/invoice.md",
    drives: ["purser", "timeclock", "estimator"],
  },
]

// ---------------------------------------------------------------- scan

const nodes: GraphNode[] = []
const links: GraphLink[] = []
const seen = new Set<string>()

function addNode(node: GraphNode) {
  if (seen.has(node.id)) return
  seen.add(node.id)
  nodes.push(node)
}

/**
 * Which end of a `loads` edge is the one doing the loading, when both files
 * reference each other. purser's agent file names skills/timeclock and
 * timeclock's SKILL.md names agents/purser — one relationship, and the
 * inspector listed it twice ("loads" and "loads by") until this collapsed it.
 * Lower number wins the arrow.
 */
const ACTOR_RANK: Record<string, number> = { command: 0, agent: 1, skill: 2 }
const rankOf = (id: string) => ACTOR_RANK[id.split(":")[0]] ?? 9

function addLink(source: string, target: string, rel: GraphLink["rel"]) {
  if (source === target) return
  if (linkKeys.has(`${source}->${target}:${rel}`)) return

  const reciprocal = `${target}->${source}:${rel}`
  if (linkKeys.has(reciprocal)) {
    // Already have the other direction. Keep whichever end is the actor.
    if (rankOf(source) >= rankOf(target)) return
    const at = links.findIndex((l) => l.source === target && l.target === source && l.rel === rel)
    if (at >= 0) links.splice(at, 1)
    linkKeys.delete(reciprocal)
  }

  linkKeys.add(`${source}->${target}:${rel}`)
  links.push({ source, target, rel })
}
const linkKeys = new Set<string>()

// --- root

const manifestPath = join(ROOT, ".claude-plugin", "plugin.json")
const manifest = existsSync(manifestPath)
  ? (JSON.parse(read(manifestPath)) as { name: string; version: string })
  : { name: "daedalus-hive-mind", version: "0.0.0" }

addNode({
  id: "root",
  label: "PM",
  kind: "root",
  blurb:
    "The main session. Decomposes, delegates, reviews reports, integrates — and is the only one that talks to Karol.",
  source: "skills/team-charter/SKILL.md",
  meta: { plugin: manifest.name, version: manifest.version },
})

/* README: "PM = the main session (loads skills/team-charter + a client pack
   via /client)". Those two are what the PM reads before any lane opens. */
for (const s of ["team-charter", "client-pack"]) addLink("root", `skill:${s}`, "loads")

for (const lane of LANES) {
  addNode({
    id: lane.id,
    label: lane.label,
    kind: "lane",
    lane: lane.id,
    blurb: lane.blurb,
    source: "README.md",
  })
  addLink("root", lane.id, "contains")
}

/** Which lane owns a given agent/skill name. */
const laneOf = new Map<string, string>()
for (const lane of LANES) for (const m of lane.members) laneOf.set(m, lane.id)

// --- agents

const agentNames = new Set<string>()
for (const file of files(join(ROOT, "agents"), ".md")) {
  const path = join(ROOT, "agents", file)
  const text = read(path)
  const fm = frontmatter(text)
  const name = fm.name ?? basename(file, ".md")
  agentNames.add(name)
  const lane = laneOf.get(name)
  addNode({
    id: `agent:${name}`,
    label: name,
    kind: "agent",
    lane,
    blurb: firstSentence(fm.description ?? ""),
    source: rel(path),
    meta: {
      ...(fm.tools ? { tools: fm.tools } : { tools: "inherits the session's tools" }),
      ...(fm.model ? { model: fm.model } : {}),
    },
  })
  if (lane) addLink(lane, `agent:${name}`, "contains")
}

// --- skills (and their scripts / references as subskills)

const skillNames = new Set<string>()
for (const dir of dirs(join(ROOT, "skills"))) {
  const skillFile = join(ROOT, "skills", dir, "SKILL.md")
  if (!existsSync(skillFile)) continue
  const fm = frontmatter(read(skillFile))
  const name = fm.name ?? dir
  skillNames.add(name)
  const lane = laneOf.get(name)
  addNode({
    id: `skill:${name}`,
    label: name,
    kind: "skill",
    lane,
    blurb: firstSentence(fm.description ?? ""),
    source: rel(skillFile),
  })
  if (lane) addLink(lane, `skill:${name}`, "contains")

  // Subskills: the instruments a skill ships with.
  for (const sub of ["scripts", "references"] as const) {
    const subDir = join(ROOT, "skills", dir, sub)
    if (!existsSync(subDir)) continue
    for (const f of readdirSync(subDir).sort()) {
      if (f.startsWith(".")) continue
      // Test files are real, but they're not part of the map's story.
      if (/^test_|\.test\./.test(f)) continue
      const id = `${sub === "scripts" ? "script" : "reference"}:${dir}/${f}`
      addNode({
        id,
        label: f,
        kind: sub === "scripts" ? "script" : "reference",
        lane,
        blurb:
          sub === "scripts"
            ? "Companion instrument — the deterministic part the model calls instead of doing by hand."
            : "Reference the skill reads before acting.",
        source: rel(join(subDir, f)),
      })
      addLink(`skill:${name}`, id, "contains")
    }
  }
}

/**
 * Skill/agent names a body *depends on* → `loads` edges.
 *
 * Deliberately strict. A first pass matched any bare agent name in the prose,
 * which made client-pack "load" five agents because its examples named them —
 * a hub that wasn't real. Only an explicit reference counts: a `skills/x` or
 * `agents/x` path, a backticked or bolded name followed by the word
 * skill/agent, or a literal `subagent_type: x` dispatch.
 */
function mentions(text: string, self?: string): { skills: string[]; agents: string[] } {
  const body = text.replace(/^---[\s\S]*?---/, "")
  const grab = (patterns: RegExp[]) => {
    const found = new Set<string>()
    for (const re of patterns) for (const m of Array.from(body.matchAll(re))) found.add(m[1])
    return found
  }
  const skills = grab([/skills\/([a-z][a-z0-9-]*)/g, /`([a-z][a-z0-9-]*)`\s+skill/g])
  const agents = grab([
    /agents\/([a-z][a-z0-9-]*)/g,
    /`([a-z][a-z0-9-]*)`\s+agent/g,
    /\*\*([a-z][a-z0-9-]*)\*\*\s+agent/g,
    /subagent_type:\s*`?([a-z][a-z0-9-]*)`?/g,
  ])
  return {
    skills: Array.from(skills).filter((s) => skillNames.has(s) && s !== self),
    agents: Array.from(agents).filter((a) => agentNames.has(a) && a !== self),
  }
}

for (const file of files(join(ROOT, "agents"), ".md")) {
  const name = frontmatter(read(join(ROOT, "agents", file))).name ?? basename(file, ".md")
  const { skills } = mentions(read(join(ROOT, "agents", file)), name)
  for (const s of skills) addLink(`agent:${name}`, `skill:${s}`, "loads")
}

for (const dir of dirs(join(ROOT, "skills"))) {
  const skillFile = join(ROOT, "skills", dir, "SKILL.md")
  if (!existsSync(skillFile)) continue
  const text = read(skillFile)
  const name = frontmatter(text).name ?? dir
  const { skills, agents } = mentions(text, name)
  for (const s of skills) addLink(`skill:${name}`, `skill:${s}`, "loads")
  for (const a of agents) addLink(`skill:${name}`, `agent:${a}`, "loads")
}

// --- commands

for (const file of files(join(ROOT, "commands"), ".md")) {
  const path = join(ROOT, "commands", file)
  const text = read(path)
  const fm = frontmatter(text)
  const slug = basename(file, ".md")
  const { skills, agents } = mentions(text)
  const lane = skills.map((s) => laneOf.get(s)).find(Boolean)
  addNode({
    id: `command:${slug}`,
    label: `/${slug}`,
    kind: "command",
    lane,
    blurb: firstSentence(fm.description ?? ""),
    source: rel(path),
    meta: fm["argument-hint"] ? { arguments: fm["argument-hint"] } : {},
  })
  for (const s of skills) addLink(`command:${slug}`, `skill:${s}`, "loads")
  for (const a of agents) addLink(`command:${slug}`, `agent:${a}`, "loads")
}

// --- routines, checked against the wired hooks

const hooksPath = join(ROOT, "hooks", "hooks.json")
const wiredScripts = new Set<string>()
const eventsByScript = new Map<string, Set<string>>()
if (existsSync(hooksPath)) {
  const parsed = JSON.parse(read(hooksPath)) as {
    hooks: Record<string, { hooks: { command: string }[] }[]>
  }
  for (const [event, groups] of Object.entries(parsed.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        const script = basename(hook.command)
        wiredScripts.add(script)
        if (!eventsByScript.has(script)) eventsByScript.set(script, new Set())
        eventsByScript.get(script)!.add(event)
      }
    }
  }
}

for (const routine of ROUTINES) {
  // A routine that claims a hook the plugin doesn't actually wire is a lie
  // the map would tell every time it's opened. Drop it instead.
  if (routine.hookScript && !wiredScripts.has(routine.hookScript)) {
    console.warn(`  ! skipping ${routine.id}: ${routine.hookScript} is not wired in hooks.json`)
    continue
  }
  const events = routine.hookScript
    ? Array.from(eventsByScript.get(routine.hookScript) ?? [])
    : []
  addNode({
    id: routine.id,
    label: routine.label,
    kind: "routine",
    blurb: routine.blurb,
    source: routine.source,
    meta: {
      cadence: routine.cadence,
      ...(events.length ? { "hook events": events.sort().join(", ") } : {}),
      ...(routine.hookScript ? { script: routine.hookScript } : {}),
    },
  })
  addLink("root", routine.id, "contains")
  for (const target of routine.drives) {
    const id = skillNames.has(target)
      ? `skill:${target}`
      : agentNames.has(target)
        ? `agent:${target}`
        : null
    if (id) addLink(routine.id, id, "fires")
  }
}

// --- HARVESTER, the one pipeline that isn't a skill

if (existsSync(join(ROOT, "HARVESTER.md"))) {
  const stages = Array.from(
    read(join(ROOT, "HARVESTER.md")).matchAll(/^## Stage \d+ — ([A-Z ]+)/gm)
  ).map((m) => m[1].trim())
  addNode({
    id: "pipeline:harvester",
    label: "HARVESTER",
    kind: "pipeline",
    lane: "lane:content",
    blurb:
      "Run once when a project ships: one mining pass produces one report every content lane reads.",
    source: "HARVESTER.md",
    meta: stages.length ? { stages: stages.join(" → ") } : {},
  })
  addLink("lane:content", "pipeline:harvester", "contains")
  for (const s of ["blogo", "casestudio", "scout"]) {
    if (skillNames.has(s)) addLink("pipeline:harvester", `skill:${s}`, "feeds")
  }
}

// ---------------------------------------------------------------- write

const counts = nodes.reduce<Record<string, number>>((acc, n) => {
  acc[n.kind] = (acc[n.kind] ?? 0) + 1
  return acc
}, {})

const payload = {
  scannedAt: new Date().toISOString(),
  plugin: { name: manifest.name, version: manifest.version, root: ROOT.replace(homedir(), "~") },
  counts,
  nodes,
  links,
}

writeFileSync(OUT, `${JSON.stringify(payload, null, 2)}\n`)
console.log(`hivemind: ${nodes.length} nodes, ${links.length} links → ${relative(process.cwd(), OUT)}`)
console.log(
  Object.entries(counts)
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n")
)
