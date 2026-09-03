import graph from "@/content/hivemind.json"

/**
 * The hive-mind map's data layer. PURE — no db, no fs — because the graph
 * component imports it into the browser bundle (same split as `lib/inbox.ts`
 * versus `lib/inbox-data.ts`).
 *
 * The JSON is written by `npm run hivemind:scan`, which reads the actual
 * daedalus-hive-mind plugin repo. Railway has no copy of that repo, so the
 * scan output is committed and the page renders what was last scanned —
 * `scannedAt` is on the page so a stale map says so.
 */

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

export type LinkRel = "contains" | "loads" | "fires" | "feeds"

export type HiveNode = {
  id: string
  label: string
  kind: NodeKind
  lane?: string
  blurb?: string
  source?: string
  meta?: Record<string, string>
}

export type HiveLink = { source: string; target: string; rel: LinkRel }

export type HiveGraph = {
  scannedAt: string
  plugin: { name: string; version: string; root: string }
  counts: Partial<Record<NodeKind, number>>
  nodes: HiveNode[]
  links: HiveLink[]
}

export const HIVE = graph as HiveGraph

/**
 * Colour does three jobs, not nine.
 *
 * The validated categorical palette clears the all-pairs CVD and
 * normal-vision floors at exactly THREE slots (`references/palette.md`), and
 * a force graph is an all-pairs form — any two kinds can end up adjacent. So
 * three hues carry the question the map actually answers: who does the work
 * (agent), what they know (skill), what sets it off (trigger). Everything
 * else is encoded by shape and size, never by a fourth invented hue:
 *
 *   circle          actor or body of knowledge   (root · lane · agent · skill)
 *   rounded square  a trigger you type           (command)
 *   diamond         a trigger that fires itself  (routine · pipeline)
 *   small mark      the instruments a skill ships (script · reference)
 *
 * Structure (root, lane) and subskills (script, reference) wear ink, because
 * they are the skeleton and the detail — not categories competing for
 * attention. Aqua sits under 3:1 on the light card surface, so the relief
 * rule applies: every node is directly labelled and a table view ships.
 */
export type MarkShape = "circle" | "square" | "diamond" | "dot"

export const KIND_STYLE: Record<
  NodeKind,
  { shape: MarkShape; radius: number; color: string; label: string }
> = {
  root: { shape: "circle", radius: 15, color: "var(--viz-ink)", label: "PM" },
  lane: { shape: "circle", radius: 11, color: "var(--viz-ink)", label: "Lane" },
  agent: { shape: "circle", radius: 9, color: "var(--viz-agent)", label: "Agent" },
  skill: { shape: "circle", radius: 8, color: "var(--viz-skill)", label: "Skill" },
  command: { shape: "square", radius: 7, color: "var(--viz-trigger)", label: "Command" },
  routine: { shape: "diamond", radius: 8, color: "var(--viz-trigger)", label: "Routine" },
  pipeline: { shape: "diamond", radius: 8, color: "var(--viz-trigger)", label: "Pipeline" },
  script: { shape: "dot", radius: 3.5, color: "var(--viz-sub)", label: "Script" },
  reference: { shape: "dot", radius: 3.5, color: "var(--viz-sub)", label: "Reference" },
}

/** The legend's groups — hue first, then the shapes that share a hue. */
export const LEGEND: { label: string; kinds: NodeKind[] }[] = [
  { label: "Specialists", kinds: ["agent"] },
  { label: "Skills", kinds: ["skill"] },
  { label: "Triggers", kinds: ["command", "routine", "pipeline"] },
  { label: "Structure", kinds: ["root", "lane"] },
  { label: "Instruments", kinds: ["script", "reference"] },
]

export const REL_LABEL: Record<LinkRel, string> = {
  contains: "contains",
  loads: "loads",
  fires: "fires",
  feeds: "feeds",
}

/** Kinds that can be filtered off. Structure always stays — it's the skeleton. */
export const FILTERABLE: NodeKind[] = [
  "agent",
  "skill",
  "command",
  "routine",
  "pipeline",
  "script",
  "reference",
]

export function nodeById(nodes: HiveNode[]): Map<string, HiveNode> {
  return new Map(nodes.map((n) => [n.id, n]))
}

/** Edges touching `id`, as {node, rel, direction} for the inspector. */
export function connectionsOf(
  id: string,
  graph: Pick<HiveGraph, "nodes" | "links">
): { node: HiveNode; rel: LinkRel; out: boolean }[] {
  const byId = nodeById(graph.nodes)
  const out: { node: HiveNode; rel: LinkRel; out: boolean }[] = []
  for (const link of graph.links) {
    if (link.source === id) {
      const node = byId.get(link.target)
      if (node) out.push({ node, rel: link.rel, out: true })
    } else if (link.target === id) {
      const node = byId.get(link.source)
      if (node) out.push({ node, rel: link.rel, out: false })
    }
  }
  return out
}

/** How stale the scan is, in plain words. */
export function scanAge(iso: string, now = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < 1) return "today"
  if (days === 1) return "yesterday"
  if (days < 30) return `${days} days ago`
  const months = Math.floor(days / 30)
  return months === 1 ? "a month ago" : `${months} months ago`
}
