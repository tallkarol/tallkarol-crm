CREATE TABLE IF NOT EXISTS "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text DEFAULT 'smartsheet' NOT NULL,
	"external_id" text NOT NULL,
	"number" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"priority" text DEFAULT '' NOT NULL,
	"request_type" text DEFAULT '' NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"submitted_by" text DEFAULT '' NOT NULL,
	"submitted_on" date,
	"due_on" date,
	"description" text DEFAULT '' NOT NULL,
	"resolution" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"customer_contact" text DEFAULT '' NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"client_id" uuid,
	"raw" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_external_unique" UNIQUE("source","external_id")
);
--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
