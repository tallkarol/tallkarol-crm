import { relations, sql } from "drizzle-orm"
import {
  boolean,
  customType,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
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
  "not_started",
  "waiting_on_content",
  "in_progress",
  "on_hold",
  "complete",
])
export const productStatusEnum = pgEnum("product_status", [
  "idea",
  "building",
  "live",
  "paused",
])
/** Who a product is built with: alone, a named studio, or another team. */
export const productStudioKindEnum = pgEnum("product_studio_kind", [
  "solo",
  "studio",
  "team",
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
export const proposalStatusEnum = pgEnum("proposal_status", [
  "draft",
  "sent",
  "accepted",
])
/**
 * A worksheet is an instrument, not a deliverable: a numbered question set the
 * studio fills in *about* an engagement. It moves blank → filled → review (the
 * client is reading it) → signed, which is why it shares no status enum with
 * reports (due/filed) or proposals (draft/sent/accepted).
 */
export const worksheetStatusEnum = pgEnum("worksheet_status", [
  "blank",
  "filled",
  "review",
  "signed",
])
/** How the answers got there — the three intake modes the instruments define. */
export const worksheetModeEnum = pgEnum("worksheet_mode", [
  "client",
  "interview",
  "portal",
])
export const cadenceEnum = pgEnum("cadence", [
  "none",
  "weekly",
  "monthly",
  "quarterly",
])
export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
])
export const punchStatusEnum = pgEnum("punch_status", [
  "running",
  "stopped",
  "approved",
  "discarded",
])

export const contractStatusEnum = pgEnum("contract_status", [
  "draft",
  "sent",
  "signed",
])

/**
 * Where the relationship is, not what work is attached. A client can have a
 * finished project and an active retainer — this is the one status Karol sets.
 */
export const clientStatusEnum = pgEnum("client_status", [
  "new",
  "proposal_submitted",
  "in_negotiation",
  "proposal_agreed",
  "deposit_paid",
  "project_started",
  "deliverable_invoice_submitted",
  "final_invoice_submitted",
  "project_finished",
  "active_retainer",
  "lapsed_retainer",
  "completed_work",
  "in_contact",
  "internal",
])

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: clientStatusEnum("status").notNull().default("new"),
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

export const projects = pgTable(
  "projects",
  {
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
    /** manual | smartsheet_tracker — where this row came from. */
    source: text("source").notNull().default("manual"),
    /** The upstream row id. Null for projects typed here. */
    externalId: text("external_id"),
    /**
     * The upstream status verbatim. The sheet has wording our enum flattens
     * ("Needs Review" lands on in_progress), so write-back compares against
     * this to know whether the status genuinely changed here — otherwise a
     * note added in the CRM would quietly overwrite the client's own wording.
     */
    sourceStatus: text("source_status").notNull().default(""),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  // Nulls are distinct in Postgres, so projects typed here (external_id null)
  // are unconstrained while synced rows stay one-to-one with their source row.
  (table) => ({
    sourceExternal: uniqueIndex("projects_source_external_idx").on(
      table.source,
      table.externalId
    ),
  })
)

/**
 * A banner products hang off: Tall Karol, a named studio (Sondry), or another team.
 * A studio can point at a client so notions and mail have somewhere to land.
 */
export const productStudios = pgTable("product_studios", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  kind: productStudioKindEnum("kind").notNull().default("studio"),
  clientId: uuid("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  notes: text("notes").notNull().default(""),
  sort: integer("sort").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * Own digital products — not client engagements. Each one belongs to a studio
 * (Tall Karol, Sondry, a future team). The client is optional: Sondry products
 * share the Sondry account so notebooks and mail work; Tall Karol products may not.
 */
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  studioId: uuid("studio_id")
    .notNull()
    .references(() => productStudios.id, { onDelete: "cascade" }),
  clientId: uuid("client_id").references(() => clients.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  tagline: text("tagline").notNull().default(""),
  status: productStatusEnum("status").notNull().default("building"),
  links: jsonb("links").notNull().default([]),
  notes: text("notes").notNull().default(""),
  sort: integer("sort").notNull().default(0),
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

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    /** Who owns the work. One admin today; phase 0 for a second person. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    retainerId: uuid("retainer_id").references(() => retainers.id, {
      onDelete: "cascade",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    /** Own product this work is for — Spectramotus, Jive, and the rest. */
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "cascade",
    }),
    /** The specific billable line this work finishes, when there is one. */
    deliverableId: uuid("deliverable_id").references(() => deliverables.id, {
      onDelete: "set null",
    }),
    cadence: cadenceEnum("cadence").notNull().default("none"),
    status: taskStatusEnum("status").notNull().default("open"),
    /** 1 high · 2 normal · 3 low. */
    priority: smallint("priority").notNull().default(2),
    sort: integer("sort").notNull().default(0),
    dueOn: date("due_on"),
    /** Hide until this day — deliberately not a deadline. */
    snoozedUntil: date("snoozed_until"),
    boardStage: boardStageEnum("board_stage").notNull().default("queue"),
    notes: text("notes").notNull().default(""),
    /**
     * What the row is besides plain work — "feature request", "change request" —
     * plus commercial flags like "covered under warranty". Same free-text-array
     * contract as `support_tickets.tags`.
     */
    labels: text("labels").array().notNull().default([]),
    /** manual | renewal | ticket | meeting | api | mail */
    source: text("source").notNull().default("manual"),
    /** What this task was made out of, for the trail. */
    refKind: text("ref_kind"),
    refId: uuid("ref_id"),
    /**
     * When it was actually finished. `updated_at` used to carry this and it
     * meant "done today" really meant "edited today".
     */
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    open: index("tasks_open_idx").on(table.status, table.dueOn),
    byClient: index("tasks_client_idx").on(table.clientId, table.status),
    byProject: index("tasks_project_idx")
      .on(table.projectId)
      .where(sql`${table.projectId} is not null`),
    byProduct: index("tasks_product_idx")
      .on(table.productId)
      .where(sql`${table.productId} is not null`),
  })
)

