ALTER TABLE "time_entries" ADD COLUMN "started_at" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "ended_at" text DEFAULT '' NOT NULL;
