import { eq } from "drizzle-orm"
import { db } from "@/db"
import { chatThreads } from "@/db/schema"
import { packKindOf } from "@/lib/chat/pack-lines"
import { PERSONAS, personaByName } from "@/lib/chat/personas"
import { str, type ToolSpec } from "@/lib/chat/tool-helpers"
import { send } from "@/lib/chat/turns"

/**
 * The handoff, made real. A desk that says "this is the copywriter's" can
 * hand the conversation over: a brief, previewed, and on Confirm a new
 * thread addressed to that desk with the brief as its first message — the
 * desk answers there. Along the org chart only (personas/README.md): the pm
 * and the dreamer reach any desk; an account desk reaches the pm; the
 * product owner briefs developer, designer and marketer; the marketer
 * briefs the copywriter. A conversation travels with a brief; work products
 * never do — the charter's relay ban stands.
 */
const ANY_DESK = Object.keys(PERSONAS).filter((n) => n !== "coach")

const EDGES: Record<string, readonly string[]> = {
  "": ANY_DESK,
  pm: ANY_DESK.filter((n) => n !== "pm"),
  dreamer: ANY_DESK.filter((n) => n !== "dreamer"),
  "client-manager": ["pm"],
  "product-owner": ["developer", "designer", "marketer", "pm"],
  developer: ["pm", "designer"],
  designer: ["pm", "developer"],
  marketer: ["copywriter", "pm"],
  copywriter: ["marketer", "pm"],
  coach: [],
}

/** `clients/zemvelo` → `zemvelo` when the receiving desk loads the same kind of pack. */
function carriedSlug(pack: string, kind: string | null): string | null {
  if (!pack || !kind || kind === "me") return null
  if (packKindOf(pack) !== kind) return null
  return pack.split("/")[1] ?? null
}

export const routeToTool: ToolSpec = {
  name: "route_to",
  description:
    "Hand this conversation to another desk with a brief. Previewed; on Confirm a new thread addressed to that desk opens with the brief as its first message and the desk answers there. Along the org chart only: pm and dreamer reach any desk; client-manager reaches pm; product-owner reaches developer, designer, marketer; marketer reaches copywriter; developer and designer reach each other and pm. Pass the desk name and a brief (what, why, acceptance, deadline, what is out of scope); a client or product slug pins the desk's pack, otherwise this thread's pack carries when the kinds match.",
  mutating: true,
  parameters: {
    type: "object",
    properties: {
      desk: { type: "string", description: "pm | dreamer | client-manager | product-owner | developer | designer | marketer | copywriter" },
      brief: { type: "string", description: "The brief the desk starts from. What, why, acceptance, deadline, out of scope." },
      slug: { type: "string", description: "Optional: a client or product slug to pin the desk's pack." },
    },
    required: ["desk", "brief"],
  },
  async preview(args, ctx) {
    const desk = personaByName(str(args, "desk") ?? "")
    const brief = str(args, "brief")
    if (!desk) throw new Error(`No desk named "${str(args, "desk") ?? ""}".`)
    if (!brief) throw new Error("A handoff needs a brief.")
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, ctx.threadId),
      columns: { agent: true, pack: true },
    })
    const from = thread?.agent ?? ""
    if (!(EDGES[from] ?? []).includes(desk.name)) {
      throw new Error(`${from ? PERSONAS[from]?.label ?? from : "This thread"} does not hand to ${desk.label} on the org chart.`)
    }
    const slug = str(args, "slug") ?? carriedSlug(thread?.pack ?? "", desk.pack)
    return {
      title: `Hand to ${desk.label}`,
      fields: [
        { label: "To", value: `@${desk.name}` },
        { label: "From", value: from ? PERSONAS[from]?.label ?? from : "Assistant" },
        { label: "Pack", value: slug ? `${slug} (${desk.pack})` : desk.pack ? "not pinned — the desk will ask" : "—" },
        { label: "Brief", value: brief.slice(0, 600) },
      ],
      note: "Opens a new thread addressed to that desk; the brief is its first message and the desk answers there.",
    }
  },
  async run(args, ctx) {
    const desk = personaByName(str(args, "desk") ?? "")
    const brief = str(args, "brief")
    if (!desk || !brief) throw new Error("`desk` and `brief` are required.")
    const thread = await db.query.chatThreads.findFirst({
      where: eq(chatThreads.id, ctx.threadId),
      columns: { agent: true, pack: true },
    })
    const from = thread?.agent ?? ""
    if (!(EDGES[from] ?? []).includes(desk.name)) throw new Error("Not an edge on the org chart.")
    const slug = str(args, "slug") ?? carriedSlug(thread?.pack ?? "", desk.pack)
    const fromLabel = from ? PERSONAS[from]?.label ?? from : "Assistant"
    const result = await send({
      userId: ctx.userId,
      text: `@${desk.name}${slug ? ` ${slug}` : ""} Handed from ${fromLabel} (thread ${ctx.threadId.slice(0, 8)}): ${brief}`,
      as: fromLabel,
      fromThreadId: ctx.threadId,
    })
    return {
      threadId: result.threadId,
      url: `/chat?thread=${result.threadId}`,
      desk: desk.name,
      model: result.turn.model,
    }
  },
}

export const DESK_TOOLS: readonly ToolSpec[] = [routeToTool]
