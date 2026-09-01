export type NavIconName =
  | "dashboard"
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
  | "contracts"
  | "invoices"
  | "expenses"
  | "timesheet"
  | "clock"
  | "review"
  | "sheets"
  | "ledger"
  | "devices"
  | "attribution"
  | "analytics"
  | "reports"
  | "revenue"
  | "logs"
  | "support"
  | "uptime"
  | "notebooks"
  | "product"
  | "settings"
  | "team"
  | "email-settings"
  | "integrations"

export type NavLink = {
  href: string
  label: string
  icon: NavIconName
  children?: readonly NavLink[]
}

export type NavSection = {
  title?: string
  items: readonly NavLink[]
}

export const ROUTES = {
  home: "/",
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
  activity: "/activity",
  emails: "/emails",
  proposals: "/proposals",
  contracts: "/contracts",
  invoices: "/invoices",
  expenses: "/expenses",
  timesheet: "/timesheet",
  timesheetLive: "/timesheet/live",
  timesheetReview: "/timesheet/review",
  timesheetSheets: "/timesheet/sheets",
  timesheetEntries: "/timesheet/entries",
  timesheetMeetings: "/timesheet/review?tab=meetings",
  attribution: "/settings/attribution",
  insights: "/insights",
  reports: "/reports",
  revenue: "/revenue",
  logs: "/logs",
  support: "/support",
  uptime: "/uptime",
  notebooks: "/notebooks",
  settings: "/settings",
  settingsPortals: "/settings/portals",
  settingsTeam: "/settings/team",
  settingsEmail: "/settings/email",
  settingsIntegrations: "/settings/integrations",
  settingsDevices: "/settings/integrations/devices",
  settingsCalendar: "/settings/integrations/calendar",
  client: (slug: string) => `/clients/${slug}`,
  notebook: (slug: string) => `/notebooks/${slug}`,
  retainer: (slug: string) => `/retainers/${slug}`,
  project: (slug: string) => `/projects/${slug}`,
  products: "/products",
  productPage: (slug: string) => `/products/${slug}`,
  invoice: (number: string) => `/invoices/${number}`,
  timesheetFor: (client: string, month: string) =>
    `/timesheet/${encodeURIComponent(client)}/${encodeURIComponent(month)}`,
  contract: (slug: string) => `/contracts/${slug}`,
  inquiry: (id: string) => `/inquiries/${id}`,
} as const

export const ADMIN_NAV: readonly NavSection[] = [
  {
    items: [
      { href: ROUTES.home, label: "Dashboard", icon: "dashboard" },
      { href: ROUTES.inbox, label: "Inbox", icon: "inbox" },
      { href: ROUTES.leads, label: "Leads", icon: "leads" },
      { href: ROUTES.support, label: "Tickets", icon: "support" },
      { href: ROUTES.calendar, label: "Calendar", icon: "calendar" },
      { href: ROUTES.tasks, label: "Tasks", icon: "tasks" },
      {
        href: ROUTES.timesheet,
        label: "Timesheet",
        icon: "timesheet",
        children: [
          { href: ROUTES.timesheetLive, label: "Clock", icon: "clock" },
          { href: ROUTES.timesheetReview, label: "Review", icon: "review" },
          { href: ROUTES.timesheetSheets, label: "Sheets", icon: "sheets" },
          { href: ROUTES.timesheetEntries, label: "Ledger", icon: "ledger" },
        ],
      },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: ROUTES.insights, label: "Analytics", icon: "analytics" },
      { href: ROUTES.reports, label: "Reports", icon: "reports" },
      { href: ROUTES.revenue, label: "Revenue", icon: "revenue" },
      { href: ROUTES.logs, label: "Logs", icon: "logs" },
      { href: ROUTES.uptime, label: "Uptime", icon: "uptime" },
    ],
  },
  {
    title: "Delivery",
    items: [
      { href: ROUTES.delivery, label: "Delivery", icon: "delivery" },
      { href: ROUTES.projects, label: "Projects", icon: "projects" },
      { href: ROUTES.retainers, label: "Retainers", icon: "retainers" },
    ],
  },
  {
    title: "Products",
    items: [
      {
        href: ROUTES.products,
        label: "Products",
        icon: "product",
        children: [],
      },
    ],
  },
  {
    title: "Accounts",
    items: [
      { href: ROUTES.contacts, label: "Contacts", icon: "contacts" },
      { href: ROUTES.clients, label: "Clients", icon: "clients" },
      { href: ROUTES.notebooks, label: "Notebooks", icon: "notebooks" },
      { href: ROUTES.proposals, label: "Proposals", icon: "proposals" },
      { href: ROUTES.contracts, label: "Contracts", icon: "contracts" },
      { href: ROUTES.expenses, label: "Expenses", icon: "expenses" },
      { href: ROUTES.invoices, label: "Invoices", icon: "invoices" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { href: ROUTES.activity, label: "Activity", icon: "activity" },
      {
        href: ROUTES.settings,
        label: "Settings",
        icon: "settings",
        children: [
          { href: ROUTES.settingsPortals, label: "Client Portals", icon: "clients" },
          { href: ROUTES.settingsTeam, label: "Team", icon: "team" },
          { href: ROUTES.settingsEmail, label: "Email", icon: "email-settings" },
          {
            href: ROUTES.attribution,
            label: "Attribution",
            icon: "attribution",
          },
          {
            href: ROUTES.settingsIntegrations,
            label: "Integrations",
            icon: "integrations",
          },
          { href: ROUTES.settingsDevices, label: "Devices", icon: "devices" },
        ],
      },
    ],
  },
]

export type ProductNavItem = {
  slug: string
  name: string
}

/** Fills the Products section from the catalog so a new product is a nav link. */
export function adminNav(
  products: readonly ProductNavItem[] = []
): NavSection[] {
  return ADMIN_NAV.map((section) => {
    if (section.title !== "Products") return section
    return {
      title: "Products",
      items: [
        {
          href: ROUTES.products,
          label: "Products",
          icon: "product",
          children: products.map((product) => ({
            href: ROUTES.productPage(product.slug),
            label: product.name,
            icon: "product" as const,
          })),
        },
      ],
    }
  })
}

function flattenNav(sections: readonly NavSection[]): NavLink[] {
  return sections.flatMap((section) =>
    section.items.flatMap((item) =>
      item.children?.length ? [item, ...item.children] : [item]
    )
  )
}

export function pathMatchesHref(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/"
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function resolveActiveHref(
  pathname: string,
  sections: readonly NavSection[] = ADMIN_NAV
): string | null {
  const matches = flattenNav(sections).filter((item) =>
    pathMatchesHref(pathname, item.href)
  )
  if (matches.length === 0) return null
  return matches.reduce((best, cur) =>
    cur.href.length > best.href.length ? cur : best
  ).href
}
