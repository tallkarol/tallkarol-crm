CREATE TYPE "public"."proposal_status" AS ENUM('draft', 'sent', 'accepted');--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"body_path" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"retainer_id" uuid,
	"project_id" uuid,
	"series" text DEFAULT '' NOT NULL,
	"series_part" smallint,
	"series_of" smallint,
	"status" "proposal_status" DEFAULT 'draft' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "body_path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_retainer_id_retainers_id_fk" FOREIGN KEY ("retainer_id") REFERENCES "public"."retainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_slug_unique" ON "proposals" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "proposals_client_idx" ON "proposals" USING btree ("client_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_slug_unique" ON "reports" USING btree ("slug") WHERE "reports"."slug" is not null;