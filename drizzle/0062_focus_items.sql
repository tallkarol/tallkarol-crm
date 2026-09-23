CREATE TABLE "focus_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"client_id" uuid NOT NULL,
	"ref_kind" text NOT NULL,
	"ref_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"global" boolean DEFAULT false NOT NULL,
	"color" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "focus_items" ADD CONSTRAINT "focus_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_items" ADD CONSTRAINT "focus_items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "focus_items_client_idx" ON "focus_items" USING btree ("client_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "focus_items_ref_unique" ON "focus_items" USING btree ("client_id","ref_kind","ref_id");
