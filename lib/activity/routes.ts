import { DOCK_NAV, type NavLink } from "@/lib/nav"

/**
 * Pathnames → route patterns, PURE.
 *
 * Pages group by pattern — /projects/[slug], not /projects/dqs — so fifty
 * project pages are one row and the slug travels as a param. The patterns
 * come from `npm run activity:scan`, which walks app/ for page.tsx files and
 * runs again in prebuild, so a deploy always knows its own routes. A path no
 * pattern matches still collapses its id-looking segments rather than
 * storing a raw URL.
 */

export type RouteMatch = { pattern: string; params: Record<string, string> }

type Compiled = { pattern: string; segments: string[]; rank: number[] }

export function splitPath(pathname: string): string[] {
  const bare = pathname.split(/[?#]/)[0] ?? ""
  return bare
    .split("/")
    .filter(Boolean)
    .map((seg) => {
      try {
        return decodeURIComponent(seg)
      } catch {
        return seg
      }
    })
}

const isDynamic = (seg: string) => seg.startsWith("[") && seg.endsWith("]")
const isCatchAll = (seg: string) => seg.startsWith("[...") || seg.startsWith("[[...")
const paramName = (seg: string) => seg.replace(/^\[+(\.\.\.)?/, "").replace(/\]+$/, "")

/** Static beats dynamic beats catch-all, segment by segment. */
export function compilePatterns(patterns: readonly string[]): Compiled[] {
  return patterns
    .map((pattern) => {
      const segments = splitPath(pattern)
      return { pattern, segments, rank: segments.map((s) => (isCatchAll(s) ? 2 : isDynamic(s) ? 1 : 0)) }
    })
    .sort((a, b) => {
      for (let i = 0; i < Math.max(a.rank.length, b.rank.length); i++) {
        const ra = a.rank[i] ?? 3
        const rb = b.rank[i] ?? 3
        if (ra !== rb) return ra - rb
      }
      return b.segments.length - a.segments.length
    })
}

function tryMatch(c: Compiled, segs: string[]): Record<string, string> | null {
  const params: Record<string, string> = {}
  for (let i = 0; i < c.segments.length; i++) {
    const seg = c.segments[i]
    if (isCatchAll(seg)) {
      params[paramName(seg)] = segs.slice(i).join("/")
      return params
    }
    if (i >= segs.length) return null
    if (isDynamic(seg)) params[paramName(seg)] = segs[i]
    else if (seg !== segs[i]) return null
  }
  return c.segments.length === segs.length ? params : null
}

/** A segment that looks like a record rather than a place: a uuid, a number, anything with a digit in it. */
export function looksLikeId(seg: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg) || /\d/.test(seg) || seg.length > 40
}

export function matchRoute(pathname: string, compiled: Compiled[]): RouteMatch {
  const segs = splitPath(pathname.slice(0, 300))
  for (const c of compiled) {
    const params = tryMatch(c, segs)
    if (params) return { pattern: c.pattern, params }
  }
  const params: Record<string, string> = {}
  const pattern =
    "/" +
    segs
      .map((seg) => {
        if (!looksLikeId(seg)) return seg
        params.id = seg
        return "[id]"
      })
      .join("/")
  return { pattern, params }
}

/* ------------------------------------------------------------------ labels */

/**
 * The dock's rows as one flat list, for labelling — not what renders the
 * chrome. DOCK_NAV groups are already flat (no children since the sidebar's
 * nested rows were absorbed into the panel), so this is just a concat.
 */
function flatNav(): NavLink[] {
  return DOCK_NAV.flatMap((group) => group.items)
}

const NAV_LABEL: Record<string, string> = {}
for (const link of flatNav()) {
  if (!link.href.includes("?")) NAV_LABEL[link.href] = link.label
}

/** The sidebar's rows as hrefs + labels — what "not opened in 30 days" compares against. */
export function navRows(): { href: string; label: string }[] {
  const seen = new Set<string>()
  return flatNav()
    .filter((link) => !link.href.includes("?") && link.href !== "/")
    .filter((link) => (seen.has(link.href) ? false : (seen.add(link.href), true)))
    .map((link) => ({ href: link.href, label: link.label }))
}

function singular(word: string) {
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`
  if (word.endsWith("ses")) return word.slice(0, -2)
  if (word.endsWith("s")) return word.slice(0, -1)
  return word
}

function titleCase(word: string) {
  const spaced = word.replace(/-/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

/**
 * "/projects/[slug]" → "Projects · project", "/support" → "Tickets",
 * "/timesheet/review" → "Timesheet · Review". Each step takes the sidebar's
 * name for that path when it has one, so a renamed nav row renames it here.
 */
export function routeLabel(pattern: string): string {
  if (pattern === "/") return "Dashboard"
  const segs = splitPath(pattern)
  const parts: string[] = []
  let path = ""
  segs.forEach((seg, i) => {
    path += `/${seg}`
    if (isDynamic(seg)) {
      const name = paramName(seg)
      const prev = segs[i - 1]
      parts.push(["slug", "id", "number"].includes(name) && prev && !isDynamic(prev) ? singular(prev).replace(/-/g, " ") : name)
      return
    }
    parts.push(NAV_LABEL[path] ?? titleCase(seg))
  })
  return parts.join(" · ")
}

/** What a sentence calls the page: "projects" for /projects/[slug], the label otherwise. */
export function routeNoun(pattern: string): string {
  const segs = splitPath(pattern)
  const last = segs[segs.length - 1]
  const parent = segs[segs.length - 2]
  if (last && parent && isDynamic(last) && !isDynamic(parent)) {
    const parentPath = `/${segs.slice(0, -1).join("/")}`
    return (NAV_LABEL[parentPath] ?? parent.replace(/-/g, " ")).toLowerCase()
  }
  return routeLabel(pattern)
}

/** Does this route belong under that sidebar row? /projects/[slug] is under /projects. */
export function underHref(pattern: string, href: string): boolean {
  return pattern === href || pattern.startsWith(`${href}/`)
}
