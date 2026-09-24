ALTER TABLE "punchlists" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "brainstorm_notes" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "punchlists" ADD CONSTRAINT "punchlists_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brainstorm_notes" ADD CONSTRAINT "brainstorm_notes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "punchlists_product_idx" ON "punchlists" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "calendar_events_product_idx" ON "calendar_events" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "meeting_notes_product_idx" ON "meeting_notes" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "brainstorm_notes_product_idx" ON "brainstorm_notes" USING btree ("product_id");
