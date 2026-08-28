CREATE TABLE IF NOT EXISTS "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"origin" text DEFAULT '' NOT NULL,
	"ga4_property_id" text DEFAULT '' NOT NULL,
	"gsc_site_url" text DEFAULT '' NOT NULL,
	"measurement_id" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
