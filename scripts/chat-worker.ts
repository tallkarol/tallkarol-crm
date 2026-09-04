import { Agent, CursorAgentError } from "@cursor/sdk"
import type { SDKCustomTool, SDKJsonValue } from "@cursor/sdk"
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
}

async function crm(path: string, body: unknown) {
  const response = await fetch(`${CRM}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
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

function buildPrompt(claim: Claim): string {
  const transcript = (claim.messages ?? [])
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => `${m.role === "user" ? "Karol" : "You"}: ${m.body}`)
    .join("\n\n")

  return [
    "You are Karol's assistant inside the Tall Karol CRM.",
    "",
    "Answer in his voice: direct, plain, no hype and no filler. Short answers",
    "are correct answers. Use the tools for anything factual — never guess at",
    "hours, dates or client names, and call list_clients when you need to turn",
    "a name into a slug.",
    "",
    "Tools whose description says PROPOSES ONLY do not perform the action.",
    "They return `pending`. When one does, tell Karol exactly what is waiting",
    "for him to confirm, in one line, and do not claim it is done.",
    "",
    "Conversation so far:",
    "",
    transcript,
  ].join("\n")
}

async function runTurn(claim: Claim) {
  const turn = claim.turn
  if (!turn) return

  const label = turn.id.slice(0, 8)
  console.log(
    `[${label}] ${turn.jobType} rung ${turn.rung} → ${turn.model}${turn.effort ? ` (${turn.effort})` : ""}`
  )

  try {
    /**
     * `tools: ["mcp"]` is deliberate and load-bearing: it leaves the model
     * with the CRM callbacks and NOTHING else — no shell, no edit, no read.
     * A chat turn has no business touching the filesystem, and the cheapest
     * way to guarantee that is to not hand over the tool.
     */
    const result = await Agent.prompt(buildPrompt(claim), {
      apiKey: API_KEY,
      model: {
        id: turn.model,
        ...(turn.effort
          ? { params: [{ id: "reasoningEffort", value: turn.effort }] }
          : {}),
      },
      tools: ["mcp"],
      name: `chat ${label}`,
      idempotencyKey: turn.id,
      local: {
        cwd: CWD,
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

async function loop() {
  console.log(`chat worker ${NAME} → ${CRM} (cwd ${CWD})`)
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
