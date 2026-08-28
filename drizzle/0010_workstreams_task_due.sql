CREATE TYPE "public"."workstream_stage" AS ENUM('building', 'review', 'feedback', 'approved', 'live');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "workstreams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"stage" "workstream_stage" DEFAULT 'building' NOT NULL,
	"pass" integer DEFAULT 1 NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workstreams" ADD CONSTRAINT "workstreams_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "due_on" date;--> statement-breakpoint
INSERT INTO "workstreams" ("id", "project_id", "title", "stage", "pass", "sort")
SELECT v.id::uuid, p.id, v.title, v.stage::workstream_stage, 1, v.sort
FROM (VALUES
	('a9000000-0000-4000-8000-000000000001', 'AIS v1', 'review', 1),
	('a9000000-0000-4000-8000-000000000002', 'AXVOR v1', 'review', 2),
	('a9000000-0000-4000-8000-000000000003', 'DQS v1', 'feedback', 3)
) AS v(id, title, stage, sort)
JOIN "projects" p ON p.slug = 'dqs-axvor-ais'
ON CONFLICT ("id") DO NOTHING;