/** Checklist items — the small steps inside one task. */
export const taskItems = pgTable(
  "task_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    done: boolean("done").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    byTask: index("task_items_task_idx").on(table.taskId, table.sort),
  })
)

/** A saved lens on the task list — the leftmost control in the filter bar. */
export const taskViews = pgTable(
  "task_views",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    criteria: jsonb("criteria").notNull().default({}),
    layout: text("layout").notNull().default("list"),
    grouping: text("grouping").notNull().default("none"),
    sortBy: text("sort_by").notNull().default("due"),
    position: integer("position").notNull().default(0),
    /** Seeded views can be renamed and reordered but not deleted. */
    builtIn: boolean("built_in").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userSlug: uniqueIndex("task_views_user_slug_unique").on(
      table.userId,
      table.slug
    ),
  })
)

/**
 * One row per period a recurring task was completed in. A repeating task is a
 * single row that keeps reopening, so without this there is no record that
 * August's maintenance actually happened.
 */
export const taskCompletions = pgTable(
  "task_completions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** The period key it satisfied: 2026-W36, 2026-09, 2026-Q3. */
    period: text("period").notNull(),
    completedOn: date("completed_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    byTask: index("task_completions_task_idx").on(
      table.taskId,
      table.completedOn.desc()
    ),
    taskPeriod: uniqueIndex("task_completions_task_period_unique").on(
      table.taskId,
      table.period
    ),
  })
)

export const taskItemsRelations = relations(taskItems, ({ one }) => ({
  task: one(tasks, { fields: [taskItems.taskId], references: [tasks.id] }),
}))

export const taskViewsRelations = relations(taskViews, ({ one }) => ({
  user: one(users, { fields: [taskViews.userId], references: [users.id] }),
}))

export const taskCompletionsRelations = relations(taskCompletions, ({ one }) => ({
  task: one(tasks, { fields: [taskCompletions.taskId], references: [tasks.id] }),
}))

export type TaskItem = typeof taskItems.$inferSelect
export type TaskView = typeof taskViews.$inferSelect
export type TaskCompletion = typeof taskCompletions.$inferSelect

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    /** Set when the report has a readable HTML body under content/docs. */
    slug: text("slug"),
    /** Path relative to content/docs — e.g. reports/google-ads-review.html */
    bodyPath: text("body_path").notNull().default(""),
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
  },
  (table) => ({
    slug: uniqueIndex("reports_slug_unique")
      .on(table.slug)
      .where(sql`${table.slug} is not null`),
  })
)

/**
 * Client-facing proposals — the documents you send, not the Notion scan
 * actionables in `notion_proposals`.
 */
export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    bodyPath: text("body_path").notNull().default(""),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    retainerId: uuid("retainer_id").references(() => retainers.id, {
      onDelete: "cascade",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    /** Shared name for a multi-part set — e.g. "Page to Report". */
    series: text("series").notNull().default(""),
    seriesPart: smallint("series_part"),
    seriesOf: smallint("series_of"),
    status: proposalStatusEnum("status").notNull().default("draft"),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slug: uniqueIndex("proposals_slug_unique").on(table.slug),
    byClient: index("proposals_client_idx").on(table.clientId, table.status),
  })
)

/**
 * Brainstorm — raw scope ideas caught before a proposal exists. Client mail
 * and calls throw these off constantly; a row here keeps each one attached to
 * the client until a proposal absorbs it, instead of living in a mail thread.
 */
export const brainstormNotes = pgTable(
  "brainstorm_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    /** Shared name for a batch of ideas — e.g. "Chartmetric API scope". */
    topic: text("topic").notNull().default(""),
    body: text("body").notNull(),
    /** manual | mail | meeting */
    source: text("source").notNull().default("manual"),
    /** What the note was captured out of, for the trail. */
    refKind: text("ref_kind"),
    refId: uuid("ref_id"),
    /** Set once a proposal picks the idea up — the note's exit. */
    proposalId: uuid("proposal_id").references(() => proposals.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    byClient: index("brainstorm_notes_client_idx").on(
      table.clientId,
      table.createdAt
    ),
  })
)

/**
 * Filled-in instruments — the Search Priorities Workbook and friends. Same
 * body-on-disk contract as reports and proposals, but the row tracks what a
 * worksheet is actually judged on: which instrument and version it is, how it
 * was filled, and how many questions are still unanswered.
 */
export const worksheets = pgTable(
  "worksheets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    bodyPath: text("body_path").notNull().default(""),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "cascade",
    }),
    retainerId: uuid("retainer_id").references(() => retainers.id, {
      onDelete: "cascade",
    }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "cascade",
    }),
    /** The instrument this is an instance of — the same one is filled per client. */
    instrument: text("instrument").notNull().default(""),
    /** Instrument version, not document revision — "v1". */
    version: text("version").notNull().default(""),
    mode: worksheetModeEnum("mode").notNull().default("interview"),
    status: worksheetStatusEnum("status").notNull().default("blank"),
    filledOn: date("filled_on"),
    questionCount: smallint("question_count"),
    /** Questions still waiting on a human — what the worksheet is chased for. */
    openCount: smallint("open_count").notNull().default(0),
    /** Worksheets hold raw client answers, so they stay off the portal by default. */
    internal: boolean("internal").notNull().default(true),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    slug: uniqueIndex("worksheets_slug_unique").on(table.slug),
    byClient: index("worksheets_client_idx").on(table.clientId, table.status),
    byInstrument: index("worksheets_instrument_idx").on(table.instrument),
  })
)

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

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Who worked the hours. One admin today; every row is backfilled to them. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Where the row came from: manual | clock | meeting. */
    source: text("source").notNull().default("manual"),
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
  },
  (table) => ({
    // The sheet browser rolls every client-month up at once.
    clientDay: index("time_entries_client_day_idx").on(
      table.clientId,
      table.occurredOn
    ),
    day: index("time_entries_day_idx").on(table.occurredOn),
  })
)

