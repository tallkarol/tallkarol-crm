import { findings, type Finding, type FindingInput, type WaitingRule } from "@/lib/activity/findings"
import { humanizeId } from "@/lib/activity/format"
import { navRows, routeLabel, routeNoun, underHref } from "@/lib/activity/routes"
import { controlsSummary } from "@/lib/activity/summary/controls"
import type { ActivityFilters } from "@/lib/activity/summary/filters"
import { frictionSummary } from "@/lib/activity/summary/friction"
import { viaByRoute, type HeaderFacts, type ViaRow } from "@/lib/activity/summary/overview"
import { pageRows, sidebarUse } from "@/lib/activity/summary/pages"
import { actionTimings } from "@/lib/activity/summary/speed"

/** Everything the tuning rules read, gathered once. The rules themselves are pure (lib/activity/findings.ts). */
export async function tuningNotes(
  f: ActivityFilters,
  facts: HeaderFacts,
  viaWindow: ViaRow[]
): Promise<{ findings: Finding[]; waiting: WaitingRule[] }> {
  const since30 = new Date(f.now.getTime() - 30 * 86_400_000)
  const [sidebar, via30, actions, friction, pages, controls] = await Promise.all([
    sidebarUse(),
    viaByRoute(f, since30),
    actionTimings(f),
    frictionSummary(f),
    pageRows(f),
    controlsSummary(f),
  ])

  const hrefs = navRows().map((n) => n.href)
  const ownHref = (route: string) =>
    hrefs.filter((href) => underHref(route, href)).sort((a, b) => b.length - a.length)[0] ?? null
  const sidebarViewsUnder = (href: string | null) =>
    href ? via30.filter((r) => underHref(r.route, href)).reduce((n, r) => n + (r.via.sidebar ?? 0), 0) : 0

  const lastMessage = new Map(friction.failedActions.map((a) => [a.target, a.lastMessage] as const))
  const viewsInWindow = new Map(viaWindow.map((r) => [r.route, r] as const))

  const input: FindingInput = {
    trackedDays: facts.trackedDays,
    windowDays: f.days,
    unopenedNav: sidebar.filter((row) => !row.lastAt || new Date(row.lastAt) < since30).map((row) => ({ label: row.label })),
    navByPage: via30.map((r) => ({
      label: routeNoun(r.route),
      views: r.views,
      palette: r.via.palette ?? 0,
      sidebar: r.via.sidebar ?? 0,
      sidebarClicks30d: sidebarViewsUnder(ownHref(r.route)),
    })),
    actions: actions.map((a) => ({
      label: humanizeId(a.target),
      runs: a.runs,
      failed: a.failed,
      p95Ms: a.p95Ms,
      waitedMs: a.waitedMs,
      lastMessage: lastMessage.get(a.target) ?? null,
    })),
    rage: friction.rage.map((r) => ({ label: r.target, page: routeLabel(r.route), clicks: r.n })),
    quickBacks: friction.quickBacks.map((q) => ({ page: routeLabel(q.route), backs: q.n, views: viewsInWindow.get(q.route)?.views ?? 0 })),
    unusedControls: controls.catalogCount ? controls.unused.map((c) => ({ label: c.label ?? humanizeId(c.id) })) : [],
    phonePages: pages.map((p) => ({
      page: routeLabel(p.route),
      views: p.views,
      phone: p.phone,
      outside: viewsInWindow.get(p.route)?.via.outside ?? 0,
    })),
  }
  return findings(input)
}
