CREATE TYPE "public"."punchlist_status" AS ENUM('draft', 'open', 'done', 'void');--> statement-breakpoint
CREATE TABLE "agent_sessions" (
	"session_ref" text PRIMARY KEY NOT NULL,
	"surface" text DEFAULT 'claude' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"cwd" text DEFAULT '' NOT NULL,
	"repos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"files_touched" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"summary" text DEFAULT '' NOT NULL,
	"highlights" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"meter_hours" numeric(6, 2) DEFAULT '0' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"summarized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "punchlist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"punchlist_id" uuid NOT NULL,
	"section" text DEFAULT '' NOT NULL,
	"section_sort" smallint DEFAULT 0 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT '' NOT NULL,
	"reported" text DEFAULT '' NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"task_id" uuid,
	"test" jsonb,
	"last_test_status" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "punchlist_test_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"spec" jsonb NOT NULL,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"verdict" text DEFAULT '' NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"session_ref" text,
	"runner" text DEFAULT '' NOT NULL,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "punchlists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"retainer_id" uuid,
	"status" "punchlist_status" DEFAULT 'draft' NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"source_kind" text DEFAULT 'doc' NOT NULL,
	"source_ref" text DEFAULT '' NOT NULL,
	"source_text" text DEFAULT '' NOT NULL,
	"generated_by" text DEFAULT '' NOT NULL,
	"session_ref" text,
	"ref_kind" text,
	"ref_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entry_sessions" (
	"time_entry_id" uuid NOT NULL,
	"session_ref" text NOT NULL,
	"share_hours" numeric(6, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_sessions" ADD CONSTRAINT "agent_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punchlist_items" ADD CONSTRAINT "punchlist_items_punchlist_id_punchlists_id_fk" FOREIGN KEY ("punchlist_id") REFERENCES "public"."punchlists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punchlist_items" ADD CONSTRAINT "punchlist_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punchlist_test_runs" ADD CONSTRAINT "punchlist_test_runs_item_id_punchlist_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."punchlist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punchlist_test_runs" ADD CONSTRAINT "punchlist_test_runs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punchlist_test_runs" ADD CONSTRAINT "punchlist_test_runs_session_ref_agent_sessions_session_ref_fk" FOREIGN KEY ("session_ref") REFERENCES "public"."agent_sessions"("session_ref") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punchlists" ADD CONSTRAINT "punchlists_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punchlists" ADD CONSTRAINT "punchlists_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punchlists" ADD CONSTRAINT "punchlists_retainer_id_retainers_id_fk" FOREIGN KEY ("retainer_id") REFERENCES "public"."retainers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "punchlists" ADD CONSTRAINT "punchlists_session_ref_agent_sessions_session_ref_fk" FOREIGN KEY ("session_ref") REFERENCES "public"."agent_sessions"("session_ref") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_sessions" ADD CONSTRAINT "time_entry_sessions_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_sessions" ADD CONSTRAINT "time_entry_sessions_session_ref_agent_sessions_session_ref_fk" FOREIGN KEY ("session_ref") REFERENCES "public"."agent_sessions"("session_ref") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_sessions_client_idx" ON "agent_sessions" USING btree ("client_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "punchlist_items_list_idx" ON "punchlist_items" USING btree ("punchlist_id","section_sort","sort");--> statement-breakpoint
CREATE INDEX "punchlist_items_task_idx" ON "punchlist_items" USING btree ("task_id") WHERE "punchlist_items"."task_id" is not null;--> statement-breakpoint
CREATE INDEX "punchlist_test_runs_item_idx" ON "punchlist_test_runs" USING btree ("item_id","requested_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "punchlist_test_runs_open_idx" ON "punchlist_test_runs" USING btree ("status") WHERE "punchlist_test_runs"."status" in ('queued', 'running');--> statement-breakpoint
CREATE UNIQUE INDEX "punchlist_test_runs_request_idx" ON "punchlist_test_runs" USING btree ("client_request_id") WHERE "punchlist_test_runs"."client_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "punchlists_slug_unique" ON "punchlists" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "punchlists_ref_idx" ON "punchlists" USING btree ("ref_kind","ref_id") WHERE "punchlists"."ref_id" is not null;--> statement-breakpoint
CREATE INDEX "punchlists_client_idx" ON "punchlists" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "punchlists_project_idx" ON "punchlists" USING btree ("project_id") WHERE "punchlists"."project_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "time_entry_sessions_pk" ON "time_entry_sessions" USING btree ("time_entry_id","session_ref");--> statement-breakpoint
CREATE INDEX "time_entry_sessions_session_idx" ON "time_entry_sessions" USING btree ("session_ref");