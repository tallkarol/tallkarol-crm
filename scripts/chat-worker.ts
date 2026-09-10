import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import { Agent, CursorAgentError } from "@cursor/sdk"
import type { SDKCustomTool, SDKJsonValue, ToolName } from "@cursor/sdk"
import { BRIEF_PREFIX } from "@/lib/chat/task-brief"
import { loadLocalEnv } from "@/lib/load-env"

/**
 * The chat worker.
 *
 * Runs on Karol's Mac, signed into Cursor, and is the reason any of this is
 * affordable: Composer and Grok are reachable through the Cursor SDK against
 * the Ultra allowance, and not through any API a Railway process could call.
 * So the CRM decides WHAT to run and the worker does the running.
 *
 * The split is also the security boundary. This process holds a device token
 * and nothing else — no database URL, no Google credentials. Every tool it
 * offers the model is a callback that fetches the CRM, and every write the
 * CRM parks for Karol. A compromised worker can waste tokens and lie in a
 * chat bubble; it cannot touch the timesheet.
 *
 *   npm run chat:worker
 *
 * Needs CRM_URL and CRM_DEVICE_TOKEN (Settings → Devices). See CHAT.md.
 */

loadLocalEnv()

const CRM = process.env.CRM_URL || "http://localhost:3001"
const TOKEN = process.env.CRM_DEVICE_TOKEN || ""
const API_KEY = process.env.CURSOR_API_KEY || ""
const NAME = process.env.CHAT_WORKER_NAME || `mac-${process.pid}`
const IDLE_MS = Number(process.env.CHAT_WORKER_IDLE_MS || 2500)
const CWD = process.env.CHAT_WORKER_REPO || process.cwd()

/**
 * Where the hive mind's commands and skills are installed — the directory
 * holding `commands/<name>.md` and `skills/<name>/SKILL.md`, normally
 * ~/.claude (global symlinks into daedalus-hive-mind).
 *
 * Unset means skill turns are REFUSED, and that is the point of the
 * variable: a skill turn hands the model shell and edit on this Mac, which
 * a chat turn never gets. Turning that on is a decision the worker's owner
 * makes in its environment, not something the CRM can switch on remotely.
 */
const SKILLS = process.env.CHAT_WORKER_SKILLS || ""

/** What a skill turn may use. A chat turn stays on `["mcp"]`. */
const SKILL_TOOLS: ToolName[] = ["mcp", "read", "shell", "grep", "glob", "ls", "edit"]

/**
 * Where a task turn works. A solve never runs in one of Karol's checkouts —
 * another session may be mid-edit there — so each task gets a git worktree
 * under this directory, on its own branch, cut from the checkout's HEAD.
 */
const SOLVE_DIR = process.env.CHAT_WORKER_SOLVE_DIR || join(homedir(), ".daedalus", "solve")

/**
 * The left-off board's map of working copies to clients. One file, one
 * grammar, read here the way its own scripts read it, so the board, the
 * meter and the solver cannot disagree about whose repo a directory is.
 */
const REPOS_CONF = join(homedir(), ".daedalus", "leftoff-repos.conf")

/** A task turn gets what a skill turn gets: it has code to read, run and change. */
const SOLVE_TOOLS: ToolName[] = SKILL_TOOLS
/** Where there is no worktree to protect Karol's copy, edit stays off. */
const SOLVE_READ_TOOLS: ToolName[] = ["mcp", "read", "shell", "grep", "glob", "ls"]

if (!TOKEN) {
  console.error("CRM_DEVICE_TOKEN missing — issue one at Settings → Devices.")
  process.exit(1)
}
if (!API_KEY) {
  console.error("CURSOR_API_KEY missing — cursor.com/dashboard/integrations.")
  process.exit(1)
}

type QueuedTurn = {
  id: string
  threadId: string
  jobType: string
  rung: number
  model: string
  modelKey: string
  effort: string
  pool: string
}

type ToolSchema = {
  name: string
  description: string
  mutating: boolean
  parameters: Record<string, unknown>
}

