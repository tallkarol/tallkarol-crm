import type { JobType } from "@/lib/chat/models"

/**
 * The desks Karol can address in a thread.
 *
 * PURE — client components import this. WHO a persona is lives in the
 * hive-mind plugin (`agents/<name>.md`, `personas/<name>/`); the worker reads
 * those files on the Mac and inlines them into the prompt. What the CRM
 * decides here is only how a persona's turns are treated: which ladder they
 * run on, what kind of pack the thread may pin, and whether the thread is
 * private. A persona missing from this map cannot be addressed, whatever the
 * plugin has on disk — same stance as `skills.ts`: the scan says what exists,
 * this file says what the chat offers.
 */

export type PackKind = "client" | "product" | "me"

export type PersonaSpec = {
  /** As addressed: `@client-manager`. */
  name: string
  /** As shown: "Client manager". Also the reply's speaker name. */
  label: string
  kind: "desk"
  /** The ladder every turn in the thread runs on. */
  job: JobType
  /** The pack kind the thread may pin; null for personas that load none. */
  pack: PackKind | null
  tagline: string
  /** Threads never reach a shared or portal view. */
  private?: boolean
}

const P = (spec: PersonaSpec) => spec

export const PERSONAS: Record<string, PersonaSpec> = {
  pm: P({
    name: "pm",
    label: "PM",
    kind: "desk",
    job: "persona",
    pack: "client",
    tagline: "Priorities across every client and product; triage to a desk.",
  }),
  coach: P({
    name: "coach",
    label: "Coach",
    kind: "desk",
    // Judged on judgment about a person, not on code — the writing rung.
    job: "writing",
    pack: "me",
    tagline: "Goals, habits, the week, career. Personal — never the business.",
    private: true,
  }),
  dreamer: P({
    name: "dreamer",
    label: "Dreamer",
    kind: "desk",
    job: "persona",
    pack: null,
    tagline: "Brainstorms, Q/A loops, moodboards. Diverges, then hands a brief.",
  }),
  "client-manager": P({
    name: "client-manager",
    label: "Client manager",
    kind: "desk",
    job: "persona",
    pack: "client",
    tagline: "One client: promises, meetings, tasks, mail. Prep and digests.",
  }),
  "product-owner": P({
    name: "product-owner",
    label: "Product owner",
    kind: "desk",
    job: "architecture",
    pack: "product",
    tagline: "One product: users, competition, roadmap, decisions. Never the stack.",
  }),
  developer: P({
    name: "developer",
    label: "Developer",
    kind: "desk",
    job: "persona",
    pack: "client",
    tagline: "Picks the stack, plans the build. Code changes go through Solve in chat.",
  }),
  designer: P({
    name: "designer",
    label: "Designer",
    kind: "desk",
    job: "persona",
    pack: "client",
    tagline: "Tokens, critique, Figma.",
  }),
  marketer: P({
    name: "marketer",
    label: "Marketer",
    kind: "desk",
    job: "persona",
    pack: "client",
    tagline: "Demand → briefs → campaigns.",
  }),
  copywriter: P({
    name: "copywriter",
    label: "Copywriter",
    kind: "desk",
    job: "writing",
    pack: "client",
    tagline: "The words, in the pack's voice. Drafts only.",
  }),
}

export const DESKS: PersonaSpec[] = Object.values(PERSONAS)

const ALIASES: Record<string, string> = {
  po: "product-owner",
  "product owner": "product-owner",
  cm: "client-manager",
  "client manager": "client-manager",
  account: "client-manager",
  dev: "developer",
  copy: "copywriter",
  writer: "copywriter",
}

export function personaByName(raw: string): PersonaSpec | null {
  const key = raw.trim().toLowerCase().replace(/[_\s]+/g, "-")
  return PERSONAS[key] ?? PERSONAS[ALIASES[raw.trim().toLowerCase()] ?? ""] ?? null
}

export type Mention = {
  persona: PersonaSpec
  /** The slug typed after the name, if any — validated by the caller. */
  slug: string | null
  /** The message with the address removed; may be empty. */
  rest: string
}

const MENTION_RE = /^(?:@([a-z][a-z0-9-]*)|\/as\s+([a-z][a-z0-9-]*))(?:\s+([a-z0-9][a-z0-9-]*))?(?:\s+([\s\S]*))?$/i

/**
 * `@coach how am I doing` → coach, no slug, "how am I doing".
 * `/as product-owner momentum what's next` → product-owner, "momentum", "what's next".
 * `@coach me` — "me" is a valid slug only for the `me` pack; the caller decides.
 * A word after the name that is not a slug (`@dreamer ideas for the frame`)
 * comes back as `rest` untouched when the persona loads no pack.
 */
export function parseMention(text: string): Mention | null {
  const m = MENTION_RE.exec(text.trim())
  if (!m) return null
  const persona = personaByName(m[1] ?? m[2] ?? "")
  if (!persona) return null
  const word = m[3] ?? null
  const rest = (m[4] ?? "").trim()
  if (!persona.pack) return { persona, slug: null, rest: [word, rest].filter(Boolean).join(" ") }
  return { persona, slug: word, rest }
}

/** `clients/zemvelo` → "zemvelo (client)"; `me` → "me"; "" → null. */
export function describePack(ref: string): string | null {
  if (!ref) return null
  if (ref === "me") return "me"
  const [kind, slug] = ref.split("/")
  return slug ? `${slug} (${kind === "products" ? "product" : "client"})` : ref
}
