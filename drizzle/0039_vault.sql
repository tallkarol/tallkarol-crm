CREATE TABLE "vault_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"kind" text DEFAULT 'login' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"secret_blob" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vault_entries" ADD CONSTRAINT "vault_entries_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vault_entries" ADD CONSTRAINT "vault_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vault_entries_client_idx" ON "vault_entries" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "vault_entries_updated_idx" ON "vault_entries" USING btree ("updated_at");