/** A `task` turn's cargo: the task as it is now, and what maps it to a repo. */
type TaskContext = {
  id: string
  title: string
  url: string
  brief: string
  branch: string
  client: { slug: string; name: string } | null
  project: { slug: string; name: string } | null
  product: { slug: string; name: string } | null
}

type Claim = {
  turn: QueuedTurn | null
  messages?: { role: string; agent: string; body: string; at: string }[]
  tools?: ToolSchema[]
  /** Set on a `skill` turn: the command the CRM parsed from the message. */
  command?: { name: string; args: string } | null
  /** Set on a `task` turn. Null there means the task was deleted under the thread. */
  task?: TaskContext | null
}

/**
 * The timeout is load-bearing, not defensive dressing.
 *
 * The poll is awaited inside the loop, so a request that never settles stops
 * the worker dead — and the heartbeat, which runs on its own timer, would go
 * on reporting a healthy worker that had not claimed anything in hours. That
 * is worse than being down, because the page would say "thinking". One poll
 * was observed hanging for 31 minutes. Failing the call keeps the loop moving.
 */
const REQUEST_TIMEOUT_MS = 30_000

async function crm(path: string, body: unknown) {
  const response = await fetch(`${CRM}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`${path} → ${response.status} ${await response.text()}`)
  }
  return response.json()
}

/**
 * Every CRM tool, as an in-process callback.
 *
 * `customTools` execute in this process rather than through an MCP server, so
 * they never hit interactive approval — which is what we want, because the
 * approval that matters is Karol's on the CRM side, not a tool-use prompt
 * here. Each one is a thin fetch; the logic stays on the server.
 */
function customTools(turn: QueuedTurn, tools: ToolSchema[]) {
  const map: Record<string, SDKCustomTool> = {}
  for (const tool of tools) {
    map[tool.name] = {
      description: tool.mutating
        ? `${tool.description} PROPOSES ONLY — returns "pending" and waits for Karol.`
        : tool.description,
      inputSchema: tool.parameters as Record<string, SDKJsonValue>,
      annotations: {
        readOnlyHint: !tool.mutating,
        destructiveHint: false,
        idempotentHint: true,
      },
      async execute(args) {
        const outcome = await crm("/api/chat/tools", {
          turnId: turn.id,
          name: tool.name,
          args,
        })
        return JSON.stringify(outcome)
      },
    }
  }
  return map
}

function transcript(claim: Claim): string {
  return (claim.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "Karol" : "You"}: ${m.body}`)
    .join("\n\n")
}

/* ---------- where a task turn works ---------- */

type RepoEntry = { dir: string; slug: string; git: boolean }

type Resolution =
  | { kind: "worktree"; repo: string; cwd: string; branch: string; fresh: boolean }
  | { kind: "readonly"; repo: string; cwd: string }
  | { kind: "ambiguous"; candidates: RepoEntry[] }
  | { kind: "none"; slug: string | null }

/** shlex-style split: double and single quotes, backslash escapes outside single quotes. */
function shellSplit(line: string): string[] {
  const out: string[] = []
  let cur = ""
  let quote: '"' | "'" | null = null
  let has = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quote) {
      if (ch === quote) {
        quote = null
        continue
      }
      if (ch === "\\" && quote === '"' && i + 1 < line.length) {
        cur += line[++i]
        continue
      }
      cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      has = true
      continue
    }
    if (ch === "\\" && i + 1 < line.length) {
      cur += line[++i]
      has = true
      continue
    }
    if (/\s/.test(ch)) {
      if (has) {
        out.push(cur)
        cur = ""
        has = false
      }
      continue
    }
    cur += ch
    has = true
  }
  if (has) out.push(cur)
  return out
}

function expandHome(p: string): string {
  if (p === "~") return homedir()
  if (p.startsWith("~/")) return resolve(join(homedir(), p.slice(2)))
  return resolve(p)
}

function isGitDir(dir: string): boolean {
  return existsSync(join(dir, ".git"))
}

function readPin(dir: string): string {
  try {
    return readFileSync(join(dir, ".claude", "client"), "utf8").split("\n")[0].trim().toLowerCase()
  } catch {
    return ""
  }
}

