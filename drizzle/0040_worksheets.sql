CREATE TYPE "public"."worksheet_mode" AS ENUM('client', 'interview', 'portal');--> statement-breakpoint
CREATE TYPE "public"."worksheet_status" AS ENUM('blank', 'filled', 'review', 'signed');--> statement-breakpoint
CREATE TABLE "worksheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"body_path" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"retainer_id" uuid,
	"project_id" uuid,
	"instrument" text DEFAULT '' NOT NULL,
	"version" text DEFAULT '' NOT NULL,
	"mode" "worksheet_mode" DEFAULT 'interview' NOT NULL,
	"status" "worksheet_status" DEFAULT 'blank' NOT NULL,
	"filled_on" date,
	"question_count" smallint,
	"open_count" smallint DEFAULT 0 NOT NULL,
	"internal" boolean DEFAULT true NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_retainer_id_retainers_id_fk" FOREIGN KEY ("retainer_id") REFERENCES "public"."retainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worksheets" ADD CONSTRAINT "worksheets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "worksheets_slug_unique" ON "worksheets" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "worksheets_client_idx" ON "worksheets" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "worksheets_instrument_idx" ON "worksheets" USING btree ("instrument");