/**
 * A raw clock-in/clock-out event. Deliberately separate from `time_entries`:
 * nothing here is billable until it is approved, so every existing query that
 * sums time entries stays correct without knowing punches exist.
 */
export const timePunches = pgTable(
  "time_punches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** A punch always names the account it bills to, project or not. */
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    status: punchStatusEnum("status").notNull().default("running"),
    note: text("note").notNull().default(""),
    /** api | watch | web — how the punch was made. */
    source: text("source").notNull().default("api"),
    deviceId: uuid("device_id").references(() => deviceTokens.id, {
      onDelete: "set null",
    }),
    /** Device-generated id so a retry over a flaky link is a no-op. */
    clientRequestId: text("client_request_id"),
    timeEntryId: uuid("time_entry_id").references(() => timeEntries.id, {
      onDelete: "set null",
    }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // Several timers may run at once — a build for one client while another's
    // ticket gets answered — so nothing here caps running punches per person.
    // What `lib/punches.ts` still refuses is the same target twice.
    request: uniqueIndex("time_punches_request_idx")
      .on(table.userId, table.clientRequestId)
      .where(sql`${table.clientRequestId} is not null`),
    recent: index("time_punches_recent_idx").on(
      table.userId,
      table.startedAt.desc()
    ),
    status: index("time_punches_status_idx").on(
      table.status,
      table.startedAt.desc()
    ),
  })
)

/**
 * Bearer credentials for anything that is not a browser — a watch, a phone
 * shortcut, a script. One per device so revoking a lost phone does not lock
 * out everything else.
 */
export const deviceTokens = pgTable("device_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const timePunchesRelations = relations(timePunches, ({ one }) => ({
  user: one(users, {
    fields: [timePunches.userId],
    references: [users.id],
  }),
  client: one(clients, {
    fields: [timePunches.clientId],
    references: [clients.id],
  }),
  project: one(projects, {
    fields: [timePunches.projectId],
    references: [projects.id],
  }),
  timeEntry: one(timeEntries, {
    fields: [timePunches.timeEntryId],
    references: [timeEntries.id],
  }),
  device: one(deviceTokens, {
    fields: [timePunches.deviceId],
    references: [deviceTokens.id],
  }),
}))

export const deviceTokensRelations = relations(deviceTokens, ({ one }) => ({
  user: one(users, {
    fields: [deviceTokens.userId],
    references: [users.id],
  }),
}))

export type TimePunch = typeof timePunches.$inferSelect
export type PunchStatus = (typeof punchStatusEnum.enumValues)[number]
export type DeviceToken = typeof deviceTokens.$inferSelect

export const clientsRelations = relations(clients, ({ many }) => ({
  retainers: many(retainers),
  projects: many(projects),
  products: many(products),
  productStudios: many(productStudios),
  tasks: many(tasks),
  reports: many(reports),
  proposals: many(proposals),
  worksheets: many(worksheets),
  invoices: many(invoices),
  timeEntries: many(timeEntries),
  contracts: many(contracts),
  notionLinks: many(notionLinks),
}))

export const retainersRelations = relations(retainers, ({ one, many }) => ({
  client: one(clients, {
    fields: [retainers.clientId],
    references: [clients.id],
  }),
  projects: many(projects),
  tasks: many(tasks),
  reports: many(reports),
  proposals: many(proposals),
  worksheets: many(worksheets),
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
  proposals: many(proposals),
  worksheets: many(worksheets),
  invoices: many(invoices),
  contracts: many(contracts),
  workstreams: many(workstreams),
}))

export const productStudiosRelations = relations(
  productStudios,
  ({ one, many }) => ({
    client: one(clients, {
      fields: [productStudios.clientId],
      references: [clients.id],
    }),
    products: many(products),
  })
)