/** Explicit slug on the conf line, else the nearest `.claude/client` at or above the dir. */
function clientFor(dir: string, overrides: Map<string, string>): string {
  const pinned = overrides.get(dir)
  if (pinned) return pinned
  const home = homedir()
  let here = dir
  for (;;) {
    const slug = readPin(here)
    if (slug) return slug
    const up = dirname(here)
    if (here === home || up === here) return ""
    here = up
  }
}

/** A Local by Flywheel site is not a repo; its themes and plugins are. */
function wpRepos(site: string): string[] {
  const out: string[] = []
  for (const kind of ["themes", "plugins"]) {
    const parent = join(site, "app", "public", "wp-content", kind)
    let names: string[] = []
    try {
      names = readdirSync(parent)
    } catch {
      continue
    }
    for (const name of names.sort()) {
      const dir = join(parent, name)
      if (isGitDir(dir)) out.push(dir)
    }
  }
  return out
}

/**
 * The conf, read the way the board's git-dirty.sh reads it: `root <dir>`
 * scans one level for git repos, `repo <dir> [slug]` names one, `skip <dir>`
 * drops one. A listed directory that is not a repo but holds a WordPress
 * install contributes its theme and plugin repos instead — one level under
 * themes/ and plugins/, no deeper.
 */
function readRepos(): RepoEntry[] {
  let text = ""
  try {
    text = readFileSync(REPOS_CONF, "utf8")
  } catch {
    return []
  }

  const roots: string[] = []
  const listed: string[] = []
  const skips = new Set<string>()
  const overrides = new Map<string, string>()
  for (const raw of text.split("\n")) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const [kind, path, slug] = shellSplit(line)
    if (!kind || !path) continue
    const dir = expandHome(path)
    if (kind === "root") roots.push(dir)
    else if (kind === "repo") {
      listed.push(dir)
      if (slug) overrides.set(dir, slug.toLowerCase())
    } else if (kind === "skip") skips.add(dir)
  }

  const found = [...listed]
  for (const root of roots) {
    let names: string[] = []
    try {
      names = readdirSync(root)
    } catch {
      continue
    }
    for (const name of names.sort()) {
      const dir = join(root, name)
      if (isGitDir(dir)) found.push(dir)
    }
  }

  const seen = new Set<string>()
  const entries: RepoEntry[] = []
  for (const dir of found) {
    if (seen.has(dir) || skips.has(dir)) continue
    seen.add(dir)
    const slug = clientFor(dir, overrides)
    if (isGitDir(dir)) {
      entries.push({ dir, slug, git: true })
      continue
    }
    const nested = wpRepos(dir)
    if (nested.length === 0) {
      entries.push({ dir, slug, git: false })
      continue
    }
    for (const sub of nested) {
      if (seen.has(sub) || skips.has(sub)) continue
      seen.add(sub)
      entries.push({ dir: sub, slug: overrides.get(sub) ?? slug, git: true })
    }
  }
  return entries
}

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
}

/**
 * Which working copy a task is about.
 *
 * The client's slug picks the candidates; a house task with a product looks
 * for the product's repo among Karol's own. Several left: the project's name
 * narrows them, then anything Karol named in the thread — so answering
 * "the gutenblocks one" is enough for the next turn to land there. Still
 * several is not an error: the model gets the list and asks.
 */
