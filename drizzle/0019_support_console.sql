ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "platform" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "state" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "assignee" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN IF NOT EXISTS "first_response_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"role" text DEFAULT 'client' NOT NULL,
	"author" text DEFAULT '' NOT NULL,
	"author_email" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"external_id" text DEFAULT '' NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ticket_payloads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"lang" text DEFAULT 'txt' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"lines" integer DEFAULT 0 NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ticket_payloads" ADD CONSTRAINT "ticket_payloads_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_messages_ticket_idx" ON "ticket_messages" ("ticket_id","sent_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ticket_payloads_ticket_idx" ON "ticket_payloads" ("ticket_id","position");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "support_tickets_number_idx" ON "support_tickets" ("number");
