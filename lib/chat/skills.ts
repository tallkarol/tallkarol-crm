import { HIVE, type HiveNode } from "@/lib/hivemind"

/**
 * The Skills tab and the slash palette.
 *
 * PURE — client components import this. What a skill IS comes from the
 * committed hive-mind scan (content/hivemind.json, `npm run hivemind:scan`),
 * so the chat cannot describe a command the plugin no longer has. What the
 * chat OFFERS for it — the click-to-insert forms and the one-line gate — is
 * UI copy and lives here, keyed by name. A node missing from the map still
 * renders from the scan, with a bare `/name ` to insert.
 *
 * Forms use two placeholder shapes the composer knows how to select:
 * `<required>` and `[optional]`. A form marked `run` needs no argument and
 * sends as it is.
 */

export type SkillKind = "command" | "skill" | "agent"

export type SkillForm = { text: string; run?: boolean }

export type SkillDoc = {
  id: string
  kind: SkillKind
  /** `clock`, `timeclock`, `purser`. */
  name: string
  /** As typed or addressed: `/clock`, `timeclock`, `@purser`. */
  label: string
  laneId: string
  lane: string
  /** One line, ours. */
  tagline: string
  /** The scan's first sentence of the description. */
  blurb: string
  /** The command's argument hint, verbatim from its frontmatter. */
  hint: string
  forms: SkillForm[]
  gate?: { kind: "read" | "write"; note: string }
  /** Labels of what it loads, from the scan's `loads` links. */
  uses: string[]
}

/** Foundation first, then the order a request moves through the lanes. */
const LANE_ORDER = [
  "lane:desks",
  "lane:foundation",
  "lane:planning",
  "lane:build",
  "lane:content",
  "lane:delivery",
  "lane:care",
  "lane:ledger",
]

type Copy = {
  tagline: string
  forms?: SkillForm[]
  gate?: SkillDoc["gate"]
}

const read = (note: string) => ({ kind: "read" as const, note })
const write = (note: string) => ({ kind: "write" as const, note })