function resolveRepo(
  claim: Claim,
  task: TaskContext
): { pick: RepoEntry | null; candidates: RepoEntry[]; slug: string | null } {
  const slug = task.client?.slug ?? (task.product ? "tallkarol" : null)
  if (!slug) return { pick: null, candidates: [], slug: null }

  let candidates = readRepos().filter((r) => r.slug === slug)
  if (!task.client && task.product) {
    const want = tokens(task.product.slug)
    candidates = candidates.filter((r) => {
      const name = basename(r.dir).toLowerCase()
      return want.some((t) => name.includes(t))
    })
  }
  if (candidates.length > 1 && task.project) {
    const want = new Set([...tokens(task.project.slug), ...tokens(task.project.name)])
    const narrowed = candidates.filter((r) => tokens(basename(r.dir)).some((t) => want.has(t)))
    if (narrowed.length > 0) candidates = narrowed
  }
  if (candidates.length > 1) {
    // Newest first, whole words only; the brief's own "CRM: /tasks/…" line
    // is dropped so it cannot vote for a repo called crm.
    const said = (claim.messages ?? [])
      .filter((m) => m.role === "user")
      .map((m) =>
        (m.body.startsWith(BRIEF_PREFIX) ? m.body.replace(/^CRM: .*$/m, "") : m.body).toLowerCase()
      )
      .reverse()
    for (const body of said) {
      const named = candidates.filter((r) => mentions(body, basename(r.dir)))
      if (named.length === 1) {
        candidates = named
        break
      }
    }
  }
  if (candidates.length > 1 && candidates.some((c) => c.git)) {
    candidates = candidates.filter((c) => c.git)
  }
  return { pick: candidates.length === 1 ? candidates[0] : null, candidates, slug }
}

/** `name` as a whole word in `text` — "crm" in "the crm sidebar", not in "scrum". */
function mentions(text: string, name: string): boolean {
  const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(text)
}

function git(args: string[], cwd: string): { ok: boolean; out: string; err: string } {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" })
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() }
}

/**
 * One worktree per task, cut from the checkout's HEAD onto the solve branch
 * and reused across turns, so the second message continues where the first
 * left off. `worktree add` writes to .git and the new directory only — the
 * checkout's working tree is never touched. node_modules is symlinked in
 * when the checkout has one, so the project's own checks can run without a
 * fresh install. Paths go to git as arguments, never through a shell:
 * `~/Local Sites` has a space in it.
 */
function ensureWorktree(repo: string, branch: string): { cwd: string; fresh: boolean } {
  const short = branch.split("/").pop() ?? branch
  const dest = join(SOLVE_DIR, basename(repo), short)
  if (existsSync(join(dest, ".git"))) return { cwd: dest, fresh: false }

  mkdirSync(dirname(dest), { recursive: true })
  git(["worktree", "prune"], repo)
  const exists = git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], repo).ok
  const added = exists
    ? git(["worktree", "add", dest, branch], repo)
    : git(["worktree", "add", "-b", branch, dest, "HEAD"], repo)
  if (!added.ok) {
    throw new Error(`Could not cut a worktree of ${repo}: ${added.err || added.out || "git failed"}`)
  }

  const modules = join(repo, "node_modules")
  if (existsSync(modules) && !existsSync(join(dest, "node_modules"))) {
    try {
      symlinkSync(modules, join(dest, "node_modules"))
    } catch {
      // The checks may want an install; the model will find out and say so.
    }
  }
  return { cwd: dest, fresh: true }
}

function placeFor(claim: Claim, task: TaskContext): Resolution {
  const { pick, candidates, slug } = resolveRepo(claim, task)
  if (pick) {
    if (!pick.git) return { kind: "readonly", repo: pick.dir, cwd: pick.dir }
    const { cwd, fresh } = ensureWorktree(pick.dir, task.branch)
    return { kind: "worktree", repo: pick.dir, cwd, branch: task.branch, fresh }
  }
  if (candidates.length > 1) return { kind: "ambiguous", candidates }
  return { kind: "none", slug }
}

function describe(where: Resolution): string {
  switch (where.kind) {
    case "worktree":
      return `${where.repo} @ ${where.cwd} (${where.branch}${where.fresh ? ", new" : ""})`
    case "readonly":
      return `${where.cwd} (not a repo, edit off)`
    case "ambiguous":
      return `${where.candidates.length} candidates, asking`
    case "none":
      return where.slug ? `no repo mapped for ${where.slug}` : "no client, CRM tools only"
  }
}

/**
 * A task turn's prompt: the task, where the model stands, the rules of the
 * worktree, and the shape of the report. The brief comes from the claim,
 * re-read from the table, so it says what the task says now.
 */
