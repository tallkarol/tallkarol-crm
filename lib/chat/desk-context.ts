import { PERSONAS } from "@/lib/chat/personas"

/**
 * Which desk the dock puts up front on a page, and which pack it pins.
 *
 * PURE — the dock is a client component and reads this on every route
 * change. The page decides: a client's page fronts the client manager
 * pinned to that client, a product's page the product owner, the boards the
 * dreamer, the reports the marketer, the codebase docs the developer, and
 * the dashboard the pm. The coach is never a default — Karol opens it.
 * `/chat` fronts nobody: the thread there already says who is speaking.
 */
export type DeskContext = { agent: string; pack: string }

const ORDER: string[] = Object.keys(PERSONAS)

export function deskFor(pathname: string): DeskContext | null {
  const path = pathname.replace(/\/+$/, "") || "/"
  if (path === "/chat" || path.startsWith("/chat/")) return null

  const codebase = /^\/clients\/([a-z0-9-]+)\/codebases(\/|$)/.exec(path)
  if (codebase) return { agent: "developer", pack: `clients/${codebase[1]}` }

  const client = /^\/clients\/([a-z0-9-]+)/.exec(path)
  if (client) return { agent: "client-manager", pack: `clients/${client[1]}` }

  const product = /^\/products\/([a-z0-9-]+)/.exec(path)
  if (product) return { agent: "product-owner", pack: `products/${product[1]}` }

  if (path.startsWith("/inspiration")) return { agent: "dreamer", pack: "" }
  if (path.startsWith("/insights") || path.startsWith("/reports") || path.startsWith("/ads")) {
    return { agent: "marketer", pack: "" }
  }
  if (path.startsWith("/settings") || path.startsWith("/vault") || path.startsWith("/logs")) return null

  return { agent: "pm", pack: "" }
}

/** The desks in roster order — the dock's column, coach included. */
export const DOCK_ORDER: readonly string[] = ORDER

/** `clients/zemvelo` → "zemvelo"; `me` → "me"; "" → "". */
export function packLabel(pack: string): string {
  if (!pack) return ""
  if (pack === "me") return "me"
  return pack.split("/")[1] ?? pack
}

/**
 * Two letters for a monogram. Hand-picked so no two desks share one —
 * "developer"/"designer" and "coach"/"copywriter" would both collide on the
 * first two letters.
 */
const MONOGRAMS: Record<string, string> = {
  pm: "PM",
  coach: "CO",
  dreamer: "DR",
  "client-manager": "CM",
  "product-owner": "PO",
  developer: "DV",
  designer: "DS",
  marketer: "MK",
  copywriter: "CW",
}

export function monogram(agent: string): string {
  const picked = MONOGRAMS[agent]
  if (picked) return picked
  const parts = agent.split("-")
  if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase()
  return agent.slice(0, 2).toUpperCase()
}
