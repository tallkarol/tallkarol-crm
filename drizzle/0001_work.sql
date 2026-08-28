CREATE TYPE "public"."retainer_status" AS ENUM('active', 'paused', 'ended');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('waiting_on_content', 'in_progress', 'complete');--> statement-breakpoint
CREATE TYPE "public"."fee_status" AS ENUM('agreed', 'deposit_paid', 'paid');--> statement-breakpoint
CREATE TYPE "public"."deliverable_status" AS ENUM('pending', 'done', 'invoiced', 'paid');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'done');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('due', 'filed');--> statement-breakpoint
CREATE TYPE "public"."cadence" AS ENUM('none', 'weekly', 'monthly');--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "retainers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"hours_per_month" integer NOT NULL,
	"status" "retainer_status" DEFAULT 'active' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "retainers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"retainer_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"status" "project_status" DEFAULT 'in_progress' NOT NULL,
	"fee_status" "fee_status" DEFAULT 'agreed' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"label" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" "deliverable_status" DEFAULT 'pending' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"client_id" uuid,
	"retainer_id" uuid,
	"project_id" uuid,
	"cadence" "cadence" DEFAULT 'none' NOT NULL,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"client_id" uuid,
	"retainer_id" uuid,
	"project_id" uuid,
	"cadence" "cadence" DEFAULT 'none' NOT NULL,
	"period_label" text DEFAULT '' NOT NULL,
	"status" "report_status" DEFAULT 'due' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retainers" ADD CONSTRAINT "retainers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_retainer_id_retainers_id_fk" FOREIGN KEY ("retainer_id") REFERENCES "public"."retainers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_retainer_id_retainers_id_fk" FOREIGN KEY ("retainer_id") REFERENCES "public"."retainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_retainer_id_retainers_id_fk" FOREIGN KEY ("retainer_id") REFERENCES "public"."retainers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