function taskPrompt(claim: Claim, task: TaskContext, where: Resolution): string {
  const place =
    where.kind === "worktree"
      ? [
          `Repository: ${where.repo}`,
          `You work in a git worktree of it: ${where.cwd}, on branch ${where.branch}, cut from the checkout's HEAD.`,
          "Edit, run and commit ONLY inside that worktree. Never touch the repository's own checkout — another session may be mid-edit there, and anything uncommitted there is invisible to you by design.",
          "Commit on the solve branch as you go. Never push. Never check out, rebase onto or merge into main.",
        ]
      : where.kind === "readonly"
        ? [
            `Directory: ${where.cwd} — a site install, not a git repository, so there is no worktree to protect Karol's copy and EDIT IS OFF.`,
            "Read, run the project's checks, diagnose, and write the fix as a proposal Karol applies. Do not modify files through the shell either.",
          ]
        : where.kind === "ambiguous"
          ? [
              "Several working copies map to this client. Pick the one the task is about from its text; if you cannot tell, ask Karol which one and stop.",
              ...where.candidates.map((c) => `  - ${c.dir}${c.git ? "" : " (not a git repo)"}`),
              "You have not been given a worktree yet, so this turn is read-only: name the repo you would use and what you would do in it. Once Karol names one, the next turn runs there.",
            ]
          : [
              where.slug
                ? `No working copy on this Mac is mapped to client "${where.slug}", so you have the CRM tools only. Say so in one line — Karol can map one with a \`repo <dir> ${where.slug}\` line in ~/.daedalus/leftoff-repos.conf.`
                : "This task has no client, so there is no repository to work in; you have the CRM tools only. Say so in one line.",
            ]

  return [
    "You are solving a Tall Karol CRM task for Karol, on his Mac.",
    "",
    "--- the task ---",
    "",
    task.brief,
    "",
    "--- where you are ---",
    "",
    ...place,
    "",
    "--- rules ---",
    "",
    "Run the project's own checks — tests, typecheck, build, whatever it has — before you claim anything works. If you could not run them, say that.",
    "Do not mark the task done; Karol does that. Do not create tasks or tickets for yourself.",
    "The CRM tools are available. Any that PROPOSES ONLY parks the write for Karol's approval — say so in one line and do not claim it is done.",
    "",
    "Reply in Karol's voice: direct, plain, short. Four headings and nothing else:",
    "Found — what the problem actually was.",
    "Changed — the files touched, the branch and the worktree path; or 'nothing'.",
    "Verified — exactly what you ran and what it said.",
    "Left for Karol — what needs his hand, his decision, or a merge.",
    "",
    "--- conversation so far ---",
    "",
    transcript(claim),
  ].join("\n")
}

/**
 * A skill turn's prompt IS the command file, the way Claude Code runs a
 * slash command: frontmatter stripped, `$ARGUMENTS` filled in, the rest
 * followed as written. The model gets told where the skills live and is
 * expected to read them rather than recall them.
 */
function skillPrompt(claim: Claim, command: { name: string; args: string }): string {
  const raw = readFileSync(join(SKILLS, "commands", `${command.name}.md`), "utf8")
  const body = raw
    .replace(/^---[\s\S]*?\n---\n?/, "")
    .replace(/\$ARGUMENTS/g, command.args || "(no arguments)")
    .trim()

  return [
    `You are running Karol's /${command.name} command from the Tall Karol CRM chat, on his Mac, in ${CWD}.`,
    "",
    `Skills are installed at ${join(SKILLS, "skills")}/<name>/SKILL.md. Read a skill's file before following it — never guess what it says. Its scripts run from that directory with the shell.`,
    "",
    "The CRM tools are available too. Any that PROPOSES ONLY parks the write for Karol's approval — say so in one line and do not claim it is done.",
    "",
    "When finished, reply in Karol's voice: direct, plain, short. State the outcome, and give him any numbered list he has to pick from.",
    "",
    "--- command ---",
    "",
    body,
    "",
    "--- conversation so far ---",
    "",
    transcript(claim),
  ].join("\n")
}

