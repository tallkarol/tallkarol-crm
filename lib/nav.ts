import type { UnreadTone } from "@/lib/unread"

export type NavIconName =
  | "dashboard"
  | "chat"
  | "inbox"
  | "pipeline"
  | "delivery"
  | "contacts"
  | "clients"
  | "projects"
  | "retainers"
  | "leads"
  | "calendar"
  | "tasks"
  | "activity"
  | "emails"
  | "proposals"
  | "worksheets"
  | "punchlists"
  | "meeting-notes"
  | "contracts"
  | "invoices"
  | "expenses"
  | "timesheet"
  | "clock"
  | "timer"
  | "review"
  | "sheets"
  | "list"
  | "sessions"
  | "devices"
  | "attribution"
  | "analytics"
  | "ads"
  | "reports"
  | "revenue"
  | "logs"
  | "support"
  | "uptime"
  | "notebooks"
  | "inspiration"
  | "product"
  | "settings"
  | "team"
  | "email-settings"
  | "integrations"
  | "vault"
  | "slinks"
  | "scaffolds"
  | "hivemind"
  | "usage"

export type NavLink = {
  href: string
  label: string
  icon: NavIconName
}

export type NavSection = {
  title?: string
  items: readonly NavLink[]
}

/**
 * A count on a dock badge or a panel row. Shared with `lib/unread.ts`'s tone
 * ladder so a badge and the card it summarises never tell two stories — see
 * SidebarNav's old doc comment, which this replaces.
 */
export type NavBadge = { count: number; tone?: UnreadTone }

/**
 * One of the six groups on the dock: an icon in the 76px rail, and the pages
 * that live in its 236px panel. `href` is the group's landing page — the
 * dock icon is a real link there, not just a panel toggle.
 */
export type NavGroup = {
  id: string
  label: string
  icon: NavIconName
  href: string
  items: readonly NavLink[]
}

/**
 * The rooms a client's panel lists while you are inside that client —
 * `/clients/[slug]` is the Board (the landing room), the rest are children.
 * Signed off 23 Sep 2026 from `~/Work/tallkarol/crm-hub-b-rooms.html`.
 */
export const CLIENT_ROOMS = [
  { id: "board", label: "Board", icon: "projects" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "inbox", label: "Inbox", icon: "inbox" },
  { id: "monitors", label: "Monitors", icon: "uptime" },
  { id: "dashboards", label: "Dashboards", icon: "analytics" },
] as const satisfies readonly { id: string; label: string; icon: NavIconName }[]
export type ClientRoomId = (typeof CLIENT_ROOMS)[number]["id"]

/**
 * The client a pathname is inside, or null. `/clients` (the roster) is not
 * inside a client; `/clients/[slug]/anything` is, including the codebase
 * pages, so the panel stays in client mode there too.
 */
export function clientSlugOf(pathname: string): string | null {
  const m = /^\/clients\/([^/]+)(?:\/|$)/.exec(pathname)
  return m ? decodeURIComponent(m[1]) : null
}

export function clientRoomOf(pathname: string): ClientRoomId | null {
  const m = /^\/clients\/[^/]+(?:\/([^/]+))?/.exec(pathname)
  if (!m) return null
  const seg = m[1]
  if (!seg) return "board"
  return CLIENT_ROOMS.some((r) => r.id === seg) ? (seg as ClientRoomId) : null
}