export const productsRelations = relations(products, ({ one, many }) => ({
  studio: one(productStudios, {
    fields: [products.studioId],
    references: [productStudios.id],
  }),
  client: one(clients, {
    fields: [products.clientId],
    references: [clients.id],
  }),
  tasks: many(tasks),
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

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  client: one(clients, { fields: [tasks.clientId], references: [clients.id] }),
  retainer: one(retainers, {
    fields: [tasks.retainerId],
    references: [retainers.id],
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  product: one(products, {
    fields: [tasks.productId],
    references: [products.id],
  }),
  deliverable: one(deliverables, {
    fields: [tasks.deliverableId],
    references: [deliverables.id],
  }),
  user: one(users, { fields: [tasks.userId], references: [users.id] }),
  items: many(taskItems),
  completions: many(taskCompletions),
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

export const proposalsRelations = relations(proposals, ({ one }) => ({
  client: one(clients, { fields: [proposals.clientId], references: [clients.id] }),
  retainer: one(retainers, {
    fields: [proposals.retainerId],
    references: [retainers.id],
  }),
  project: one(projects, {
    fields: [proposals.projectId],
    references: [projects.id],
  }),
}))

export const brainstormNotesRelations = relations(brainstormNotes, ({ one }) => ({
  client: one(clients, {
    fields: [brainstormNotes.clientId],
    references: [clients.id],
  }),
  proposal: one(proposals, {
    fields: [brainstormNotes.proposalId],
    references: [proposals.id],
  }),
}))

export const worksheetsRelations = relations(worksheets, ({ one }) => ({
  client: one(clients, { fields: [worksheets.clientId], references: [clients.id] }),
  retainer: one(retainers, {
    fields: [worksheets.retainerId],
    references: [retainers.id],
  }),
  project: one(projects, {
    fields: [worksheets.projectId],
    references: [projects.id],
  }),
}))

export type Client = typeof clients.$inferSelect
export type ClientStatus = (typeof clientStatusEnum.enumValues)[number]
export type Retainer = typeof retainers.$inferSelect
export type Project = typeof projects.$inferSelect
export type ProductStudio = typeof productStudios.$inferSelect
export type ProductStudioKind =
  (typeof productStudioKindEnum.enumValues)[number]
export type Product = typeof products.$inferSelect
export type ProductStatus = (typeof productStatusEnum.enumValues)[number]
export type Deliverable = typeof deliverables.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Report = typeof reports.$inferSelect
export type Proposal = typeof proposals.$inferSelect
export type ProposalStatus = (typeof proposalStatusEnum.enumValues)[number]
export type BrainstormNote = typeof brainstormNotes.$inferSelect
export type Worksheet = typeof worksheets.$inferSelect
export type WorksheetStatus = (typeof worksheetStatusEnum.enumValues)[number]
export type WorksheetMode = (typeof worksheetModeEnum.enumValues)[number]
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
  /** UptimeRobot monitor id. Empty = no monitor; no uptime number. */
  uptimeMonitorId: text("uptime_monitor_id").notNull().default(""),
  /** Google Ads customer id, digits only. Empty = this site has no Ads account. */
  adsCustomerId: text("ads_customer_id").notNull().default(""),
  /** Vercel project id (`prj_…`). Empty = no Host tab / Web Analytics pull. */
  vercelProjectId: text("vercel_project_id").notNull().default(""),
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

/**
 * What a client's codebases are made of, as read from the code itself by the
 * daedalus-hive-mind `spec-sheet` tool (and, later, its siblings: folder
 * structure, db diagram, feature list, permissions). One row per run, so a
 * rerun after a change is a new row and the previous state stays readable;
 * the latest `generated_at` per (client, codebase, kind) is the current sheet.
 * `data` is the tool's own JSON contract (`schema_version` says which).
 */
export const codebaseDocs = pgTable(
  "codebase_docs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    /** The codebase's own slug under the client — "crm", "gdi-multisite". */
    codebase: text("codebase").notNull(),
    /** spec | structure | db | features | permissions */
    kind: text("kind").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    title: text("title").notNull().default(""),
    /** One line for lists: "Next.js 14.2 · Drizzle · Postgres · Railway". */
    summary: text("summary").notNull().default(""),
    data: jsonb("data").notNull().default({}),
    commitHash: text("commit_hash").notNull().default(""),
    branch: text("branch").notNull().default(""),
    /** Which tool and version produced it — "spec-sheet.py 1.0". */
    tool: text("tool").notNull().default(""),
    /** Where on disk it was scanned; informational. */
    sourcePath: text("source_path").notNull().default(""),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    latest: index("codebase_docs_latest_idx").on(
      table.clientId,
      table.codebase,
      table.kind,
      table.generatedAt.desc()
    ),
  })
)

export const codebaseDocsRelations = relations(codebaseDocs, ({ one }) => ({
  client: one(clients, { fields: [codebaseDocs.clientId], references: [clients.id] }),
  site: one(sites, { fields: [codebaseDocs.siteId], references: [sites.id] }),
  project: one(projects, { fields: [codebaseDocs.projectId], references: [projects.id] }),
  product: one(products, { fields: [codebaseDocs.productId], references: [products.id] }),
}))

export type CodebaseDoc = typeof codebaseDocs.$inferSelect

export const sitesRelations = relations(sites, ({ one, many }) => ({
  client: one(clients, { fields: [sites.clientId], references: [clients.id] }),
  snapshotArchives: many(snapshotArchive),
  experiments: many(experiments),
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

/** Tickets funneled in from external systems (Smartsheet first). */
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: text("source").notNull().default("smartsheet"),
    externalId: text("external_id").notNull(),
    number: text("number").notNull().default(""),
    title: text("title").notNull().default(""),
    status: text("status").notNull().default(""),
    priority: text("priority").notNull().default(""),
    requestType: text("request_type").notNull().default(""),
    department: text("department").notNull().default(""),
    submittedBy: text("submitted_by").notNull().default(""),
    submittedOn: date("submitted_on"),
    dueOn: date("due_on"),
    description: text("description").notNull().default(""),
    resolution: text("resolution").notNull().default(""),
    contactEmail: text("contact_email").notNull().default(""),
    customerContact: text("customer_contact").notNull().default(""),
    completed: boolean("completed").notNull().default(false),
    /** Shopify / WooCommerce / WordPress / Webflow / Next.js app / … — set per
     *  ticket, not per client: one client can run several things we maintain. */
    platform: text("platform").notNull().default(""),
    /** incident (something broke) · request (scope worth quoting) · question. */
    kind: text("kind").notNull().default("incident"),
    /**
     * Normalized triage state set here in the CRM — open / progress / waiting /
     * closed. Empty means "derive it from `status` + `completed`", which is what
     * Smartsheet-sourced rows do until someone moves them by hand. A sync that
     * sees a changed upstream status clears this so the source wins again.
     */
    state: text("state").notNull().default(""),
    assignee: text("assignee").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    /** First outbound reply — what makes an ageing ticket go red. */
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    sourceId: uuid("source_id"),
    raw: jsonb("raw").notNull().default({}),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    sourceExternal: uniqueIndex("support_tickets_external_unique_idx").on(
      table.source,
      table.externalId
    ),
  })
)

/** The thread on a ticket: client mail, our replies, bot/monitor notices. */
export const ticketMessages = pgTable(
  "ticket_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    /** client | me | bot | system */
    role: text("role").notNull().default("client"),
    author: text("author").notNull().default(""),
    authorEmail: text("author_email").notNull().default(""),
    body: text("body").notNull().default(""),
    /** Message id from the source system, so re-ingest doesn't duplicate. */
    externalId: text("external_id").notNull().default(""),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    byTicket: index("ticket_messages_ticket_idx").on(table.ticketId, table.sentAt),
  })
)

/**
 * One code block per row — error JSON, a stack trace, SQL, a redirect map.
 * Kept out of the ticket row so a 400-line trace never bloats the queue query.
 */
export const ticketPayloads = pgTable(
  "ticket_payloads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    label: text("label").notNull().default(""),
    lang: text("lang").notNull().default("txt"),
    body: text("body").notNull().default(""),
    lines: integer("lines").notNull().default(0),
    bytes: integer("bytes").notNull().default(0),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    byTicket: index("ticket_payloads_ticket_idx").on(table.ticketId, table.position),
  })
)

