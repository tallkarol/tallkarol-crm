ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "user_id" uuid;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "priority" smallint DEFAULT 2 NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "sort" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "snoozed_until" date;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "deliverable_id" uuid;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "source" text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "ref_kind" text;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "ref_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
UPDATE "tasks" SET "completed_at" = "updated_at" WHERE "status" = 'done' AND "completed_at" IS NULL;
--> statement-breakpoint
UPDATE "tasks" SET "user_id" = (
  SELECT "id" FROM "users" WHERE "role" = 'admin' ORDER BY "created_at" ASC LIMIT 1
) WHERE "user_id" IS NULL;
--> statement-breakpoint
UPDATE "tasks" SET "source" = 'renewal' WHERE "notes" LIKE 'Auto-created at T-%' AND "source" = 'manual';
--> statement-breakpoint
UPDATE "tasks" SET "ref_kind" = 'retainer', "ref_id" = "retainer_id"
  WHERE "source" = 'renewal' AND "ref_id" IS NULL AND "retainer_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"title" text NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"criteria" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"layout" text DEFAULT 'list' NOT NULL,
	"grouping" text DEFAULT 'none' NOT NULL,
	"sort_by" text DEFAULT 'due' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_views_user_slug_unique" UNIQUE("user_id","slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "task_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"user_id" uuid,
	"period" text NOT NULL,
	"completed_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_completions_task_period_unique" UNIQUE("task_id","period")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_items" ADD CONSTRAINT "task_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_views" ADD CONSTRAINT "task_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "task_completions" ADD CONSTRAINT "task_completions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_open_idx" ON "tasks" ("status","due_on");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_client_idx" ON "tasks" ("client_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_project_idx" ON "tasks" ("project_id") WHERE "project_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_items_task_idx" ON "task_items" ("task_id","sort");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_completions_task_idx" ON "task_completions" ("task_id","completed_on" DESC);
--> statement-breakpoint
UPDATE "tasks" t SET "title" = t."title" || ' — ' || c."name"
  FROM "clients" c
 WHERE c."id" = t."client_id"
   AND t."cadence" <> 'none'
   AND t."title" NOT LIKE '%—%'
   AND EXISTS (
     SELECT 1 FROM "tasks" o
      WHERE o."title" = t."title" AND o."id" <> t."id" AND o."cadence" <> 'none'
   );
