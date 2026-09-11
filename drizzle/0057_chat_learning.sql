CREATE TABLE "chat_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid,
	"user_id" uuid NOT NULL,
	"agent" text DEFAULT '' NOT NULL,
	"pack" text DEFAULT '' NOT NULL,
	"kind" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_feedback" ADD CONSTRAINT "chat_feedback_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_feedback" ADD CONSTRAINT "chat_feedback_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_feedback" ADD CONSTRAINT "chat_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_feedback_agent_idx" ON "chat_feedback" USING btree ("agent","created_at");--> statement-breakpoint
CREATE INDEX "chat_feedback_thread_idx" ON "chat_feedback" USING btree ("thread_id");--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "digest" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "digested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "from_thread_id" uuid;--> statement-breakpoint
CREATE INDEX "chat_threads_desk_idx" ON "chat_threads" USING btree ("agent","pack","last_message_at");