const COPY: Record<string, Copy> = {
  /* ---------- commands ---------- */
  "command:client": {
    tagline: "Become a client's PM for this thread.",
    forms: [{ text: "/client <slug>" }, { text: "/client", run: true }],
    gate: read("Read-only. Sets context for every turn after it."),
  },
  "command:as": {
    tagline: "Address this thread to a desk — coach, pm, dreamer, a client manager, a product owner.",
    forms: [
      { text: "@coach <what's on your mind>" },
      { text: "@pm <what matters this week>" },
      { text: "@dreamer <the idea>" },
      { text: "@client-manager <client slug> <the question>" },
      { text: "@product-owner <product slug> <the question>" },
      { text: "/as <persona> [pack slug]" },
    ],
    gate: read("Every turn after it runs as that persona, with its files and pack in the prompt. CRM tools only."),
  },
  "command:lessons": {
    tagline: "Repeated mistakes into workspace rules.",
    forms: [
      { text: "/lessons", run: true },
      { text: "/lessons --client <slug> --since 90d" },
      { text: "/lessons show <id>" },
      { text: "/lessons status", run: true },
    ],
    gate: write("Proposes rules. Written to .claude/rules only after you approve."),
  },
  "command:blueprint": {
    tagline: "Plan a site before anyone builds it.",
    forms: [
      { text: "/blueprint <slug>" },
      { text: "/blueprint <slug> workbook" },
      { text: "/blueprint <slug> digest" },
      { text: "/blueprint", run: true },
    ],
    gate: write("Writes the Blueprint into the client pack."),
  },
  "command:spec-sheet": {
    tagline: "What a codebase is built with, from the files.",
    forms: [
      { text: "/spec-sheet", run: true },
      { text: "/spec-sheet <path> --client <slug>" },
      { text: "/spec-sheet . --codebase <slug>" },
    ],
    gate: write("Stores the sheet per client and codebase in the CRM."),
  },
  "command:punchlist": {
    tagline: "Email, doc or transcript into a punch list.",
    forms: [
      { text: "/punchlist <client> --from <file|mail-id|->" },
      { text: "/punchlist test --pending", run: true },
      { text: "/punchlist status", run: true },
    ],
    gate: write("Proposes the list. Files tasks only after you approve."),
  },
  "command:follow-up": {
    tagline: "This thread's next steps onto the board.",
    forms: [
      { text: "/follow-up", run: true },
      { text: "/follow-up <client> <what>" },
      { text: "/follow-up <client> --project <slug>" },
    ],
    gate: write("Proposes a numbered list. Submits after you approve."),
  },
  "command:leftoff": {
    tagline: "Post-its, and what is waiting on you.",
    forms: [
      { text: "/leftoff <text>" },
      { text: "/leftoff list", run: true },
      { text: "/leftoff search <words>" },
      { text: "/leftoff dismiss <ref>" },
    ],
    gate: write("A note writes one row. list and search are reads."),
  },
  "command:inspect": {
    tagline: "A medium agent's work, reviewed by the strongest model.",
    forms: [
      { text: "/inspect", run: true },
      { text: "/inspect --session <ref>" },
      { text: "/inspect --since 2h --path <glob>" },
      { text: "/inspect pick <run> <nums|all|auto>" },
      { text: "/inspect apply <run>" },
      { text: "/inspect history", run: true },
    ],
    gate: write("Findings first. Fixes apply only to what you pick."),
  },
  "command:styleguide": {
    tagline: "A site's design system into Figma, read-only.",
    forms: [
      { text: "/styleguide <site url>" },
      { text: "/styleguide <site url> --wp <root> --page <url>" },
    ],
    gate: read("Reads the site. Writes only to Figma."),
  },
  "command:briefs": {
    tagline: "Search demand into briefs you pick from.",
    forms: [
      { text: "/briefs <slug>" },
      { text: "/briefs <slug> --month <YYYY-MM> --limit 5" },
      { text: "/briefs", run: true },
    ],
    gate: read("Pitches only. Never drafts, never publishes."),
  },
  "command:launch-audit": {
    tagline: "Pre- or post-launch audit, as a handoff report.",
    forms: [
      { text: "/launch-audit pre <url>" },
      { text: "/launch-audit post <url> --baseline <run> --push" },
    ],
    gate: write("Stores the report in the CRM with --push."),
  },
  "command:care": {
    tagline: "The weekly cycle, or the monthly report.",
    forms: [
      { text: "/care <slug>" },
      { text: "/care <slug> report" },
      { text: "/care", run: true },
    ],
    gate: write("Audit first. Only approved operations are applied."),
  },
  "command:clock": {
    tagline: "Clock in and out of billable work.",
    forms: [
      { text: "/clock in <client> [project]" },
      { text: "/clock out", run: true },
      { text: "/clock status", run: true },
      { text: "/clock log <client> [YYYY-MM]" },
    ],
    gate: write("Writes the timeclock directly. Honest-clock rules apply."),
  },
  "command:invoice": {
    tagline: "Draft an invoice from the timeclock.",
    forms: [{ text: "/invoice <client>" }, { text: "/invoice <client> <YYYY-MM>" }],
    gate: write("Never sends, never adjusts a time on its own."),
  },
  "command:estimate": {
    tagline: "Price future work from ledger history.",
    forms: [
      { text: "/estimate <client> <what the work is>" },
      { text: "/estimate new client, <what the work is>" },
    ],
    gate: read("Records the picked estimate for calibration."),
  },
  "command:log-session": {
    tagline: "Agent hours onto the timesheet.",
    forms: [
      { text: "/log-session <client>" },
      { text: "/log-session <client> --project <slug>" },
      { text: "/log-session", run: true },
    ],
    gate: write("Proposes. Written to the CRM only after you approve."),
  },
  "command:session-log": {
    tagline: "One invoice-voice line per conversation.",
    forms: [
      { text: "/session-log", run: true },
      { text: "/session-log <ref>" },
      { text: "/session-log --sweep", run: true },
    ],
    gate: write("Only the summary leaves the Mac."),
  },

  /* ---------- skills without a slash ---------- */
  "skill:team-charter": {
    tagline: "The PM's operating manual.",
    forms: [{ text: "Load the team charter and plan this with the pods", run: true }],
    gate: read("Loads when you ask to orchestrate or plan with the team."),
  },
  "skill:client-pack": { tagline: "How brand context loads.", gate: read("Read-only.") },
  "skill:browser-check": {
    tagline: "Headless Chrome over CDP, zero dependencies.",
    forms: [{ text: "Check this page in a browser and screenshot it: <url>" }],
    gate: read("Read-only against the page."),
  },
  "skill:design-system": {
    tagline: "Accessibility floors and token rules.",
    gate: read("Loads before any UI work."),
  },
  "skill:scout": {
    tagline: "Today's fixes into blog pitches.",
    forms: [{ text: "Scout today's work for blog nuggets", run: true }],
    gate: read("Pitches only."),
  },
  "skill:blogo": {
    tagline: "Rankmaster content writer.",
    forms: [{ text: "Draft a post with blogo from <brief or topic>" }],
    gate: write("Drafts only. Never publishes."),
  },
  "skill:casestudio": {
    tagline: "Codebase into case study.",
    forms: [{ text: "Turn <project> into a case study" }],
    gate: write("Drafts only."),
  },
  "skill:demand-scout": { tagline: "What people search, mapped to the claim bank.", gate: read("Pitches only.") },
  "skill:timeclock": { tagline: "The ledger lane's data layer.", gate: write("What /clock and /invoice run on.") },
  "skill:estimator": { tagline: "Comparables, calibration, three price options.", gate: read("Internal decision support.") },
  "skill:website-care": { tagline: "The care lane's playbook.", gate: write("Approved operations only.") },
  "skill:inspector": { tagline: "The escalation lane's tooling.", gate: write("Findings first, fixes on your pick.") },
  "skill:launch-audit": { tagline: "Eighteen measured checks, pass, watch or fail." },
  "skill:leftoff": { tagline: "The board every conversation reports to." },
  "skill:lessons": { tagline: "What recurred, costed, into rules." },
  "skill:log-session": { tagline: "The meter's unlogged time, weighted." },
  "skill:session-log": { tagline: "The post-session summariser." },
  "skill:punchlist": { tagline: "Their words verbatim, our fix, one task each." },
  "skill:follow-up": { tagline: "Tasks and events, idempotent on the reference." },
  "skill:blueprint": { tagline: "Interview or workbook, one Blueprint." },
  "skill:spec-sheet": { tagline: "Versions from manifests and lockfiles." },
  "skill:styleguide": { tagline: "Tokens and button states, measured." },

  /* ---------- agents ---------- */
  "agent:ux-builder": {
    tagline: "Design and implementation as one role.",
    forms: [{ text: "Have ux-builder build <what>" }],
    gate: write("Edits code in the repo it is pointed at."),
  },
  "agent:qa": {
    tagline: "Runs builds and tests, hunts regressions.",
    forms: [{ text: "Have qa verify <what changed>" }],
    gate: write("Small fixes applied directly, all reported."),
  },
  "agent:security-reviewer": {
    tagline: "Auth, secrets, headers, dependencies.",
    forms: [{ text: "Security review of <path or feature>" }],
    gate: read("Cannot edit anything."),
  },
  "agent:db-specialist": {
    tagline: "Schema, migrations, query performance.",
    forms: [{ text: "Have db-specialist look at <table or query>" }],
    gate: write("Migrations proposed, destructive ops reported."),
  },
  "agent:content-runner": { tagline: "Runs Blogo, CaseStudio and Scout from briefs.", gate: write("Drafts only.") },
  "agent:docent": {
    tagline: "Feature guides at handoff.",
    forms: [{ text: "Have docent survey <app> for handoff guides" }],
    gate: write("Recommends and waits, then writes what you approved."),
  },
  "agent:caretaker": { tagline: "WebsiteCare auditor and maintainer.", gate: write("Approved maintenance only, backup-first.") },
  "agent:purser": {
    tagline: "Reconciles the timeclock before money moves.",
    forms: [{ text: "Have purser reconcile <client> for <YYYY-MM>" }],
    gate: write("Never sends an invoice."),
  },
  "agent:inspector": { tagline: "The strongest model, at max effort, over a medium agent's work.", gate: read("Phase one is read-only.") },
}

