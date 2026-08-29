DO $$ BEGIN
 CREATE TYPE "public"."punch_status" AS ENUM('running', 'stopped', 'approved', 'discarded');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "user_id" uuid;
--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "time_entries" SET "source" = 'meeting' WHERE "calendar_event_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "time_entries" SET "user_id" = (
  SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1
) WHERE "user_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_entries_client_day_idx" ON "time_entries" ("client_id","occurred_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_entries_day_idx" ON "time_entries" ("occurred_on");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "time_punches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"project_id" uuid,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"status" "punch_status" DEFAULT 'running' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'api' NOT NULL,
	"device_id" uuid,
	"client_request_id" text,
	"time_entry_id" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "device_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_device_id_device_tokens_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device_tokens"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "time_punches_one_running_idx" ON "time_punches" ("user_id") WHERE "status" = 'running';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "time_punches_request_idx" ON "time_punches" ("user_id","client_request_id") WHERE "client_request_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_punches_recent_idx" ON "time_punches" ("user_id","started_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "time_punches_status_idx" ON "time_punches" ("status","started_at" DESC);
