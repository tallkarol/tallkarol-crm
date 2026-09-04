/**
 * What the theme sweep is allowed to touch.
 *
 * One skip list, three consumers: the Stage 4 codemod, scripts/check-theme.ts,
 * and any future editor tooling. A newly frozen route lands here once, so it
 * cannot be honoured by one tool and forgotten by another.
 *
 * Import-free beyond node built-ins on purpose.
 */

export const SWEEP_ROOTS = ["app", "components", "lib"] as const
export const SWEEP_EXT = /\.tsx?$/

/** Light-only and pixel-stable by decree. Never swept, never linted. */
export const FROZEN_DIRS = [
  // These live under the (public) route group, which is a SECOND ROOT LAYOUT
  // and not just a folder: Next forces a full document load when a navigation
  // crosses between roots, which is what makes a dark theme unable to leak
  // into a client's printed invoice. Keep these paths in step with that move —
  // when they were still at app/portal/ etc. the guard silently stopped
  // skipping them and started reporting their deliberate literals as debt.
  "app/(public)/",
  "components/portal/",
] as const

/**
 * Shared components the frozen routes render. Directory freezing cannot reach
 * them: app/insights-report/[site]/page.tsx imports BarList, PrintTrend and
 * SearchTable; components/portal/insights-panels.tsx imports insights/Card,
 * BarList/MeterList, KpiTile, PrintTrend and SearchTable. KpiTile alone
 * renders 9 times on /portal/insights.
 *
 * These are NOT frozen — the admin insights pages need them dark-correct.
 * They are FORKED in Stage 3: each gets a light-literal twin under
 * components/portal/, and the frozen routes import the twin. Until that lands
 * they are listed here so nothing sweeps them by accident.
 */
export const SHARED_WITH_FROZEN = [
  "components/insights/Card.tsx",
  "components/insights/KpiTile.tsx",
  "components/insights/Sparkline.tsx",
  "components/insights/BarList.tsx",
  "components/insights/SearchTable.tsx",
  "components/insights/PrintTrend.tsx",
] as const

export const FROZEN_FILES = ["components/LoginForm.tsx"] as const

/**
 * Exact substrings that are correct as literals and must survive every rule.
 * The codemod masks these with a sentinel before its rules run and restores
 * them afterwards — that is how "sweep line 29 of PayloadBlock but never line
 * 30" is expressed.
 *
 * Each entry must occur EXACTLY ONCE in its file, counted against the
 * already-masked text with pins sorted longest-first, so a short pin nested
 * inside a long one cannot false-trip the assertion.
 */
export const PINNED: Readonly<Record<string, readonly string[]>> = {
  // On-dark chrome. bg-tk-onyx is deliberately absent from the backgroundColor
  // map, so this block is #0F1615 in BOTH themes.
  // NOTE: 'text-[#54C3AB]' occurs TWICE in this file (bare, and inside hover:)
  // — pin the whole unique class string, never the fragment.
  "components/support/PayloadBlock.tsx": [
    "bg-[#16221F]",
    "rounded border border-[#54C3AB]/35 px-1.5 font-mono text-[9.5px] uppercase tracking-wider text-[#54C3AB]",
    "hover:border-[#54C3AB]/60 hover:text-[#54C3AB]",
    "text-[#CFD8D4]",
  ],
  "components/support/CopyButton.tsx": [
    "border-[#54C3AB] bg-[#54C3AB] text-[#0F1615]",
    "hover:border-[#54C3AB]/60 hover:text-[#54C3AB]",
  ],
  // The same <pre> idiom on bg-tk-onyx. 12.59:1 there; text-ink would put
  // #0F1615 on #0F1615 in LIGHT. Splitting one idiom in two is worse.
  "app/(admin)/uptime/page.tsx": ["text-[#CFD8D4]"],
  "components/support/SupportHeader.tsx": ["text-[#CFD8D4]"],
  "components/peek/SiteUptimePeek.tsx": ["text-[#CFD8D4]"],
  "components/peek/AppHealthPeek.tsx": ["text-[#CFD8D4]"],

  // The rail is onyx in both themes; --warn is not. #8A5A05 vs the rail is
  // 3.09:1 light / 3.24:1 dark with a linen count on it at 4.95:1. bg-warn in
  // dark is #E4C07A and the linen count drops to 1.45:1.
  "components/SidebarNav.tsx": ['warn: "bg-[#8A5A05]"'],

  // Literal linen on a bg-tk-teal pill. Neither borderColor nor ringColor has
  // a tk-linen key, so these fall through to the brand hex and are correct in
  // both themes. Do NOT "fix" them for consistency with the divide-tk-linen
  // site two lines away — that one was the broken half, fixed in the config.
  "components/timesheet/FloatingClock.tsx": [
    "hover:bg-tk-linen/10",
    "bg-tk-linen/90 ring-4 ring-tk-linen/25",
    "border-l border-tk-linen/25",
    "hover:bg-tk-linen/15",
  ],
}

/** Frozen-route chips pinned to literals in Stage 2 so the config cannot move them. */
export const ALLOWED_LITERAL_FILES = [
  "components/portal/PortalShell.tsx",
  "components/portal/panels.tsx",
  "components/portal/insights-panels.tsx",
  "components/portal/panel-shell.tsx",
  "components/portal/kpi-tile.tsx",
  "app/(public)/invoice-print/[number]/page.tsx",
  "app/(public)/insights-report/[site]/page.tsx",
] as const

export function isFrozen(rel: string): boolean {
  return (
    FROZEN_DIRS.some((d) => rel.startsWith(d)) ||
    (FROZEN_FILES as readonly string[]).includes(rel) ||
    (SHARED_WITH_FROZEN as readonly string[]).includes(rel)
  )
}