const KINDS: SkillKind[] = ["command", "skill", "agent"]

function laneLabel(id: string | undefined): string {
  const lane = HIVE.nodes.find((n) => n.kind === "lane" && n.id === id)
  return lane?.label ?? "Other"
}

function labelFor(node: HiveNode): string {
  if (node.kind === "command") return node.label.startsWith("/") ? node.label : `/${node.label}`
  if (node.kind === "agent") return `@${node.label}`
  return node.label
}

function usesFor(id: string): string[] {
  const byId = new Map(HIVE.nodes.map((n) => [n.id, n]))
  return HIVE.links
    .filter((l) => l.source === id && l.rel === "loads")
    .map((l) => byId.get(l.target))
    .filter((n): n is HiveNode => !!n && (n.kind === "skill" || n.kind === "agent"))
    .map((n) => n.label)
}

/** Every command, skill and agent the scan knows, in lane order. */
export const SKILL_DOCS: SkillDoc[] = HIVE.nodes
  .filter((n): n is HiveNode & { kind: SkillKind } => KINDS.includes(n.kind as SkillKind))
  .map((node) => {
    const copy = COPY[node.id]
    const name = node.label.replace(/^[/@]/, "")
    return {
      id: node.id,
      kind: node.kind,
      name,
      label: labelFor(node),
      laneId: node.lane ?? "",
      lane: laneLabel(node.lane),
      tagline: copy?.tagline ?? node.blurb ?? "",
      blurb: node.blurb ?? "",
      hint: node.meta?.arguments ?? "",
      forms: copy?.forms ?? (node.kind === "command" ? [{ text: `${labelFor(node)} ` }] : []),
      gate: copy?.gate,
      uses: usesFor(node.id),
    }
  })
  .sort((a, b) => {
    const lane = LANE_ORDER.indexOf(a.laneId) - LANE_ORDER.indexOf(b.laneId)
    if (lane !== 0) return lane
    const kind = KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind)
    if (kind !== 0) return kind
    return a.name.localeCompare(b.name)
  })