export const supportTicketsRelations = relations(
  supportTickets,
  ({ one, many }) => ({
    client: one(clients, {
      fields: [supportTickets.clientId],
      references: [clients.id],
    }),
    messages: many(ticketMessages),
    payloads: many(ticketPayloads),
    attachments: many(ticketAttachments),
  })
)

export const ticketMessagesRelations = relations(ticketMessages, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [ticketMessages.ticketId],
    references: [supportTickets.id],
  }),
}))

export const ticketPayloadsRelations = relations(ticketPayloads, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [ticketPayloads.ticketId],
    references: [supportTickets.id],
  }),
}))

export type SupportTicket = typeof supportTickets.$inferSelect
export type TicketMessage = typeof ticketMessages.$inferSelect
export type TicketPayload = typeof ticketPayloads.$inferSelect

/** Who can open the client portal, per client. A grant is the access itself. */
export const portalGrants = pgTable(
  "portal_grants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    emailClient: uniqueIndex("portal_grants_email_client_unique_idx").on(
      table.email,
      table.clientId
    ),
  })
)

export const portalGrantsRelations = relations(portalGrants, ({ one }) => ({
  client: one(clients, {
    fields: [portalGrants.clientId],
    references: [clients.id],
  }),
}))

export type PortalGrant = typeof portalGrants.$inferSelect

/** One flattened Notion block: enough to render text and deep-link back. */
export type NotionBlock = {
  id: string
  type: string
  text: string
  depth: number
  checked?: boolean
}

/** A client notebook: the Notion page the integration was granted on. */
export const notionLinks = pgTable("notion_links", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  notionPageId: text("notion_page_id").notNull().unique(),
  title: text("title").notNull().default(""),
  url: text("url").notNull().default(""),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/**
 * Local mirror of every page under a linked notebook. Agents read this,
 * never the live Notion API.
 */
export const notionPages = pgTable(
  "notion_pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    linkId: uuid("link_id")
      .notNull()
      .references(() => notionLinks.id, { onDelete: "cascade" }),
    notionId: text("notion_id").notNull().unique(),
    parentNotionId: text("parent_notion_id").notNull().default(""),
    title: text("title").notNull().default(""),
    url: text("url").notNull().default(""),
    blocks: jsonb("blocks").$type<NotionBlock[]>().notNull().default([]),
    /** Blocks joined as plain text, for search and prompt-building. */
    plainText: text("plain_text").notNull().default(""),
    /** Notion's last_edited_time; unchanged pages skip block re-fetch. */
    notionEditedAt: timestamp("notion_edited_at", { withTimezone: true }),
    /** When the scan agent last read this page; edits after this re-queue it. */
    scannedAt: timestamp("scanned_at", { withTimezone: true }),
    /** Gone from the walk or archived in Notion; kept for history. */
    archived: boolean("archived").notNull().default(false),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    linkIdx: index("notion_pages_link_idx").on(table.linkId),
  })
)

export const notionProposalStatusEnum = pgEnum("notion_proposal_status", [
  "proposed",
  "accepted",
  "dismissed",
])

/**
 * Actionables the scan agent found in notebook pages. Nothing becomes a task
 * until a human accepts it; dismissed fingerprints are never re-proposed.
 */
export const notionProposals = pgTable(
  "notion_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    linkId: uuid("link_id")
      .notNull()
      .references(() => notionLinks.id, { onDelete: "cascade" }),
    pageId: uuid("page_id")
      .notNull()
      .references(() => notionPages.id, { onDelete: "cascade" }),
    /** Notion block the item came from; deep-links via url#blockid. */
    blockId: text("block_id").notNull().default(""),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    /** Exact source text, shown as evidence next to the proposal. */
    quote: text("quote").notNull().default(""),
    /** Hash of page + normalized title; dedupes across repeated scans. */
    fingerprint: text("fingerprint").notNull().unique(),
    status: notionProposalStatusEnum("status").notNull().default("proposed"),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => ({
    linkStatusIdx: index("notion_proposals_link_status_idx").on(
      table.linkId,
      table.status
    ),
  })
)

export const notionLinksRelations = relations(notionLinks, ({ one, many }) => ({
  client: one(clients, {
    fields: [notionLinks.clientId],
    references: [clients.id],
  }),
  pages: many(notionPages),
  proposals: many(notionProposals),
}))

export const notionProposalsRelations = relations(notionProposals, ({ one }) => ({
  link: one(notionLinks, {
    fields: [notionProposals.linkId],
    references: [notionLinks.id],
  }),
  page: one(notionPages, {
    fields: [notionProposals.pageId],
    references: [notionPages.id],
  }),
  task: one(tasks, {
    fields: [notionProposals.taskId],
    references: [tasks.id],
  }),
}))

export type NotionProposal = typeof notionProposals.$inferSelect

export const notionPagesRelations = relations(notionPages, ({ one }) => ({
  link: one(notionLinks, {
    fields: [notionPages.linkId],
    references: [notionLinks.id],
  }),
}))

