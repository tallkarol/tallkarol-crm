CREATE TYPE "public"."product_studio_kind" AS ENUM('solo', 'studio', 'team');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "product_studios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "product_studio_kind" DEFAULT 'studio' NOT NULL,
	"client_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_studios_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "product_studios" ADD CONSTRAINT "product_studios_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO "product_studios" ("id", "name", "slug", "kind", "client_id", "notes", "sort")
VALUES
	('ab000000-0000-4000-8000-000000000001', 'Sondry', 'sondry', 'studio', NULL, 'Side-project digital product studio. Not a billed client — notions, mail, and the products live here.', 1),
	('ab000000-0000-4000-8000-000000000002', 'Tall Karol', 'tall-karol', 'solo', NULL, 'Your own products. Built as Tall Karol.', 2)
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "studio_id" uuid;--> statement-breakpoint
UPDATE "products" SET "studio_id" = 'ab000000-0000-4000-8000-000000000001' WHERE "studio_id" IS NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "studio_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_studio_id_product_studios_id_fk" FOREIGN KEY ("studio_id") REFERENCES "public"."product_studios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "client_id" DROP NOT NULL;
