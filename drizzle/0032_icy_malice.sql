CREATE TABLE "gsc_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"scanned_on" date NOT NULL,
	"period" text NOT NULL,
	"url_count" integer DEFAULT 0 NOT NULL,
	"pass_count" integer DEFAULT 0 NOT NULL,
	"opened_count" integer DEFAULT 0 NOT NULL,
	"resolved_count" integer DEFAULT 0 NOT NULL,
	"sitemaps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gsc_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"key" text NOT NULL,
	"rule" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"severity" smallint DEFAULT 2 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"first_seen_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	"resolved_on" date,
	"times_seen" integer DEFAULT 1 NOT NULL,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gsc_scans" ADD CONSTRAINT "gsc_scans_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_findings" ADD CONSTRAINT "gsc_findings_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gsc_findings" ADD CONSTRAINT "gsc_findings_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "gsc_scans_site_day_idx" ON "gsc_scans" USING btree ("site_id","scanned_on");--> statement-breakpoint
CREATE INDEX "gsc_scans_period_idx" ON "gsc_scans" USING btree ("site_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "gsc_findings_site_key_idx" ON "gsc_findings" USING btree ("site_id","key");--> statement-breakpoint
CREATE INDEX "gsc_findings_open_idx" ON "gsc_findings" USING btree ("site_id","status");--> statement-breakpoint
CREATE INDEX "gsc_findings_resolved_idx" ON "gsc_findings" USING btree ("site_id","resolved_on");