export const ROUTES = {
  home: "/",
  chat: "/chat",
  chatThread: (id: string) => `/chat?thread=${id}`,
  inbox: "/inbox",
  inquiries: "/inquiries",
  pipeline: "/pipeline",
  delivery: "/delivery",
  contacts: "/contacts",
  clients: "/clients",
  projects: "/projects",
  retainers: "/retainers",
  leads: "/leads",
  calendar: "/calendar",
  tasks: "/tasks",
  task: (id: string) => `/tasks/${id}`,
  activity: "/activity",
  emails: "/emails",
  proposals: "/proposals",
  worksheets: "/worksheets",
  punchlists: "/punchlists",
  punchlist: (slug: string) => `/punchlists/${slug}`,
  meetingNotes: "/meeting-notes",
  meetingNote: (id: string) => `/meeting-notes/${id}`,
  contracts: "/contracts",
  invoices: "/invoices",
  expenses: "/expenses",
  timesheet: "/timesheet",
  timesheetLive: "/timesheet/live",
  timesheetReview: "/timesheet/review",
  timesheetSheets: "/timesheet/sheets",
  timesheetEntries: "/timesheet/entries",
  timesheetSessions: "/timesheet/sessions",
  usage: "/usage",
  timesheetMeetings: "/timesheet/review?tab=meetings",
  attribution: "/settings/attribution",
  insights: "/insights",
  paidAds: "/ads",
  reports: "/reports",
  revenue: "/revenue",
  logs: "/logs",
  support: "/support",
  uptime: "/uptime",
  notebooks: "/notebooks",
  inspiration: "/inspiration",
  inspirationBoard: (slug: string) => `/inspiration/${slug}`,
  vault: "/vault",
  slinks: "/slinks",
  scaffolds: "/scaffolds",
  hivemind: "/hivemind",
  scaffold: (slug: string) => `/scaffolds/${slug}`,
  settings: "/settings",
  settingsColors: "/settings/colors",
  settingsNotifications: "/settings/notifications",
  settingsPortals: "/settings/portals",
  settingsTeam: "/settings/team",
  settingsEmail: "/settings/email",
  settingsIntegrations: "/settings/integrations",
  settingsDevices: "/settings/integrations/devices",
  settingsCalendar: "/settings/integrations/calendar",
  client: (slug: string) => `/clients/${slug}`,
  clientRoom: (slug: string, room: ClientRoomId) =>
    room === "board" ? `/clients/${slug}` : `/clients/${slug}/${room}`,
  notebook: (slug: string) => `/notebooks/${slug}`,
  retainer: (slug: string) => `/retainers/${slug}`,
  project: (slug: string) => `/projects/${slug}`,
  products: "/products",
  productPage: (slug: string) => `/products/${slug}`,
  invoice: (number: string) => `/invoices/${number}`,
  timesheetFor: (client: string, month: string) =>
    `/timesheet/${encodeURIComponent(client)}/${encodeURIComponent(month)}`,
  contract: (slug: string) => `/contracts/${slug}`,
  reportDoc: (slug: string) => `/doc/reports/${slug}`,
  proposalDoc: (slug: string) => `/doc/proposals/${slug}`,
  worksheetDoc: (slug: string) => `/doc/worksheets/${slug}`,
  inquiry: (id: string) => `/inquiries/${id}`,
} as const

/**
 * The dock: one icon per group, its pages in the panel beside it. Signed off
 * 18 Sep 2026 from `~/Work/tallkarol/nav-mockup.html` (its DEFAULT_MODEL) —
 * 35 rows collapsed to six groups on the surface. The pick and the usage
 * sweep behind it are in the `crm-nav-dock-panel` memory note. Group order,
 * page order and labels are the signed-off list; do not re-sort by hand.
 *
 * Chrome, not a group: `/` (the monogram), `/chat` (an icon beside the panel
 * toggle), ⌘K search, and the avatar menu (theme, hide-money, sign out).
 *
 * Parked — reachable by URL and ⌘K, not in the dock:
 *   /settings/notifications — Notifications
 *   /settings/colors — Colours
 *   /settings/portals — Client portals
 *   /settings/integrations — Integrations
 *   /settings/integrations/devices — Devices
 *
 * Off every surface:
 *   /contacts — stub: ComingSoon, no contacts table
 *   /emails — stub: ComingSoon, never in the nav
 *   /settings/team — stub: ComingSoon, one admin
 *   /settings/email — stub: ComingSoon
 *   /settings/attribution — stub: ComingSoon
 *   /inquiries — redirect: → /inbox?kind=lead (same intake as Leads)
 *   /pipeline — redirect: → /delivery, kept for old bookmarks
 *   /analytics — redirect: → /insights
 *   /attribution — redirect: → /settings
 *   /timesheet/meetings — redirect: → /timesheet/review?tab=meetings
 *
 * On the client hub instead of the dock (Karol, 12 Sep — see ON_HUB in the
 * mockup): meeting notes, notebooks, inspiration, paid ads and vault all also
 * hang a link off /clients/[slug]; tasks and tickets keep their client filter
 * there too. That is a client-hub concern, not this file's.
 */
