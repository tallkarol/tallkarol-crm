CREATE TABLE IF NOT EXISTS "portal_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"client_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_grants_email_client_unique" UNIQUE("email","client_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portal_grants" ADD CONSTRAINT "portal_grants_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
