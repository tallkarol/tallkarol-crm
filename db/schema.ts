import { relations } from "drizzle-orm"
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  uniqueIndex,
  uuid,
  text,
  timestamp,
  jsonb,
  pgEnum,
} from "drizzle-orm/pg-core"
import type { ContractTerms } from "@/lib/contract"

export const userRoleEnum = pgEnum("user_role", ["admin", "customer"])
export const inquiryStatusEnum = pgEnum("inquiry_status", [
  "new",
  "contacted",
  "closed",
])
export const inquirySourceEnum = pgEnum("inquiry_source", [
  "contact",
  "retainer",
  "projects",
])

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  role: userRoleEnum("role").notNull().default("customer"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const magicLinks = pgTable("magic_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const inquiries = pgTable("inquiries", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  company: text("company"),
  source: inquirySourceEnum("source").notNull().default("contact"),
  projectTypes: text("project_types").array().notNull().default([]),
  payload: jsonb("payload").notNull().default({}),
  status: inquiryStatusEnum("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type User = typeof users.$inferSelect
export type Inquiry = typeof inquiries.$inferSelect
export type InquiryStatus = (typeof inquiryStatusEnum.enumValues)[number]
export type InquirySource = (typeof inquirySourceEnum.enumValues)[number]

export const retainerStatusEnum = pgEnum("retainer_status", [
  "active",
  "paused",
  "ended",
])
export const projectStatusEnum = pgEnum("project_status", [
  "waiting_on_content",
  "in_progress",
  "complete",
])
export const feeStatusEnum = pgEnum("fee_status", [
  "agreed",
  "deposit_paid",
  "paid",
])
export const deliverableStatusEnum = pgEnum("deliverable_status", [
  "pending",
  "done",
  "invoiced",
  "paid",
])
export const taskStatusEnum = pgEnum("task_status", ["open", "done"])
export const boardStageEnum = pgEnum("board_stage", ["queue", "doing", "waiting"])
export const reportStatusEnum = pgEnum("report_status", ["due", "filed"])
export const cadenceEnum = pgEnum("cadence", ["none", "weekly", "monthly"])
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
])
export const contractStatusEnum = pgEnum("contract_status", [
  "draft",
  "sent",
  "signed",
])

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** Email domains that identify this client on a meeting invite. */
  domains: text("domains").array().notNull().default([]),
  /** Invoice profile: { billTo: string[], customerId, senderEmail }. */
  billing: jsonb("billing").notNull().default({}),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const retainers = pgTable("retainers", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  hoursPerMonth: integer("hours_per_month").notNull(),
  rateCents: integer("rate_cents"),
  startsOn: date("starts_on"),
  endsOn: date("ends_on"),
  status: retainerStatusEnum("status").notNull().default("active"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  retainerId: uuid("retainer_id").references(() => retainers.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: projectStatusEnum("status").notNull().default("in_progress"),
  feeStatus: feeStatusEnum("fee_status").notNull().default("agreed"),
  links: jsonb("links").notNull().default([]),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const deliverables = pgTable("deliverables", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  title: text("title").notNull().default(""),
  status: deliverableStatusEnum("status").notNull().default("pending"),
  sort: integer("sort").notNull().default(0),
  feeCents: integer("fee_cents"),
  dueOn: date("due_on"),
})

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  clientId: uuid("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  retainerId: uuid("retainer_id").references(() => retainers.id, {
    onDelete: "cascade",
  }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  cadence: cadenceEnum("cadence").notNull().default("none"),
  status: taskStatusEnum("status").notNull().default("open"),
  dueOn: date("due_on"),
  boardStage: boardStageEnum("board_stage").notNull().default("queue"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  clientId: uuid("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  retainerId: uuid("retainer_id").references(() => retainers.id, {
    onDelete: "cascade",
  }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  cadence: cadenceEnum("cadence").notNull().default("none"),
  periodLabel: text("period_label").notNull().default(""),
  status: reportStatusEnum("status").notNull().default("due"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const invoices = pgTable("invoices", {
  id: uuid("id").defaultRandom().primaryKey(),
  number: text("number").notNull().unique(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  retainerId: uuid("retainer_id").references(() => retainers.id, {
    onDelete: "set null",
  }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  deliverableId: uuid("deliverable_id").references(() => deliverables.id, {
    onDelete: "set null",
  }),
  issuedOn: date("issued_on").notNull(),
  amountCents: integer("amount_cents").notNull(),
  hours: numeric("hours", { precision: 6, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  status: invoiceStatusEnum("status").notNull().default("sent"),
  billTo: text("bill_to").notNull().default(""),
  description: text("description").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const contracts = pgTable("contracts", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  retainerId: uuid("retainer_id").references(() => retainers.id, {
    onDelete: "set null",
  }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  status: contractStatusEnum("status").notNull().default("draft"),
  effectiveOn: date("effective_on"),
  feeCents: integer("fee_cents"),
  counterparty: text("counterparty").notNull().default(""),
  governingLaw: text("governing_law").notNull().default(""),
  venue: text("venue").notNull().default(""),
  extraRateCents: integer("extra_rate_cents"),
  terms: jsonb("terms").$type<ContractTerms>().notNull().default({}),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const timeEntries = pgTable("time_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  retainerId: uuid("retainer_id").references(() => retainers.id, {
    onDelete: "cascade",
  }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "cascade",
  }),
  invoiceId: uuid("invoice_id").references(() => invoices.id, {
    onDelete: "set null",
  }),
  calendarEventId: uuid("calendar_event_id").references(
    () => calendarEvents.id,
    { onDelete: "set null" }
  ),
  occurredOn: date("occurred_on").notNull(),
  startedAt: text("started_at").notNull().default(""),
  endedAt: text("ended_at").notNull().default(""),
  hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
  summary: text("summary").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const clientsRelations = relations(clients, ({ many }) => ({
  retainers: many(retainers),
  projects: many(projects),
  tasks: many(tasks),
  reports: many(reports),
  invoices: many(invoices),
  timeEntries: many(timeEntries),
  contracts: many(contracts),
}))

export const retainersRelations = relations(retainers, ({ one, many }) => ({
  client: one(clients, {
    fields: [retainers.clientId],
    references: [clients.id],
  }),
  projects: many(projects),
  tasks: many(tasks),
  reports: many(reports),
  invoices: many(invoices),
  timeEntries: many(timeEntries),
}))

export const projectsRelations = relations(projects, ({ one, many }) => ({
  client: one(clients, {
    fields: [projects.clientId],
    references: [clients.id],
  }),
  retainer: one(retainers, {
    fields: [projects.retainerId],
    references: [retainers.id],
  }),
  deliverables: many(deliverables),
  tasks: many(tasks),
  reports: many(reports),
  invoices: many(invoices),
  contracts: many(contracts),
  workstreams: many(workstreams),
}))

export const deliverablesRelations = relations(deliverables, ({ one }) => ({
  project: one(projects, {
    fields: [deliverables.projectId],
    references: [projects.id],
  }),
}))

export const contractsRelations = relations(contracts, ({ one }) => ({
  client: one(clients, {
    fields: [contracts.clientId],
    references: [clients.id],
  }),
  retainer: one(retainers, {
    fields: [contracts.retainerId],
    references: [retainers.id],
  }),
  project: one(projects, {
    fields: [contracts.projectId],
    references: [projects.id],
  }),
}))

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  client: one(clients, {
    fields: [invoices.clientId],
    references: [clients.id],
  }),
  retainer: one(retainers, {
    fields: [invoices.retainerId],
    references: [retainers.id],
  }),
  project: one(projects, {
    fields: [invoices.projectId],
    references: [projects.id],
  }),
  deliverable: one(deliverables, {
    fields: [invoices.deliverableId],
    references: [deliverables.id],
  }),
  timeEntries: many(timeEntries),
}))

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  client: one(clients, {
    fields: [timeEntries.clientId],
    references: [clients.id],
  }),
  retainer: one(retainers, {
    fields: [timeEntries.retainerId],
    references: [retainers.id],
  }),
  project: one(projects, {
    fields: [timeEntries.projectId],
    references: [projects.id],
  }),
  invoice: one(invoices, {
    fields: [timeEntries.invoiceId],
    references: [invoices.id],
  }),
}))

export const tasksRelations = relations(tasks, ({ one }) => ({
  client: one(clients, { fields: [tasks.clientId], references: [clients.id] }),
  retainer: one(retainers, {
    fields: [tasks.retainerId],
    references: [retainers.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
}))

export const reportsRelations = relations(reports, ({ one }) => ({
  client: one(clients, { fields: [reports.clientId], references: [clients.id] }),
  retainer: one(retainers, {
    fields: [reports.retainerId],
    references: [retainers.id],
  }),
  project: one(projects, {
    fields: [reports.projectId],
    references: [projects.id],
  }),
}))

export type Client = typeof clients.$inferSelect
export type Retainer = typeof retainers.$inferSelect
export type Project = typeof projects.$inferSelect
export type Deliverable = typeof deliverables.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Report = typeof reports.$inferSelect
export type RetainerStatus = (typeof retainerStatusEnum.enumValues)[number]
export type ProjectStatus = (typeof projectStatusEnum.enumValues)[number]
export type FeeStatus = (typeof feeStatusEnum.enumValues)[number]
export type DeliverableStatus =
  (typeof deliverableStatusEnum.enumValues)[number]
export type TaskStatus = (typeof taskStatusEnum.enumValues)[number]
export type ReportStatus = (typeof reportStatusEnum.enumValues)[number]
export type Cadence = (typeof cadenceEnum.enumValues)[number]
export type Invoice = typeof invoices.$inferSelect
export type TimeEntry = typeof timeEntries.$inferSelect
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number]
export type Contract = typeof contracts.$inferSelect
export type ContractStatus = (typeof contractStatusEnum.enumValues)[number]

export const calendarSourceKindEnum = pgEnum("calendar_source_kind", [
  "google",
  "cal_com",
  "ics",
])

export const calendarSources = pgTable("calendar_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  kind: calendarSourceKindEnum("kind").notNull(),
  label: text("label").notNull(),
  /**
   * google → the calendar id (usually the gmail address)
   * cal_com → empty; the API key in env decides the account
   * ics → the feed URL
   */
  externalId: text("external_id").notNull().default(""),
  color: text("color").notNull().default("#006965"),
  enabled: boolean("enabled").notNull().default(true),
  /** Only one google source should be writable — it receives events made here. */
  writable: boolean("writable").notNull().default(false),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error").notNull().default(""),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => calendarSources.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull().default(""),
    description: text("description").notNull().default(""),
    location: text("location").notNull().default(""),
    url: text("url").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    cancelled: boolean("cancelled").notNull().default(false),
    /** Waved off in the meeting inbox — never propose it again. */
    dismissed: boolean("dismissed").notNull().default(false),
    attendees: jsonb("attendees")
      .$type<CalendarAttendee[]>()
      .notNull()
      .default([]),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    inquiryId: uuid("inquiry_id").references(() => inquiries.id, {
      onDelete: "set null",
    }),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sourceExternal: uniqueIndex("calendar_events_source_external_idx").on(
      table.sourceId,
      table.externalId
    ),
    startsAt: index("calendar_events_starts_at_idx").on(table.startsAt),
  })
)

export const calendarSourcesRelations = relations(
  calendarSources,
  ({ many }) => ({
    events: many(calendarEvents),
  })
)

export const calendarEventsRelations = relations(calendarEvents, ({ one }) => ({
  source: one(calendarSources, {
    fields: [calendarEvents.sourceId],
    references: [calendarSources.id],
  }),
  client: one(clients, {
    fields: [calendarEvents.clientId],
    references: [clients.id],
  }),
  inquiry: one(inquiries, {
    fields: [calendarEvents.inquiryId],
    references: [inquiries.id],
  }),
}))

export type CalendarAttendee = {
  name: string
  email: string
}
export type CalendarSource = typeof calendarSources.$inferSelect
export type CalendarSourceKind =
  (typeof calendarSourceKindEnum.enumValues)[number]
export type CalendarEventRow = typeof calendarEvents.$inferSelect

/**
 * Snapshots of expensive third-party reads, so a page view never fans out to
 * Google. Written only when someone presses Refresh.
 */
export const reportCache = pgTable("report_cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  refreshedAt: timestamp("refreshed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastError: text("last_error").notNull().default(""),
})

export type ReportCache = typeof reportCache.$inferSelect

/** Single-row-per-key app settings (goals, preferences). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type AppSetting = typeof appSettings.$inferSelect

export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  occurredOn: date("occurred_on").notNull(),
  vendor: text("vendor").notNull(),
  description: text("description").notNull().default(""),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  category: text("category").notNull().default("uncategorized"),
  clientId: uuid("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  projectId: uuid("project_id").references(() => projects.id, {
    onDelete: "set null",
  }),
  retainerId: uuid("retainer_id").references(() => retainers.id, {
    onDelete: "set null",
  }),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const expensesRelations = relations(expenses, ({ one }) => ({
  client: one(clients, {
    fields: [expenses.clientId],
    references: [clients.id],
  }),
  project: one(projects, {
    fields: [expenses.projectId],
    references: [projects.id],
  }),
  retainer: one(retainers, {
    fields: [expenses.retainerId],
    references: [retainers.id],
  }),
}))

export type Expense = typeof expenses.$inferSelect

/** Delivery workstreams: build tracks inside a project (one kanban card each). */
export const workstreamStageEnum = pgEnum("workstream_stage", [
  "building",
  "review",
  "feedback",
  "approved",
  "live",
])

export const workstreams = pgTable("workstreams", {
  id: uuid("id").defaultRandom().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  stage: workstreamStageEnum("stage").notNull().default("building"),
  pass: integer("pass").notNull().default(1),
  notes: text("notes").notNull().default(""),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const workstreamsRelations = relations(workstreams, ({ one }) => ({
  project: one(projects, {
    fields: [workstreams.projectId],
    references: [projects.id],
  }),
}))

export type Workstream = typeof workstreams.$inferSelect
export type WorkstreamStage = (typeof workstreamStageEnum.enumValues)[number]

/**
 * One row per property we report on. GA4 and Search Console identifiers used to
 * be single env values, which capped the CRM at one site.
 */
export const sites = pgTable("sites", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /** No trailing slash — used to probe the first-party collector. */
  origin: text("origin").notNull().default(""),
  ga4PropertyId: text("ga4_property_id").notNull().default(""),
  /** `sc-domain:example.com` for a Domain property, else the URL prefix. */
  gscSiteUrl: text("gsc_site_url").notNull().default(""),
  /** Set only for sites running the first-party collector. */
  measurementId: text("measurement_id").notNull().default(""),
  clientId: uuid("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const sitesRelations = relations(sites, ({ one, many }) => ({
  client: one(clients, { fields: [sites.clientId], references: [clients.id] }),
  snapshotArchives: many(snapshotArchive),
}))

export type Site = typeof sites.$inferSelect

/**
 * One frozen month of insights data per site. Written when a month closes (on
 * the first refresh after it) or when a report is generated by hand; reports
 * render from these rows so a sent report never changes underneath you.
 */
export const snapshotArchive = pgTable(
  "snapshot_archive",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** `2026-08` — one row per site per period. */
    period: text("period").notNull(),
    /** `August 2026` — what people see. */
    label: text("label").notNull().default(""),
    payload: jsonb("payload").notNull(),
    reportId: uuid("report_id").references(() => reports.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sitePeriod: uniqueIndex("snapshot_archive_site_period_idx").on(
      table.siteId,
      table.period
    ),
  })
)

export const snapshotArchiveRelations = relations(snapshotArchive, ({ one }) => ({
  site: one(sites, {
    fields: [snapshotArchive.siteId],
    references: [sites.id],
  }),
  report: one(reports, {
    fields: [snapshotArchive.reportId],
    references: [reports.id],
  }),
}))

export type SnapshotArchive = typeof snapshotArchive.$inferSelect

/** Domains seen on meetings that will never belong to a client. */
export const ignoredDomains = pgTable("ignored_domains", {
  domain: text("domain").primaryKey(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export type IgnoredDomain = typeof ignoredDomains.$inferSelect