export type NotionLink = typeof notionLinks.$inferSelect
export type NotionPage = typeof notionPages.$inferSelect


/* ---------------------------------------------------------------------------
 * Wired apps: the client apps and sites that report into the CRM.
 * ------------------------------------------------------------------------ */

/**
 * One row per app allowed to post here. The key is the identity — client
 * attribution comes from the row, never from the payload, so a leaked key can
 * only ever file against its own client.
 */
export const appSources = pgTable("app_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull().default(""),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  /** Default platform stamped on tickets from this app. */
  platform: text("platform").notNull().default(""),
  secretHash: text("secret_hash").notNull(),
  scopes: text("scopes").array().notNull().default(["tickets", "runs", "events"]),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

/**
 * A scheduled job we watch. `expectEveryMinutes` + `graceMinutes` is what makes
 * a run that never happens visible — the sweeper compares them against
 * `lastRunAt`, since a job that doesn't start reports nothing at all.
 */
export const monitors = pgTable("monitors", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull().default(""),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  sourceId: uuid("source_id").references(() => appSources.id, { onDelete: "set null" }),
  /** Human wording for the schedule — "11:30 UTC daily". */
  scheduleNote: text("schedule_note").notNull().default(""),
  expectEveryMinutes: integer("expect_every_minutes").notNull().default(1440),
  graceMinutes: integer("grace_minutes").notNull().default(180),
  /**
   * How often we bother to check for a missed window. Detection cadence follows
   * the engagement, not the schedule: a client on a maintenance plan is worth
   * looking at hourly, one without is looked at twice a day. The cron runs more
   * often than any monitor needs; each monitor decides whether it's due.
   */
  sweepEveryMinutes: integer("sweep_every_minutes").notNull().default(720),
  lastSweptAt: timestamp("last_swept_at", { withTimezone: true }),
  /** Percent of jobs allowed to fail before a partial run raises a ticket. */
  partialThreshold: integer("partial_threshold").notNull().default(10),
  paused: boolean("paused").notNull().default(false),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  failStreak: integer("fail_streak").notNull().default(0),
  /** The incident currently open for this monitor, if any. */
  openTicketId: uuid("open_ticket_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const monitorRuns = pgTable(
  "monitor_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    /** The app's own run id, so start and finish land on one row. */
    externalId: text("external_id").notNull().default(""),
    /** running | succeeded | partial | failed | missed */
    status: text("status").notNull().default("running"),
    trigger: text("trigger").notNull().default(""),
    phase: text("phase").notNull().default(""),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    jobsTotal: integer("jobs_total").notNull().default(0),
    jobsSucceeded: integer("jobs_succeeded").notNull().default(0),
    jobsFailed: integer("jobs_failed").notNull().default(0),
    jobsSkipped: integer("jobs_skipped").notNull().default(0),
    error: jsonb("error"),
    stats: jsonb("stats").notNull().default({}),
    ticketId: uuid("ticket_id").references(() => supportTickets.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byMonitor: index("monitor_runs_monitor_started_idx").on(table.monitorId, table.startedAt),
  })
)

/** The activity stream — sign-ins, access requests, deliveries. Not debug logs. */
export const appEvents = pgTable(
  "app_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sourceId: uuid("source_id").references(() => appSources.id, { onDelete: "set null" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    /** Dotted name: auth.signed_in, access.requested, report.delivered, run.failed. */
    kind: text("kind").notNull(),
    /** info | warn | error */
    severity: text("severity").notNull().default("info"),
    actor: text("actor").notNull().default(""),
    summary: text("summary").notNull().default(""),
    /** Rolled-up events (five failed sign-ins in ten minutes) carry a count. */
    count: integer("count").notNull().default(1),
    meta: jsonb("meta").notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byTime: index("app_events_occurred_idx").on(table.occurredAt),
  })
)

/**
 * Screenshots and files on a ticket. `data` holds the bytes today; `storageKey`
 * is the seam for moving them to provisioned storage without touching callers.
 */
export const ticketAttachments = pgTable(
  "ticket_attachments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),
    name: text("name").notNull().default(""),
    mime: text("mime").notNull().default("application/octet-stream"),
    bytes: integer("bytes").notNull().default(0),
    data: customType<{ data: Buffer; driverData: Buffer }>({
      dataType: () => "bytea",
    })("data"),
    storageKey: text("storage_key").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byTicket: index("ticket_attachments_ticket_idx").on(table.ticketId),
  })
)

export const appSourcesRelations = relations(appSources, ({ one, many }) => ({
  client: one(clients, { fields: [appSources.clientId], references: [clients.id] }),
  monitors: many(monitors),
}))

export const monitorsRelations = relations(monitors, ({ one, many }) => ({
  client: one(clients, { fields: [monitors.clientId], references: [clients.id] }),
  source: one(appSources, { fields: [monitors.sourceId], references: [appSources.id] }),
  runs: many(monitorRuns),
}))

export const monitorRunsRelations = relations(monitorRuns, ({ one }) => ({
  monitor: one(monitors, { fields: [monitorRuns.monitorId], references: [monitors.id] }),
  ticket: one(supportTickets, { fields: [monitorRuns.ticketId], references: [supportTickets.id] }),
}))

export const appEventsRelations = relations(appEvents, ({ one }) => ({
  source: one(appSources, { fields: [appEvents.sourceId], references: [appSources.id] }),
  client: one(clients, { fields: [appEvents.clientId], references: [clients.id] }),
}))

export const ticketAttachmentsRelations = relations(ticketAttachments, ({ one }) => ({
  ticket: one(supportTickets, {
    fields: [ticketAttachments.ticketId],
    references: [supportTickets.id],
  }),
}))

