CREATE TABLE IF NOT EXISTS "inbox_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref_kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"state" text DEFAULT 'read' NOT NULL,
	"snoozed_until" timestamp with time zone,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbox_mail" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text DEFAULT '' NOT NULL,
	"in_reply_to" text DEFAULT '' NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"from_email" text DEFAULT '' NOT NULL,
	"to_email" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"snippet" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"ticket_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_mail" ADD CONSTRAINT "inbox_mail_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbox_mail" ADD CONSTRAINT "inbox_mail_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbox_state_ref_idx" ON "inbox_state" ("ref_kind","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbox_mail_message_idx" ON "inbox_mail" ("message_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbox_mail_received_idx" ON "inbox_mail" ("received_at" DESC);
