CREATE TABLE "experiment_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"experiment_id" uuid NOT NULL,
	"checkpoint" text NOT NULL,
	"window_from" date NOT NULL,
	"window_to" date NOT NULL,
	"payload" jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"hypothesis" text DEFAULT '' NOT NULL,
	"change_note" text DEFAULT '' NOT NULL,
	"started_on" date NOT NULL,
	"baseline_from" date NOT NULL,
	"baseline_to" date NOT NULL,
	"pages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"form_locations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"verdict" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Re-emitted because 0036_site_vercel.sql was hand-written with no snapshot,
-- so the generator did not know the column already exists. Idempotent, as 0036 was.
ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "vercel_project_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "experiment_readings" ADD CONSTRAINT "experiment_readings_experiment_id_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiments" ADD CONSTRAINT "experiments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_readings_checkpoint_idx" ON "experiment_readings" USING btree ("experiment_id","checkpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "experiments_site_slug_idx" ON "experiments" USING btree ("site_id","slug");--> statement-breakpoint
CREATE INDEX "experiments_site_status_idx" ON "experiments" USING btree ("site_id","status");