function buildPrompt(claim: Claim): string {
  return [
    "You are Karol's assistant inside the Tall Karol CRM.",
    "",
    "Answer in his voice: direct, plain, no hype and no filler. Short answers",
    "are correct answers. Use the tools for anything factual — never guess at",
    "hours, dates, mail or client names, and call list_clients when you need",
    "to turn a name into a slug.",
    "",
    "Mail: peek_agent_mailbox for live agent@ (id + headers). read_mail pulls",
    "the body from agent@ by that id or by subject — do not ask Karol to sync",
    "just to read. list_inbox / search_mail are the CRM copies. sync_inbox",
    "files copies into inbox_mail (proposed). You never send, delete, or flag",
    "mail. You never read karol@.",
    "",
    "Calendar: list_calendar to read. create_calendar_event to propose a block",
    "(Karol confirms). Personal / life / girlfriend events go on Personal",
    "(karolzbuczek@gmail.com) — that is the default. Work / client meetings",
    "go on Remote. Zone defaults to Europe/Warsaw.",
    "",
    "Inspiration: pin_inspiration when Karol sends a URL (or image) and says",
    "it is inspiration for something — that something is the board name.",
    "list_inspiration to see what is already on a board.",
    "",
    "Tools whose description says PROPOSES ONLY do not perform the action.",
    "They return `pending`. When one does, tell Karol exactly what is waiting",
    "for him to confirm, in one line, and do not claim it is done.",
    "",
    "Conversation so far:",
    "",
    transcript(claim),
  ].join("\n")
}

