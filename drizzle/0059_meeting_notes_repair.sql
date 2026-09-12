-- Repairs the meeting-notes tables on a database that skipped 0056.
--
-- Drizzle's migrator applies a migration only when its journal `when` is
-- greater than the newest `created_at` in drizzle.__drizzle_migrations — a
-- high-water mark, not a set of applied tags (pg-core/dialect.js). 0056 was
-- briefly dropped from the journal to unblock a deploy, that deploy carried
-- the mark up to 0058's 1789139000000, and when 0056 came back with its
-- original when=1789051000000 it sat below the mark. It is skipped, forever
-- and silently, and the pre-deploy still exits 0.
--
-- So this is 0056's schema again with a `when` above the mark. Every
-- statement is guarded: on a database that already has the tables (a fresh
-- one, where 0056 ran in order, or a dev box) it is a no-op.
CREATE TABLE IF NOT EXISTS "meeting_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"calendar_event_id" uuid,
	"punch_id" uuid,
	"owns_punch" boolean DEFAULT false NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"source" text DEFAULT 'live' NOT NULL,
	"time_zone" text DEFAULT '' NOT NULL,
	"worker" text DEFAULT '' NOT NULL,
	"heartbeat_at" timestamp with time zone,
	"levels" jsonb,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"recording_path" text DEFAULT '' NOT NULL,
	"tracks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transcript_status" text DEFAULT 'pending' NOT NULL,
	"transcript_error" text DEFAULT '' NOT NULL,
	"transcript_attempts" integer DEFAULT 0 NOT NULL,
	"transcript_model" text DEFAULT '' NOT NULL,
	"language" text DEFAULT '' NOT NULL,
	"segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"transcript_text" text DEFAULT '' NOT NULL,
	"analysis_status" text DEFAULT 'pending' NOT NULL,
	"analysis_error" text DEFAULT '' NOT NULL,
	"analysis_model" text DEFAULT '' NOT NULL,
	"analysis_usage" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"analysis" jsonb DEFAULT '{"attendees":[],"topics":[],"decisions":[],"questions":[]}'::jsonb NOT NULL,
	"speaker_names" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"client_request_id" text,
	"filed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meeting_note_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"kind" text DEFAULT 'task' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"segment_index" integer,
	"owner" text DEFAULT '' NOT NULL,
	"due_on" date,
	"starts_at" text DEFAULT '' NOT NULL,
	"ends_at" text DEFAULT '' NOT NULL,
	"time_zone" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'proposed' NOT NULL,
	"task_id" uuid,
	"calendar_ref" text DEFAULT '' NOT NULL,
	"calendar_url" text DEFAULT '' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_notes_user_id_users_id_fk' AND conrelid = 'public.meeting_notes'::regclass) THEN
		ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_notes_client_id_clients_id_fk' AND conrelid = 'public.meeting_notes'::regclass) THEN
		ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_notes_project_id_projects_id_fk' AND conrelid = 'public.meeting_notes'::regclass) THEN
		ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_notes_calendar_event_id_calendar_events_id_fk' AND conrelid = 'public.meeting_notes'::regclass) THEN
		ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_notes_punch_id_time_punches_id_fk' AND conrelid = 'public.meeting_notes'::regclass) THEN
		ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_punch_id_time_punches_id_fk" FOREIGN KEY ("punch_id") REFERENCES "public"."time_punches"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_note_items_note_id_meeting_notes_id_fk' AND conrelid = 'public.meeting_note_items'::regclass) THEN
		ALTER TABLE "meeting_note_items" ADD CONSTRAINT "meeting_note_items_note_id_meeting_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."meeting_notes"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meeting_note_items_task_id_tasks_id_fk' AND conrelid = 'public.meeting_note_items'::regclass) THEN
		ALTER TABLE "meeting_note_items" ADD CONSTRAINT "meeting_note_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_notes_live_idx" ON "meeting_notes" USING btree ("user_id") WHERE "meeting_notes"."status" in ('requested', 'recording', 'stopping');--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "meeting_notes_request_idx" ON "meeting_notes" USING btree ("user_id","client_request_id") WHERE "meeting_notes"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_notes_recent_idx" ON "meeting_notes" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_notes_client_idx" ON "meeting_notes" USING btree ("client_id") WHERE "meeting_notes"."client_id" is not null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_notes_transcript_idx" ON "meeting_notes" USING btree ("transcript_status") WHERE "meeting_notes"."transcript_status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_note_items_note_idx" ON "meeting_note_items" USING btree ("note_id","sort");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meeting_note_items_task_idx" ON "meeting_note_items" USING btree ("task_id") WHERE "meeting_note_items"."task_id" is not null;
--> statement-breakpoint
-- Record 0056 as applied, because now it is: the schema above is 0056's.
-- Drizzle will never write this row itself — 0056 sits below the high-water
-- mark and is skipped every run — so without it the journal would show a
-- migration that never ran, which is exactly what the check in db/migrate.ts
-- refuses to deploy over. The hash is 0056_meeting_notes.sql's, the one
-- readMigrationFiles() computes. Guarded, so a fresh database (where drizzle
-- inserts this row itself) does not end up with two.
INSERT INTO drizzle."__drizzle_migrations" ("hash", "created_at")
SELECT '09a891fc93af5a69d322b3a1d20affb356b3a566bc2d68a8c2556b6af729280b', 1789051000000
WHERE NOT EXISTS (
	SELECT 1 FROM drizzle."__drizzle_migrations" WHERE "created_at" = 1789051000000
);
