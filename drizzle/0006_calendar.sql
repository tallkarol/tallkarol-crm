CREATE TYPE "public"."calendar_source_kind" AS ENUM('google', 'cal_com', 'ics');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "calendar_source_kind" NOT NULL,
	"label" text NOT NULL,
	"external_id" text DEFAULT '' NOT NULL,
	"color" text DEFAULT '#006965' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"writable" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"all_day" boolean DEFAULT false NOT NULL,
	"cancelled" boolean DEFAULT false NOT NULL,
	"attendees" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"client_id" uuid,
	"inquiry_id" uuid,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_source_id_calendar_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."calendar_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "calendar_events_source_external_idx" ON "calendar_events" USING btree ("source_id","external_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calendar_events_starts_at_idx" ON "calendar_events" USING btree ("starts_at");