async function runTurn(claim: Claim) {
  const turn = claim.turn
  if (!turn) return

  const label = turn.id.slice(0, 8)
  console.log(
    `[${label}] ${turn.jobType} rung ${turn.rung} → ${turn.model}${turn.effort ? ` (${turn.effort})` : ""}`
  )

  /**
   * A skill turn is refused, not degraded, when this worker cannot run it:
   * answering "/clock status" with a chat model that has no shell would
   * produce a confident guess about the timeclock, which is worse than an
   * honest error in the thread. No detector, so nothing escalates.
   */
  const command = turn.jobType === "skill" ? claim.command ?? null : null
  if (turn.jobType === "skill") {
    const refusal = !command
      ? "The CRM could not tell which command this was."
      : !SKILLS
        ? "This worker was started without CHAT_WORKER_SKILLS, so skill turns are off. Set it to the directory holding commands/ and skills/ (normally ~/.claude) and restart the worker."
        : !existsSync(join(SKILLS, "commands", `${command.name}.md`))
          ? `No command file for /${command.name} under ${SKILLS}/commands.`
          : null
    if (refusal) {
      console.error(`[${label}] refused: ${refusal}`)
      await crm(`/api/chat/turns/${turn.id}`, { error: refusal }).catch(() => {})
      return
    }
  }

  /**
   * A task turn opens the same door a skill turn does — shell and edit on
   * this Mac — so it stands behind the same grant, and is refused the same
   * way when the task under the thread is gone.
   */
  const task = turn.jobType === "task" ? claim.task ?? null : null
  if (turn.jobType === "task") {
    const refusal = !SKILLS
      ? "This worker was started without CHAT_WORKER_SKILLS, so solve turns are off — a task turn needs the grant a /command gets. Set it (normally ~/.claude) and restart the worker."
      : !task
        ? "This thread's task no longer exists, so there is nothing left to solve."
        : null
    if (refusal) {
      console.error(`[${label}] refused: ${refusal}`)
      await crm(`/api/chat/turns/${turn.id}`, { error: refusal }).catch(() => {})
      return
    }
  }

  try {
    /**
     * `tools: ["mcp"]` is deliberate and load-bearing for a chat turn: it
     * leaves the model with the CRM callbacks and NOTHING else — no shell,
     * no edit, no read. A chat turn has no business touching the filesystem,
     * and the cheapest way to guarantee that is to not hand over the tool.
     *
     * A skill turn is the one exception, gated above: the command file it
     * follows needs to read a SKILL.md and run its scripts, so it gets the
     * toolset Claude Code would have had. A task turn is the other, gated the
     * same way, and it gets the toolset only inside a worktree it was cut —
     * in a directory that is not a repo, edit stays off; with no repo at all,
     * it is back to the CRM callbacks.
     */
    let prompt = buildPrompt(claim)
    let tools: ToolName[] = ["mcp"]
    let cwd = CWD
    let agent: string | null = null

    if (command) {
      prompt = skillPrompt(claim, command)
      tools = SKILL_TOOLS
      agent = `/${command.name}`
    } else if (task) {
      const where = placeFor(claim, task)
      prompt = taskPrompt(claim, task, where)
      tools =
        where.kind === "worktree" ? SOLVE_TOOLS : where.kind === "none" ? ["mcp"] : SOLVE_READ_TOOLS
      cwd = where.kind === "worktree" || where.kind === "readonly" ? where.cwd : CWD
      agent = "Solver"
      console.log(`[${label}] task → ${describe(where)}`)
    }

    const result = await Agent.prompt(prompt, {
      apiKey: API_KEY,
      model: {
        id: turn.model,
        ...(turn.effort
          ? { params: [{ id: "reasoningEffort", value: turn.effort }] }
          : {}),
      },
      tools,
      name: `chat ${label}`,
      idempotencyKey: turn.id,
      local: {
        cwd,
        // Inline config only. Loading Karol's project rules into a CRM
        // question would spend tokens on WordPress conventions.
        settingSources: [],
        customTools: customTools(turn, claim.tools ?? []),
      },
    })

    if (result.status !== "finished") {
      /**
       * The run executed and failed. That IS evidence about the model — but
       * a chat turn has no detector saying the ANSWER was wrong, only that
       * the run died, so it still does not earn a rung. Ladders that do have
       * detectors pass one here.
       */
      await crm(`/api/chat/turns/${turn.id}`, {
        error: result.error?.message ?? `run ${result.status}`,
      })
      console.error(`[${label}] run ${result.status}`)
      return
    }

    await crm(`/api/chat/turns/${turn.id}`, {
      body: result.result ?? "",
      usage: result.usage ?? {},
      ...(agent ? { agent } : {}),
    })
    console.log(
      `[${label}] done${result.durationMs ? ` in ${(result.durationMs / 1000).toFixed(1)}s` : ""}`
    )
  } catch (err) {
    /**
     * A thrown CursorAgentError means the run never started — auth, config,
     * network. Not evidence the model was too small, so no detector goes
     * back and nothing escalates; promoting here would spend a frontier
     * model to hit the same missing API key. A plain Error before the run
     * (a worktree that would not cut) lands in the thread the same way.
     */
    const message = err instanceof Error ? err.message : String(err)
    const startup = err instanceof CursorAgentError
    console.error(`[${label}] ${startup ? "did not start" : "failed"}: ${message}`)
    await crm(`/api/chat/turns/${turn.id}`, { error: message }).catch(() => {})
  }
}

/**
 * "Still here" on a timer of its own.
 *
 * It cannot ride the poll loop, because a turn that runs for two minutes
 * polls zero times — the CRM would call this worker dead precisely while it
 * was busiest. A timer keeps beating through `Agent.prompt`, so the chat page
 * can tell "thinking" from "nobody is listening". Failures are swallowed: a
 * missed beat is a cosmetic wrong badge, and must never take down the worker.
 */
const HEARTBEAT_MS = 5000

function startHeartbeat() {
  const beat = () => {
    void crm("/api/chat/worker", { worker: NAME }).catch(() => {})
  }
  beat()
  const timer = setInterval(beat, HEARTBEAT_MS)
  // Do not hold the process open on this alone.
  timer.unref?.()
  return timer
}

async function loop() {
  console.log(`chat worker ${NAME} → ${CRM} (cwd ${CWD}, solves under ${SOLVE_DIR})`)
  startHeartbeat()
  for (;;) {
    try {
      const claim = (await crm("/api/chat/queue", { worker: NAME })) as Claim
      if (claim.turn) {
        await runTurn(claim)
        continue
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
    }
    await new Promise((resolve) => setTimeout(resolve, IDLE_MS))
  }
}

void loop()
