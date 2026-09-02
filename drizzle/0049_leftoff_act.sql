ALTER TABLE "session_notes" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "session_notes" ADD COLUMN "blocked_on" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_notes" ADD COLUMN "reply" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "session_notes" ADD COLUMN "reply_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session_notes" ADD COLUMN "task_id" uuid;--> statement-breakpoint
ALTER TABLE "session_notes" ADD COLUMN "ticket_id" uuid;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_ticket_id_support_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."support_tickets"("id") ON DELETE set null ON UPDATE no action;
