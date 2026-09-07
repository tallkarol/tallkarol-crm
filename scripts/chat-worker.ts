import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { Agent, CursorAgentError } from "@cursor/sdk"
import type { SDKCustomTool, SDKJsonValue, ToolName } from "@cursor/sdk"
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

type Claim = {
  turn: QueuedTurn | null
  messages?: { role: string; agent: string; body: string; at: string }[]
  tools?: ToolSchema[]
  /** Set on a `skill` turn: the command the CRM parsed from the message. */
  command?: { name: string; args: string } | null
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

  try {
    /**
     * `tools: ["mcp"]` is deliberate and load-bearing for a chat turn: it
     * leaves the model with the CRM callbacks and NOTHING else — no shell,
     * no edit, no read. A chat turn has no business touching the filesystem,
     * and the cheapest way to guarantee that is to not hand over the tool.
     *
     * A skill turn is the one exception, and it is gated above: the command
     * file it follows needs to read a SKILL.md and run its scripts, so it
     * gets the toolset Claude Code would have had.
     */
    const result = await Agent.prompt(
      command ? skillPrompt(claim, command) : buildPrompt(claim),
      {
      apiKey: API_KEY,
      model: {
        id: turn.model,
        ...(turn.effort
          ? { params: [{ id: "reasoningEffort", value: turn.effort }] }
          : {}),
      },
      tools: command ? SKILL_TOOLS : ["mcp"],
      name: `chat ${label}`,
      idempotencyKey: turn.id,
      local: {
        cwd: CWD,
        // Inline config only. Loading Karol's project rules into a CRM
        // question would spend tokens on WordPress conventions.
        settingSources: [],
        customTools: customTools(turn, claim.tools ?? []),
      },
      }
    )

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
      ...(command ? { agent: `/${command.name}` } : {}),
    })
    console.log(
      `[${label}] done${result.durationMs ? ` in ${(result.durationMs / 1000).toFixed(1)}s` : ""}`
    )
  } catch (err) {
    /**
     * A thrown CursorAgentError means the run never started — auth, config,
     * network. Not evidence the model was too small, so no detector goes
     * back and nothing escalates; promoting here would spend a frontier
     * model to hit the same missing API key.
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
  console.log(`chat worker ${NAME} → ${CRM} (cwd ${CWD})`)
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
