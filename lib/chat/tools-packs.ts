import { eq } from "drizzle-orm"
import { db } from "@/db"
import { chatThreads } from "@/db/schema"
import { CHAT_ZONE } from "@/lib/chat/format"
import {
  PACK_LINE_TARGETS,
  allowed,
  describeTarget,
  marker,
  renderLine,
  type PackLineTarget,
} from "@/lib/chat/pack-lines"
import { PERSONAS } from "@/lib/chat/personas"
import { str, type ToolSpec } from "@/lib/chat/tool-helpers"

/**
 * The one write a desk may make to its pack: a line, previewed, landed by
 * the Mac after Karol confirms. The target pack is the thread's — read here
 * from `chat_threads`, never from the arguments — so a desk cannot aim at
 * another client, and `claims.md`, `personas/**` and the prose slots are
 * unreachable by construction. See pack-lines.ts for what a line is.
 */

/** YYYY-MM-DD in Karol's zone — the date the row carries. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CHAT_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

const cellProp = (description: string) => ({ type: "string", description })

export const proposePackLineTool: ToolSpec = {
  name: "propose_pack_line",
  description:
    "Land one line in the pack this thread is pinned to, after Karol approves. Client manager: a PROMISES row (promise, due), a PRIORITIES row (priority), a PEOPLE row (name, role, how), or a HISTORY / OPEN line (line) in the client's relationship.md. Product owner: a decisions.md entry (decision, why, rulesOut). Coach: a journal line (line) in me. Previewed as the exact row; the Mac writes the file and commits it. Only the thread's own pack; nothing else in a pack is reachable.",
  mutating: true,
  executor: "worker",
  parameters: {
    type: "object",
    properties: {
      target: {
        type: "string",
        description: PACK_LINE_TARGETS.join(" | "),
      },
      promise: cellProp("promise: what Karol said he would do, in the client's words."),
      due: cellProp("promise: YYYY-MM-DD, or a plain phrase like 'before the launch'."),
      priority: cellProp("priority: what they care about right now, in their words."),
      name: cellProp("person: their name."),
      role: cellProp("person: their role."),
      how: cellProp("person: how they work with Karol."),
      line: cellProp("history / open / journal: the line, dated by the tool."),
      decision: cellProp("decision: what was decided."),
      why: cellProp("decision: why."),
      rulesOut: cellProp("decision: what this rules out."),
    },
    required: ["target"],
  },
  async preview(args, ctx) {
    const target = str(args, "target") as PackLineTarget | undefined
    if (!target || !PACK_LINE_TARGETS.includes(target)) {
      throw new Error(`target must be one of ${PACK_LINE_TARGETS.join(", ")}.`)
    }
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, ctx.threadId),
      columns: { agent: true, pack: true },
    })
    const persona = thread?.agent ? PERSONAS[thread.agent] : null
    if (!thread?.pack || !persona) {
      throw new Error(
        "This thread is not pinned to a pack. Address a desk with one first — `@client-manager <slug>`, `@product-owner <slug>`, or `@coach`."
      )
    }
    if (!allowed(persona.name, thread.pack, target)) {
      throw new Error(`${persona.label} may not write a ${describeTarget(target)} to ${thread.pack}.`)
    }
    const date = today()
    const line = renderLine(target, args, {
      date,
      source: `chat:${ctx.threadId.slice(0, 8)}`,
      marker: marker(ctx.idempotencyKey),
    })
    // Desk and Pack are the card's contract: the worker lands the line where
    // the card said, whatever the thread is addressed to by then.
    return {
      title: `Write to ${thread.pack} — ${describeTarget(target)}`,
      fields: [
        { label: "Desk", value: persona.name },
        { label: "Pack", value: thread.pack },
        { label: "File", value: line.file },
        { label: "Section", value: line.section ?? "—" },
        { label: "Date", value: date },
        { label: "Row", value: line.markdown.replace(marker(ctx.idempotencyKey), "").trim() },
      ],
      note: "Approved lines are written to the pack on the Mac and committed there. Nothing is sent anywhere.",
    }
  },
  async run() {
    throw new Error("propose_pack_line lands on the Mac; the CRM never writes a pack file.")
  },
}

export const PACK_TOOLS: readonly ToolSpec[] = [proposePackLineTool]
