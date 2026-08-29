export type NavIconName =
  | "dashboard"
  | "inbox"
  | "pipeline"
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
  | "attribution"
  | "analytics"
  | "reports"
  | "revenue"
  | "logs"
  | "support"
  | "uptime"
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
  inbox: "/inquiries",
  pipeline: "/pipeline",
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
  timesheetMeetings: "/timesheet/meetings",
  attribution: "/settings/attribution",
  insights: "/insights",
  reports: "/reports",
  revenue: "/revenue",
  logs: "/logs",
  support: "/support",
  uptime: "/uptime",
  settings: "/settings",
  settingsTeam: "/settings/team",
  settingsEmail: "/settings/email",
  settingsIntegrations: "/settings/integrations",
  settingsCalendar: "/settings/integrations/calendar",
  client: (slug: string) => `/clients/${slug}`,
  retainer: (slug: string) => `/retainers/${slug}`,
  project: (slug: string) => `/projects/${slug}`,
  invoice: (number: string) => `/invoices/${number}`,
  timesheetFor: (client: string, month: string) =>
    `/timesheet?client=${encodeURIComponent(client)}&month=${encodeURIComponent(month)}`,
  contract: (slug: string) => `/contracts/${slug}`,
} as const

export const ADMIN_NAV: readonly NavSection[] = [
  {
    items: [
      { href: ROUTES.home, label: "Dashboard", icon: "dashboard" },
      { href: ROUTES.inbox, label: "Inbox", icon: "inbox" },
      { href: ROUTES.calendar, label: "Calendar", icon: "calendar" },
      { href: ROUTES.tasks, label: "Tasks", icon: "tasks" },
      {
        href: ROUTES.timesheet,
        label: "Timesheet",
        icon: "timesheet",
        children: [
          {
            href: ROUTES.timesheetMeetings,
            label: "Meetings",
            icon: "calendar",
          },
        ],
      },
    ],
  },
  {
    title: "Pipeline",
    items: [
      { href: ROUTES.pipeline, label: "Board", icon: "pipeline" },
      { href: ROUTES.retainers, label: "Retainers", icon: "retainers" },
      { href: ROUTES.projects, label: "Projects", icon: "projects" },
      { href: ROUTES.leads, label: "Leads", icon: "leads" },
    ],
  },
  {
    title: "Accounts",
    items: [
      { href: ROUTES.contacts, label: "Contacts", icon: "contacts" },
      { href: ROUTES.clients, label: "Clients", icon: "clients" },
      { href: ROUTES.proposals, label: "Proposals", icon: "proposals" },
      { href: ROUTES.contracts, label: "Contracts", icon: "contracts" },
      { href: ROUTES.expenses, label: "Expenses", icon: "expenses" },
      { href: ROUTES.invoices, label: "Invoices", icon: "invoices" },
    ],
  },
  {
    title: "Insights",
    items: [
      { href: ROUTES.activity, label: "Activity", icon: "activity" },
      { href: ROUTES.insights, label: "Insights hub", icon: "analytics" },
      { href: ROUTES.reports, label: "Reports", icon: "reports" },
      { href: ROUTES.revenue, label: "Revenue", icon: "revenue" },
    ],
  },
  {
    title: "Workspace",
    items: [
      { href: ROUTES.logs, label: "Logs", icon: "logs" },
      { href: ROUTES.support, label: "Support Tickets", icon: "support" },
      { href: ROUTES.uptime, label: "Uptime", icon: "uptime" },
      {
        href: ROUTES.settings,
        label: "Settings",
        icon: "settings",
        children: [
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
        ],
      },
    ],
  },
]

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
