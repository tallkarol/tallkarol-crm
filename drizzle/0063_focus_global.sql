ALTER TABLE "focus_items" ALTER COLUMN "client_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "focus_items" ADD COLUMN "global_position" integer;--> statement-breakpoint
DROP INDEX IF EXISTS "focus_items_ref_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "focus_items_ref_unique" ON "focus_items" USING btree ("ref_kind","ref_id");
