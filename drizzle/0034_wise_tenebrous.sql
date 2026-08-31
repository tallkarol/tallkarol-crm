ALTER TYPE "public"."project_status" ADD VALUE IF NOT EXISTS 'not_started' BEFORE 'waiting_on_content';--> statement-breakpoint
ALTER TYPE "public"."project_status" ADD VALUE IF NOT EXISTS 'on_hold' BEFORE 'complete';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "external_id" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "source_status" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;--> statement-breakpoint
-- Added straight to the database ahead of this migration; guarded so the file replays cleanly.
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "ads_customer_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_source_external_idx" ON "projects" USING btree ("source","external_id") WHERE "projects"."external_id" is not null;
