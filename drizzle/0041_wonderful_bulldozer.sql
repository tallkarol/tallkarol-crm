CREATE TABLE "brainstorm_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"topic" text DEFAULT '' NOT NULL,
	"body" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"ref_kind" text,
	"ref_id" uuid,
	"proposal_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "labels" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "brainstorm_notes" ADD CONSTRAINT "brainstorm_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brainstorm_notes" ADD CONSTRAINT "brainstorm_notes_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "brainstorm_notes_client_idx" ON "brainstorm_notes" USING btree ("client_id","created_at");