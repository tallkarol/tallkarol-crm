CREATE TYPE "public"."chat_pool" AS ENUM('cursor', 'other', 'none');--> statement-breakpoint
CREATE TYPE "public"."chat_role" AS ENUM('user', 'assistant', 'tool', 'system');--> statement-breakpoint
CREATE TYPE "public"."chat_tool_status" AS ENUM('pending', 'approved', 'rejected', 'ran', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."chat_turn_status" AS ENUM('queued', 'claimed', 'running', 'done', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"role" "chat_role" NOT NULL,
	"agent" text DEFAULT 'Assistant' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"turn_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"archived_at" timestamp with time zone,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"turn_id" uuid,
	"name" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"mutating" boolean DEFAULT false NOT NULL,
	"status" "chat_tool_status" DEFAULT 'ran' NOT NULL,
	"preview" jsonb,
	"result" jsonb,
	"error" text DEFAULT '' NOT NULL,
	"idempotency_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"decided_at" timestamp with time zone,
	"ran_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"message_id" uuid,
	"status" "chat_turn_status" DEFAULT 'queued' NOT NULL,
	"job_type" text DEFAULT 'chat' NOT NULL,
	"model" text NOT NULL,
	"effort" text DEFAULT '' NOT NULL,
	"pool" "chat_pool" DEFAULT 'cursor' NOT NULL,
	"fast" boolean DEFAULT false NOT NULL,
	"rung" smallint DEFAULT 0 NOT NULL,
	"escalated_from" uuid,
	"detector" text DEFAULT '' NOT NULL,
	"claimed_by" text DEFAULT '' NOT NULL,
	"claimed_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text DEFAULT '' NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_cents" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_tool_calls" ADD CONSTRAINT "chat_tool_calls_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_tool_calls" ADD CONSTRAINT "chat_tool_calls_turn_id_chat_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."chat_turns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_turns" ADD CONSTRAINT "chat_turns_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_thread_idx" ON "chat_messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_threads_user_idx" ON "chat_threads" USING btree ("user_id","last_message_at");--> statement-breakpoint
CREATE INDEX "chat_tool_calls_thread_idx" ON "chat_tool_calls" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_tool_calls_status_idx" ON "chat_tool_calls" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_tool_calls_key_idx" ON "chat_tool_calls" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "chat_turns_thread_idx" ON "chat_turns" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "chat_turns_status_idx" ON "chat_turns" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "chat_turns_pool_idx" ON "chat_turns" USING btree ("pool","created_at");