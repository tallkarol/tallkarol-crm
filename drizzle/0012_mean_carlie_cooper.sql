-- Insights hub: frozen monthly snapshots per site (reports render from these).
-- Hand-trimmed: drizzle-kit's meta state was stale (0007–0011 were hand-written,
-- so `generate` re-emitted existing tables); only snapshot_archive is new.
-- The 0012 meta snapshot captures the full current schema, so later generates
-- diff cleanly again.
CREATE TABLE "snapshot_archive" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"period" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"payload" jsonb NOT NULL,
	"report_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "snapshot_archive" ADD CONSTRAINT "snapshot_archive_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_archive" ADD CONSTRAINT "snapshot_archive_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "snapshot_archive_site_period_idx" ON "snapshot_archive" USING btree ("site_id","period");