export const DOCK_NAV: readonly NavGroup[] = [
  {
    id: "time",
    label: "Time",
    icon: "clock",
    href: ROUTES.timesheetLive,
    items: [
      { href: ROUTES.timesheetLive, label: "Clock", icon: "timer" },
      { href: ROUTES.timesheet, label: "Timesheet", icon: "clock" },
      { href: ROUTES.timesheetReview, label: "Review", icon: "review" },
      { href: ROUTES.timesheetSheets, label: "Sheets", icon: "sheets" },
      { href: ROUTES.timesheetEntries, label: "Ledger", icon: "list" },
      { href: ROUTES.timesheetSessions, label: "Sessions", icon: "sessions" },
      { href: ROUTES.usage, label: "Usage", icon: "usage" },
    ],
  },
  {
    id: "inbox",
    label: "Inbox",
    icon: "inbox",
    href: ROUTES.inbox,
    items: [
      { href: ROUTES.inbox, label: "Inbox", icon: "inbox" },
      { href: ROUTES.support, label: "Tickets", icon: "support" },
      { href: ROUTES.leads, label: "Leads", icon: "leads" },
    ],
  },
  {
    id: "work",
    label: "Work",
    icon: "tasks",
    href: ROUTES.tasks,
    items: [
      { href: ROUTES.tasks, label: "Tasks", icon: "tasks" },
      { href: ROUTES.calendar, label: "Calendar", icon: "calendar" },
      { href: ROUTES.delivery, label: "Delivery", icon: "delivery" },
      { href: ROUTES.projects, label: "Projects", icon: "projects" },
      { href: ROUTES.retainers, label: "Retainers", icon: "retainers" },
      { href: ROUTES.punchlists, label: "Punch lists", icon: "punchlists" },
      { href: ROUTES.products, label: "Products", icon: "product" },
    ],
  },
  {
    id: "clients",
    label: "Clients",
    icon: "clients",
    href: ROUTES.clients,
    items: [
      { href: ROUTES.clients, label: "Clients", icon: "clients" },
      { href: ROUTES.insights, label: "Insights", icon: "analytics" },
      { href: ROUTES.paidAds, label: "Paid Ads", icon: "ads" },
      { href: ROUTES.reports, label: "Reports", icon: "reports" },
      { href: ROUTES.proposals, label: "Proposals", icon: "proposals" },
      { href: ROUTES.worksheets, label: "Worksheets", icon: "worksheets" },
      { href: ROUTES.contracts, label: "Contracts", icon: "contracts" },
      { href: ROUTES.meetingNotes, label: "Meeting notes", icon: "meeting-notes" },
      { href: ROUTES.notebooks, label: "Notebooks", icon: "notebooks" },
      { href: ROUTES.inspiration, label: "Inspiration", icon: "inspiration" },
    ],
  },
  {
    id: "money",
    label: "Money",
    icon: "invoices",
    href: ROUTES.invoices,
    items: [
      { href: ROUTES.invoices, label: "Invoices", icon: "invoices" },
      { href: ROUTES.revenue, label: "Revenue", icon: "revenue" },
      { href: ROUTES.expenses, label: "Expenses", icon: "expenses" },
    ],
  },
  {
    id: "studio",
    label: "Studio",
    icon: "scaffolds",
    href: ROUTES.vault,
    items: [
      { href: ROUTES.vault, label: "Vault", icon: "vault" },
      { href: ROUTES.hivemind, label: "HiveMind", icon: "hivemind" },
      { href: ROUTES.scaffolds, label: "Scaffolds", icon: "scaffolds" },
      { href: ROUTES.activity, label: "Activity", icon: "activity" },
      { href: ROUTES.uptime, label: "Uptime", icon: "uptime" },
      { href: ROUTES.logs, label: "Logs", icon: "logs" },
      { href: ROUTES.slinks, label: "Slinks", icon: "slinks" },
      { href: ROUTES.settings, label: "Settings", icon: "settings" },
    ],
  },
] as const

function flattenNav(sections: readonly NavSection[]): NavLink[] {
  return sections.flatMap((section) => section.items)
}

export function pathMatchesHref(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

/**
 * Longest-prefix match over a flat `NavSection[]` tree. Nothing in the app
 * builds that shape anymore now that the dock replaced the sidebar, but the
 * function stays correct and exported per the nav rebuild's brief — keep it
 * working rather than delete it out from under some future importer.
 */
export function resolveActiveHref(
  pathname: string,
  sections: readonly NavSection[] = []
): string | null {
  const matches = flattenNav(sections).filter((item) =>
    pathMatchesHref(pathname, item.href)
  )
  if (matches.length === 0) return null
  return matches.reduce((best, cur) =>
    cur.href.length > best.href.length ? cur : best
  ).href
}

export type ActiveNav = { group: NavGroup; item: NavLink }

/**
 * The dock+panel version of `resolveActiveHref`: longest-prefix match, but
 * across every group's items at once, returning which GROUP owns the match
 * as well as which row. Null on a chrome-only route — the dashboard, /chat,
 * or a parked settings page — where no group is "current" and the panel
 * should keep showing whatever it last had open rather than guess.
 */
export function resolveActiveNav(
  pathname: string,
  groups: readonly NavGroup[] = DOCK_NAV
): ActiveNav | null {
  let best: ActiveNav | null = null
  for (const group of groups) {
    for (const item of group.items) {
      if (!pathMatchesHref(pathname, item.href)) continue
      if (!best || item.href.length > best.item.href.length) {
        best = { group, item }
      }
    }
  }
  return best
}

/**
 * The one badge a group's dock icon wears, if any — the first row in the
 * group that has one. Deliberately NOT a sum: /inbox's own count is already
 * every unread thing in the group (it includes what Leads and Tickets show
 * separately), so adding them again would double it. Work, Clients, Money
 * and Studio have no badge source today and always return undefined, which
 * matches the mockup — only Time and Inbox carry a count in the dock.
 */
export function groupBadge(
  group: NavGroup,
  badges: Record<string, NavBadge>
): NavBadge | undefined {
  for (const item of group.items) {
    const badge = badges[item.href]
    if (badge && badge.count > 0) return badge
  }
  return undefined
}
