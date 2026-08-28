ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "domains" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN IF NOT EXISTS "dismissed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "calendar_event_id" uuid;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_calendar_event_idx" ON "time_entries" ("calendar_event_id") WHERE "calendar_event_id" IS NOT NULL;