export type AppSource = typeof appSources.$inferSelect
export type Monitor = typeof monitors.$inferSelect
export type MonitorRun = typeof monitorRuns.$inferSelect
export type AppEvent = typeof appEvents.$inferSelect
export type TicketAttachment = typeof ticketAttachments.$inferSelect

/* ------------------------------------------------------------------ inbox */

/**
 * Per-item triage state for the unified inbox.
 *
 * Unread is the ABSENCE of a row — so nothing needs backfilling when a new
 * source starts feeding the stream, and a source can be added without
 * touching this table at all. `ref_id` is text rather than uuid because not
 * every source is keyed by one.
 */
export const inboxState = pgTable(
  "inbox_state",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** lead | ticket | message | mail | event */
    refKind: text("ref_kind").notNull(),
    refId: text("ref_id").notNull(),
    /** read | snoozed | archived */
    state: text("state").notNull().default("read"),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ref: uniqueIndex("inbox_state_ref_idx").on(table.refKind, table.refId),
  })
)

/**
 * Inbound mail read out of the CRM mailbox, before it becomes anything.
 *
 * The CRM is a reader here, not the system of record — Fastmail keeps the
 * real archive. A row lands untriaged; converting it sets `ticket_id` and it
 * stops being its own inbox item.
 */
export const inboxMail = pgTable(
  "inbox_mail",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** RFC message id, so a re-sync never duplicates. */
    messageId: text("message_id").notNull(),
    threadId: text("thread_id").notNull().default(""),
    inReplyTo: text("in_reply_to").notNull().default(""),
    fromName: text("from_name").notNull().default(""),
    fromEmail: text("from_email").notNull().default(""),
    toEmail: text("to_email").notNull().default(""),
    subject: text("subject").notNull().default(""),
    snippet: text("snippet").notNull().default(""),
    body: text("body").notNull().default(""),
    /** Matched from the sender's domain against clients.domains. */
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    /** Set once the mail has been turned into a ticket. */
    ticketId: uuid("ticket_id").references(() => supportTickets.id, { onDelete: "set null" }),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byMessage: uniqueIndex("inbox_mail_message_idx").on(table.messageId),
    byReceived: index("inbox_mail_received_idx").on(table.receivedAt),
  })
)

export const inboxMailRelations = relations(inboxMail, ({ one }) => ({
  client: one(clients, { fields: [inboxMail.clientId], references: [clients.id] }),
  ticket: one(supportTickets, { fields: [inboxMail.ticketId], references: [supportTickets.id] }),
}))

export type InboxState = typeof inboxState.$inferSelect
export type InboxMail = typeof inboxMail.$inferSelect

/**
 * Search Console index scans — the evidence half of a maintenance package.
 *
 * The Index Coverage report has no API, so a "scan" is one URL Inspection call
 * per sitemap URL plus one sitemaps call. Runs on a schedule (first week of the
 * month, currently by hand), never on page load: 63 inspections is 8 seconds
 * and 3% of the daily quota, and a page that re-scans on every refresh would
 * burn both.
 *
 * This table is the archive — what the site looked like on a given day. The
 * lifecycle of any individual problem lives in `gscFindings`.
 */
export const gscScans = pgTable(
  "gsc_scans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** The day the scan ran. One scan per site per day. */
    scannedOn: date("scanned_on").notNull(),
    /** `2026-08` — matches snapshotArchive, so a month rolls up across both. */
    period: text("period").notNull(),
    urlCount: integer("url_count").notNull().default(0),
    passCount: integer("pass_count").notNull().default(0),
    /** Findings this scan opened, re-saw, and closed. For the invoice line. */
    openedCount: integer("opened_count").notNull().default(0),
    resolvedCount: integer("resolved_count").notNull().default(0),
    sitemaps: jsonb("sitemaps").notNull().default(sql`'[]'::jsonb`),
    /** Every per-URL row, verbatim. The thing a dispute gets settled with. */
    results: jsonb("results").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    siteDay: uniqueIndex("gsc_scans_site_day_idx").on(table.siteId, table.scannedOn),
    byPeriod: index("gsc_scans_period_idx").on(table.siteId, table.period),
  })
)

/**
 * One row per problem, not per sighting.
 *
 * `key` is derived from the rule and the URL, so the same broken page found in
 * March and again in August is one row with `timesSeen` 2 — not two findings.
 * That is what makes "what did we fix this month" a query rather than a memory:
 * resolved rows carry the date they stopped appearing and the task that closed
 * them, and the task carries the client and retainer the work bills to.
 */
export const gscFindings = pgTable(
  "gsc_findings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** `<rule>:<url>` — stable across scans, which is the whole point. */
    key: text("key").notNull(),
    rule: text("rule").notNull(),
    url: text("url").notNull().default(""),
    /** 1 blocking · 2 should fix · 3 watch. Mirrors tasks.priority. */
    severity: smallint("severity").notNull().default(2),
    /** open | resolved | ignored — ignored is a decision, not a failure. */
    status: text("status").notNull().default("open"),
    detail: text("detail").notNull().default(""),
    firstSeenOn: date("first_seen_on").notNull(),
    lastSeenOn: date("last_seen_on").notNull(),
    /** The first scan that did NOT see it. Absence is the evidence of a fix. */
    resolvedOn: date("resolved_on"),
    timesSeen: integer("times_seen").notNull().default(1),
    /** The maintenance task this was rolled into, for the billing trail. */
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    siteKey: uniqueIndex("gsc_findings_site_key_idx").on(table.siteId, table.key),
    open: index("gsc_findings_open_idx").on(table.siteId, table.status),
    resolved: index("gsc_findings_resolved_idx").on(table.siteId, table.resolvedOn),
  })
)

export const gscScansRelations = relations(gscScans, ({ one }) => ({
  site: one(sites, { fields: [gscScans.siteId], references: [sites.id] }),
}))

