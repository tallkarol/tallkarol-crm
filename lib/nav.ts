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
  | "notifications"
  | "colors"
  | "portals"
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
 * One of the groups on the dock: an icon in the 76px rail, and the pages
 * that live in its 236px panel. `href` is the group's landing page — the
 * dock icon is a real link there, not just a panel toggle.
 */
export type NavGroup = {
  id: string
  label: string
  icon: NavIconName
  href: string
  items: readonly NavLink[]
  /**
   * No panel: the group's pages carry their own tabs (Time → the Timesheet's
   * Dashboard / Clock / Review / Sheets / Ledger), so the icon is a plain
   * link to the landing page, like the monogram. The items stay listed —
   * they are how a page knows its group, and what ⌘K searches.
   */
  noPanel?: boolean
  /**
   * The panel is the client list, not these rows. AppShell (and the phone
   * sheet) render `ClientsPanel` from the roster the admin layout loads, so
   * the list is there from the first paint beside every page in the group.
   * Karol, 24 Sep 2026: the rows were the old submenu — they showed for a
   * beat on /clients until the roster page could swap the list in. The rows
   * stay for what `noPanel` keeps them for: the dock highlight and ⌘K.
   */
  clientList?: boolean
  /**
   * Docked at the foot of the rail, above the chrome (chat, the panel
   * toggle, search), rather than in the group column. On the phone these
   * come last in the bottom bar, in the same order.
   */
  bottom?: boolean
  /** Phone only: an icon in the top bar beside Search and Chat instead of a bottom-bar tab. */
  topBar?: boolean
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
/**
 * A product's rooms — the product hub (24 Sep 2026, Karol: "products should
 * run similar to clients"). `/products/[slug]` is the Board; the rest are
 * children, and a punch list's page nests under Punch lists.
 */
export const PRODUCT_ROOMS = [
  { id: "board", label: "Board", icon: "projects" },
  { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "notes", label: "Notes", icon: "notebooks" },
  { id: "punchlists", label: "Punch lists", icon: "punchlists" },
] as const satisfies readonly { id: string; label: string; icon: NavIconName }[]
export type ProductRoomId = (typeof PRODUCT_ROOMS)[number]["id"]

/** The product a pathname is inside, or null — `/products` (the list) is not inside one. */
export function productSlugOf(pathname: string): string | null {
  const m = /^\/products\/([^/]+)(?:\/|$)/.exec(pathname)
  return m ? decodeURIComponent(m[1]) : null
}

export function productRoomOf(pathname: string): ProductRoomId | null {
  const m = /^\/products\/[^/]+(?:\/([^/]+))?/.exec(pathname)
  if (!m) return null
  const seg = m[1]
  if (!seg) return "board"
  return PRODUCT_ROOMS.some((r) => r.id === seg) ? (seg as ProductRoomId) : null
}

export function clientSlugOf(pathname: string): string | null {
  const m = /^\/clients\/([^/]+)(?:\/|$)/.exec(pathname)
  return m ? decodeURIComponent(m[1]) : null
}

export function clientRoomOf(pathname: string): ClientRoomId | null {
  const m = /^\/clients\/[^/]+(?:\/([^/]+))?/.exec(pathname)
  if (!m) return null
  const seg = m[1]
  if (!seg) return "board"
  if (seg in ROOM_OF_SUBPAGE) return ROOM_OF_SUBPAGE[seg]
  return CLIENT_ROOMS.some((r) => r.id === seg) ? (seg as ClientRoomId) : null
}

/**
 * Every page inside a client — the rooms, and the project and punch list
 * pages that moved in on 24 Sep 2026 — as one revalidation target:
 * `revalidatePath(CLIENT_PAGES, "layout")`. A mutation that knows only a
 * project or a list, not its client, refreshes them all rather than guess.
 */
export const CLIENT_PAGES = "/clients/[slug]"

/** A client's project and punch list pages belong to the room that lists them. */
const ROOM_OF_SUBPAGE: Record<string, ClientRoomId> = {
  projects: "dashboards",
  punchlists: "dashboards",
}

export const ROUTES = {
  home: "/",
  chat: "/chat",
  chatThread: (id: string) => `/chat?thread=${id}`,
  inbox: "/inbox",
  inquiries: "/inquiries",
  contacts: "/contacts",
  clients: "/clients",
  retainers: "/retainers",
  leads: "/leads",
  calendar: "/calendar",
  tasks: "/tasks",
  task: (id: string) => `/tasks/${id}`,
  activity: "/activity",
  emails: "/emails",
  proposals: "/proposals",
  worksheets: "/worksheets",
  /**
   * A punch list's short link. Punch lists live inside their client
   * (`clientPunchlist`); this path redirects there, which keeps every link
   * already sent — notifications, the Mac widgets, push — working.
   */
  punchlist: (slug: string) => `/punchlists/${slug}`,
  clientPunchlist: (client: string, slug: string) => `/clients/${client}/punchlists/${slug}`,
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
  sessions: "/admin/sessions",
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
  /** A project's short link — redirects into its client, as `punchlist` does. */
  project: (slug: string) => `/projects/${slug}`,
  clientProject: (client: string, slug: string) => `/clients/${client}/projects/${slug}`,
  products: "/products",
  productPage: (slug: string) => `/products/${slug}`,
  productRoom: (slug: string, room: ProductRoomId) =>
    room === "board" ? `/products/${slug}` : `/products/${slug}/${room}`,
  productPunchlist: (product: string, slug: string) => `/products/${product}/punchlists/${slug}`,
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
 * 24 Sep 2026, Karol: Tasks, Calendar and Products left Work for icons of
 * their own (`noPanel` — one page each, nothing for a panel to list);
 * Delivery was deleted, Retainers moved to Money, and projects and punch
 * lists moved inside their client (/clients/[slug]/projects/…,
 * /clients/[slug]/punchlists/…) — which left Work empty, so it went too.
 * Studio went the same way: HiveMind is an icon of its own, and Vault,
 * Scaffolds and Slinks joined Products, which has a panel again.
 *
 * Time, Money and Admin sit at the foot of the rail (`bottom`), in that
 * order, above the chrome. Admin holds Settings and its five pages (parked
 * off the dock until then), Activity, Uptime and Logs (from the old Studio), and
 * Sessions and Usage out of Time; Sessions left the Timesheet's tabs for a
 * page of its own at /admin/sessions, and the old URL redirects.
 *
 * Chrome, not a group: `/` (the monogram), and at the foot of the rail
 * under Admin: `/chat`, the panel toggle, ⌘K search, and the avatar menu
 * (theme, hide-money, sign out).
 *
 * Parked — reachable by URL and ⌘K (`PARKED_NAV` below), not in the dock:
 *   none since Admin gave the settings pages a home.
 *
 * Off every surface:
 *   /contacts — stub: ComingSoon, no contacts table
 *   /emails — stub: ComingSoon, never in the nav
 *   /settings/team — stub: ComingSoon, one admin
 *   /settings/email — stub: ComingSoon
 *   /settings/attribution — stub: ComingSoon
 *   /inquiries — redirect: → /inbox?kind=lead (same intake as Leads)
 *   /pipeline, /delivery, /projects, /punchlists — redirect (next.config):
 *     → /clients. Delivery was deleted 24 Sep 2026 (its data layer,
 *     lib/delivery.ts, still feeds the Mac widgets); the project and punch
 *     list lists went the same day, their pages moved inside the client.
 *   /projects/[slug], /punchlists/[slug] — redirect pages into the client.
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
    // Karol, 24 Sep 2026: the tabs are the menu; land on their Dashboard.
    href: ROUTES.timesheet,
    noPanel: true,
    bottom: true,
    items: [
      { href: ROUTES.timesheetLive, label: "Clock", icon: "timer" },
      { href: ROUTES.timesheet, label: "Timesheet", icon: "clock" },
      { href: ROUTES.timesheetReview, label: "Review", icon: "review" },
      { href: ROUTES.timesheetSheets, label: "Sheets", icon: "sheets" },
      { href: ROUTES.timesheetEntries, label: "Ledger", icon: "list" },
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
    id: "tasks",
    label: "Tasks",
    icon: "tasks",
    href: ROUTES.tasks,
    noPanel: true,
    items: [{ href: ROUTES.tasks, label: "Tasks", icon: "tasks" }],
  },
  {
    id: "calendar",
    label: "Calendar",
    icon: "calendar",
    href: ROUTES.calendar,
    noPanel: true,
    items: [{ href: ROUTES.calendar, label: "Calendar", icon: "calendar" }],
  },
  {
    id: "clients",
    label: "Clients",
    icon: "clients",
    href: ROUTES.clients,
    clientList: true,
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
    id: "products",
    label: "Products",
    icon: "product",
    href: ROUTES.products,
    items: [
      { href: ROUTES.products, label: "Products", icon: "product" },
      { href: ROUTES.vault, label: "Vault", icon: "vault" },
      { href: ROUTES.scaffolds, label: "Scaffolds", icon: "scaffolds" },
      { href: ROUTES.slinks, label: "Slinks", icon: "slinks" },
    ],
  },
  {
    id: "hivemind",
    label: "HiveMind",
    icon: "hivemind",
    href: ROUTES.hivemind,
    noPanel: true,
    items: [{ href: ROUTES.hivemind, label: "HiveMind", icon: "hivemind" }],
  },
  {
    id: "money",
    label: "Money",
    icon: "invoices",
    href: ROUTES.invoices,
    bottom: true,
    items: [
      { href: ROUTES.invoices, label: "Invoices", icon: "invoices" },
      { href: ROUTES.retainers, label: "Retainers", icon: "retainers" },
      { href: ROUTES.revenue, label: "Revenue", icon: "revenue" },
      { href: ROUTES.expenses, label: "Expenses", icon: "expenses" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    icon: "settings",
    href: ROUTES.settings,
    bottom: true,
    topBar: true,
    items: [
      { href: ROUTES.settings, label: "Settings", icon: "settings" },
      { href: ROUTES.settingsNotifications, label: "Notifications", icon: "notifications" },
      { href: ROUTES.settingsIntegrations, label: "Integrations", icon: "integrations" },
      { href: ROUTES.settingsDevices, label: "Devices", icon: "devices" },
      { href: ROUTES.settingsPortals, label: "Client portals", icon: "portals" },
      { href: ROUTES.settingsColors, label: "Colours", icon: "colors" },
      { href: ROUTES.activity, label: "Activity", icon: "activity" },
      { href: ROUTES.sessions, label: "Sessions", icon: "sessions" },
      { href: ROUTES.usage, label: "Usage", icon: "usage" },
      { href: ROUTES.uptime, label: "Uptime", icon: "uptime" },
      { href: ROUTES.logs, label: "Logs", icon: "logs" },
    ],
  },
] as const

/**
 * What ⌘K reaches besides the dock: the chrome routes and the parked pages
 * listed above DOCK_NAV. Keep this and that list in step — a page parked
 * there and missing here is reachable by URL only.
 */
export const CHROME_NAV: readonly { href: string; label: string }[] = [
  { href: ROUTES.home, label: "Dashboard" },
  { href: ROUTES.chat, label: "Chat" },
]
export const PARKED_NAV: readonly { href: string; label: string }[] = []

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