export const SKILL_LANES = LANE_ORDER.map((id) => ({
  id,
  label: laneLabel(id),
  blurb: HIVE.nodes.find((n) => n.id === id)?.blurb ?? "",
})).filter((lane) => SKILL_DOCS.some((d) => d.laneId === lane.id))

export const COMMAND_DOCS = SKILL_DOCS.filter((d) => d.kind === "command")

const COMMAND_NAMES = new Set(COMMAND_DOCS.map((d) => d.name))

const COMMAND_RE = /^\/([a-z][a-z0-9-]*)(?:\s+([\s\S]*))?$/

/**
 * `/clock in gdi` → { name: "clock", args: "in gdi" }. Only names the scan
 * knows count, so a stray "/shrug" stays an ordinary chat message.
 */
export function parseCommand(text: string): { name: string; args: string } | null {
  const m = COMMAND_RE.exec(text.trim())
  if (!m || !COMMAND_NAMES.has(m[1])) return null
  return { name: m[1], args: (m[2] ?? "").trim() }
}

/** The first `<required>` or `[optional]` blank in a form, for the composer to select. */
export function firstBlank(text: string): { start: number; end: number } | null {
  const m = /<[^>]+>|\[[^\]]+\]/.exec(text)
  return m ? { start: m.index, end: m.index + m[0].length } : null
}

/* ---------- the empty thread ---------- */

export type Starter = {
  title: string
  sub: string
  icon: "pin" | "inbox" | "clock" | "activity" | "reports" | "shield" | "punch" | "revenue" | "file"
  text: string
  /** Send as it is; otherwise drop into the composer with the first blank selected. */
  send?: boolean
}

export const ASK_STARTERS: Starter[] = [
  {
    title: "What's waiting on me?",
    sub: "The left-off board: post-its, blocked sessions, approvals.",
    icon: "pin",
    text: "What's waiting on me?",
    send: true,
  },
  {
    title: "What's in agent@?",
    sub: "Live read of the agent mailbox. Nothing filed until you say.",
    icon: "inbox",
    text: "What's in agent@?",
    send: true,
  },
  {
    title: "Log time to a client",
    sub: "Say the client, hours and day. You confirm the entry.",
    icon: "clock",
    text: "Log [hours]h to [client] for [what], [day]",
  },
]

export const CLIENT_STARTERS: Starter[] = [
  {
    title: "What did I ship for [client] last week?",
    sub: "Sessions and ledger entries, summarised.",
    icon: "activity",
    text: "What did I ship for [client] last week?",
  },
  {
    title: "Run the [report] for [client]",
    sub: "Refreshes the data, renders the doc, waits for you to send it.",
    icon: "reports",
    text: "Run the [report] for [client]",
  },
  {
    title: "Run the care package for [project]",
    sub: "Read-only audit first, then a fix list you pick from.",
    icon: "shield",
    text: "Run the care package for [project]",
  },
  {
    title: "What's open on [client]'s punch list?",
    sub: "Items by state, and the tests that still need a run.",
    icon: "punch",
    text: "What's open on [client]'s punch list?",
  },
  {
    title: "Where does [client] stand this month?",
    sub: "Hours logged, unpaid invoices, open tasks, next meeting.",
    icon: "revenue",
    text: "Where does [client] stand this month?",
  },
  {
    title: "Draft the invoice for [client]",
    sub: "Purser reconciles the period first. You pick the fixes.",
    icon: "file",
    text: "Draft the invoice for [client]",
  },
]

/** The chips under the starters: the commands most worth one click. */
export const QUICK_COMMANDS = [
  "/clock status",
  "/leftoff list",
  "/care",
  "/log-session",
  "/inspect",
]