export const gscFindingsRelations = relations(gscFindings, ({ one }) => ({
  site: one(sites, { fields: [gscFindings.siteId], references: [sites.id] }),
  task: one(tasks, { fields: [gscFindings.taskId], references: [tasks.id] }),
}))

export type GscScan = typeof gscScans.$inferSelect
export type GscFinding = typeof gscFindings.$inferSelect

/**
 * A change we made on purpose, and the readings that tell us whether it did
 * anything.
 *
 * This is a work log with numbers attached rather than a statistics engine: no
 * randomisation, no control group, no significance test. It answers "we did X
 * on this date — what happened to the pages we care about?" and keeps each
 * answer frozen so a figure quoted in October still reads the same in December.
 */
export const experiments = pgTable(
  "experiments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),
    /** `homepage-intake-form` — unique per site, used in URLs. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** What we expect to happen, written before the result is known. */
    hypothesis: text("hypothesis").notNull().default(""),
    /** What actually shipped, in plain words. */
    changeNote: text("change_note").notNull().default(""),
    /** The day the change went live. Checkpoint windows count from here. */
    startedOn: date("started_on").notNull(),
    /** The pre-period the baseline reading covers. */
    baselineFrom: date("baseline_from").notNull(),
    baselineTo: date("baseline_to").notNull(),
    /**
     * Pages this experiment watches:
     * `[{ key, label, path, role }]` where role is `target` (what we changed),
     * `guardrail` (what it might cannibalise) or `context`.
     */
    pages: jsonb("pages").notNull().default(sql`'[]'::jsonb`),
    /** Values of the GA4 `form_location` dimension worth splitting out. */
    formLocations: jsonb("form_locations").notNull().default(sql`'[]'::jsonb`),
    /** running | concluded | abandoned */
    status: text("status").notNull().default("running"),
    /** Filled in at the end: supported | refuted | inconclusive | "" */
    verdict: text("verdict").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    siteSlug: uniqueIndex("experiments_site_slug_idx").on(table.siteId, table.slug),
    siteStatus: index("experiments_site_status_idx").on(table.siteId, table.status),
  })
)

/**
 * One frozen reading. Never rewritten in place — recapturing a checkpoint
 * replaces the row, which is the only way a number here should ever change.
 */
export const experimentReadings = pgTable(
  "experiment_readings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    experimentId: uuid("experiment_id")
      .notNull()
      .references(() => experiments.id, { onDelete: "cascade" }),
    /** `baseline`, `d30`, `d60`, `d90` — or anything else for an ad-hoc look. */
    checkpoint: text("checkpoint").notNull(),
    windowFrom: date("window_from").notNull(),
    windowTo: date("window_to").notNull(),
    /** `ReadingPayload` — per-page funnel counts, sitewide totals, CRM leads. */
    payload: jsonb("payload").notNull(),
    note: text("note").notNull().default(""),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    once: uniqueIndex("experiment_readings_checkpoint_idx").on(
      table.experimentId,
      table.checkpoint
    ),
  })
)

export const experimentsRelations = relations(experiments, ({ one, many }) => ({
  site: one(sites, { fields: [experiments.siteId], references: [sites.id] }),
  readings: many(experimentReadings),
}))

export const experimentReadingsRelations = relations(experimentReadings, ({ one }) => ({
  experiment: one(experiments, {
    fields: [experimentReadings.experimentId],
    references: [experiments.id],
  }),
}))

export type Experiment = typeof experiments.$inferSelect
export type ExperimentReading = typeof experimentReadings.$inferSelect

/**
 * Logins, API keys, and host passwords for work in flight.
 * The secret itself is AES-256-GCM (`lib/vault-data.ts`); everything else is
 * searchable plaintext so a title or username can be found without decrypting.
 */
export const vaultEntries = pgTable(
  "vault_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    /** login | api | ssh | other */
    kind: text("kind").notNull().default("login"),
    url: text("url").notNull().default(""),
    username: text("username").notNull().default(""),
    secretBlob: text("secret_blob").notNull().default(""),
    notes: text("notes").notNull().default(""),
    clientId: uuid("client_id").references(() => clients.id, {
      onDelete: "set null",
    }),
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    clientIdx: index("vault_entries_client_idx").on(table.clientId),
    updatedIdx: index("vault_entries_updated_idx").on(table.updatedAt),
  })
)

export const vaultEntriesRelations = relations(vaultEntries, ({ one }) => ({
  client: one(clients, {
    fields: [vaultEntries.clientId],
    references: [clients.id],
  }),
  author: one(users, {
    fields: [vaultEntries.createdBy],
    references: [users.id],
  }),
}))

export type VaultEntry = typeof vaultEntries.$inferSelect

/* ------------------------------------------------------------ web push */

/**
 * One row per browser that opted in. The endpoint is the identity — a
 * browser re-subscribing after a key rotation shows up as a new endpoint, and
 * the old one is pruned the first time the push service answers 404 or 410.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  userAgent: text("user_agent").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
  failCount: integer("fail_count").notNull().default(0),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
})

/**
 * Everything ever sent, and the reason nothing is sent twice: the unique index
 * on (kind, dedupe_key) is the dedupe. A flag that stays raised for five days
 * inserts once and is rejected four times.
 */
export const notificationLog = pgTable(
  "notification_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    url: text("url").notNull().default(""),
    /** Rows written on first run to remember what existed, without sending. */
    seeded: boolean("seeded").notNull().default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    clickedAt: timestamp("clicked_at", { withTimezone: true }),
  },
  (table) => ({
    once: uniqueIndex("notification_log_once_idx").on(table.kind, table.dedupeKey),
    recent: index("notification_log_recent_idx").on(table.sentAt),
  })
)

export type PushSubscription = typeof pushSubscriptions.$inferSelect
export type NotificationLogRow = typeof notificationLog.$inferSelect
