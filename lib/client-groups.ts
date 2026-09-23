import type { RosterRow } from "@/lib/client-hub"

/**
 * How the roster's panel groups clients — Karol's four buckets (23 Sep 2026):
 * active retainer, active project, completed, internal. Pure; the roster
 * page groups on the server and the panel just renders.
 *
 *   internal        status = internal (the house and its products)
 *   retainer        an active retainer, whatever else is going on
 *   project         no retainer, but a project that is not complete
 *   completed       everything else — finished work, in contact, lapsed
 */
export const CLIENT_GROUPS = [
  { id: "retainer", label: "Active retainer" },
  { id: "project", label: "Active project" },
  { id: "completed", label: "Completed" },
  { id: "internal", label: "Internal" },
] as const
export type ClientGroupId = (typeof CLIENT_GROUPS)[number]["id"]

export type GroupedClient = {
  slug: string
  name: string
  color: string
  /** Tickets past their reply window. */
  hot: boolean
  /** Overdue open tasks. */
  warn: boolean
}

export type ClientGroup = { id: ClientGroupId; label: string; rows: GroupedClient[] }

export function groupOf(row: Pick<RosterRow, "status" | "tags">): ClientGroupId {
  if (row.status === "internal") return "internal"
  if (row.tags.includes("retainer")) return "retainer"
  if (row.tags.includes("project")) return "project"
  return "completed"
}

/** Groups in the fixed order, empty ones dropped, rows alphabetical inside each. */
export function groupClients(rows: RosterRow[]): ClientGroup[] {
  const buckets = new Map<ClientGroupId, GroupedClient[]>()
  for (const g of CLIENT_GROUPS) buckets.set(g.id, [])
  for (const row of rows) {
    buckets.get(groupOf(row))!.push({
      slug: row.slug,
      name: row.name,
      color: row.color,
      hot: row.ticketsWaiting > 0,
      warn: row.overdueTasks > 0,
    })
  }
  return CLIENT_GROUPS.map((g) => ({
    id: g.id,
    label: g.label,
    rows: buckets.get(g.id)!.sort((a, b) => a.name.localeCompare(b.name)),
  })).filter((g) => g.rows.length > 0)
}
