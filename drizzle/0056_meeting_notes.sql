CREATE TABLE "meeting_notes" (
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
CREATE TABLE "meeting_note_items" (
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
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_punch_id_time_punches_id_fk" FOREIGN KEY ("punch_id") REFERENCES "public"."time_punches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_note_items" ADD CONSTRAINT "meeting_note_items_note_id_meeting_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."meeting_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_note_items" ADD CONSTRAINT "meeting_note_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_notes_live_idx" ON "meeting_notes" USING btree ("user_id") WHERE "meeting_notes"."status" in ('requested', 'recording', 'stopping');--> statement-breakpoint
CREATE UNIQUE INDEX "meeting_notes_request_idx" ON "meeting_notes" USING btree ("user_id","client_request_id") WHERE "meeting_notes"."client_request_id" is not null;--> statement-breakpoint
CREATE INDEX "meeting_notes_recent_idx" ON "meeting_notes" USING btree ("user_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "meeting_notes_client_idx" ON "meeting_notes" USING btree ("client_id") WHERE "meeting_notes"."client_id" is not null;--> statement-breakpoint
CREATE INDEX "meeting_notes_transcript_idx" ON "meeting_notes" USING btree ("transcript_status") WHERE "meeting_notes"."transcript_status" in ('queued', 'running');--> statement-breakpoint
CREATE INDEX "meeting_note_items_note_idx" ON "meeting_note_items" USING btree ("note_id","sort");--> statement-breakpoint
CREATE INDEX "meeting_note_items_task_idx" ON "meeting_note_items" USING btree ("task_id") WHERE "meeting_note_items"."task_id" is not null;
