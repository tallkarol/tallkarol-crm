CREATE TABLE IF NOT EXISTS "app_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"platform" text DEFAULT '' NOT NULL,
	"secret_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{tickets,runs,events}'::text[] NOT NULL,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"source_id" uuid,
	"schedule_note" text DEFAULT '' NOT NULL,
	"expect_every_minutes" integer DEFAULT 1440 NOT NULL,
	"grace_minutes" integer DEFAULT 180 NOT NULL,
	"partial_threshold" integer DEFAULT 10 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"fail_streak" integer DEFAULT 0 NOT NULL,
	"open_ticket_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "monitor_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_id" uuid NOT NULL,
	"external_id" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"trigger" text DEFAULT '' NOT NULL,
	"phase" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" integer,
	"jobs_total" integer DEFAULT 0 NOT NULL,
	"jobs_succeeded" integer DEFAULT 0 NOT NULL,
	"jobs_failed" integer DEFAULT 0 NOT NULL,
	"jobs_skipped" integer DEFAULT 0 NOT NULL,
	"error" jsonb,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ticket_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid,
	"client_id" uuid,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"actor" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"data" "bytea",
	"storage_key" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'incident' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "source_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_sources" ADD CONSTRAINT "app_sources_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitors" ADD CONSTRAINT "monitors_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitors" ADD CONSTRAINT "monitors_source_id_app_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."app_sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitors" ADD CONSTRAINT "monitors_open_ticket_id_support_tickets_id_fk" FOREIGN KEY ("open_ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "monitor_runs" ADD CONSTRAINT "monitor_runs_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_events" ADD CONSTRAINT "app_events_source_id_app_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."app_sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_events" ADD CONSTRAINT "app_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_attachments" ADD CONSTRAINT "ticket_attachments_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_source_id_app_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."app_sources"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monitor_runs_monitor_started_idx" ON "monitor_runs" ("monitor_id","started_at" DESC);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "monitor_runs_external_idx" ON "monitor_runs" ("monitor_id","external_id") WHERE "external_id" <> '';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_events_occurred_idx" ON "app_events" ("occurred_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_events_kind_idx" ON "app_events" ("kind","occurred_at" DESC);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_attachments_ticket_idx" ON "ticket_attachments" ("ticket_id");
