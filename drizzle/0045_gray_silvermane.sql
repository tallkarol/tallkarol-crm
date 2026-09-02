CREATE TABLE "codebase_docs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"site_id" uuid,
	"project_id" uuid,
	"product_id" uuid,
	"codebase" text NOT NULL,
	"kind" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"commit_hash" text DEFAULT '' NOT NULL,
	"branch" text DEFAULT '' NOT NULL,
	"tool" text DEFAULT '' NOT NULL,
	"source_path" text DEFAULT '' NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "codebase_docs" ADD CONSTRAINT "codebase_docs_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebase_docs" ADD CONSTRAINT "codebase_docs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebase_docs" ADD CONSTRAINT "codebase_docs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "codebase_docs" ADD CONSTRAINT "codebase_docs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "codebase_docs_latest_idx" ON "codebase_docs" USING btree ("client_id","codebase","kind","generated_at" DESC NULLS LAST);