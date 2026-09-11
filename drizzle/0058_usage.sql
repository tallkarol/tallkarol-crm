CREATE TABLE "agent_turns" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"meter_ref" text NOT NULL,
	"session_ref" text NOT NULL,
	"surface" text DEFAULT 'claude' NOT NULL,
	"kind" text DEFAULT 'turn' NOT NULL,
	"agent_id" text,
	"client_id" uuid,
	"client_slug" text,
	"cwd" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	"model" text,
	"effort" text,
	"lane" text,
	"requests" integer,
	"input_tokens" bigint,
	"cache_write_tokens" bigint,
	"cache_read_tokens" bigint,
	"output_tokens" bigint,
	"thinking_tokens" bigint,
	"origin" text DEFAULT 'hook' NOT NULL,
	"device_id" uuid,
	"pushed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_turns_meter_ref_unique" UNIQUE("meter_ref")
);
--> statement-breakpoint
CREATE TABLE "usage_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"basis" text DEFAULT 'manual' NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"period_start" date,
	"period_end" date,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"device_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_snapshots_source_observed_unique" UNIQUE("source","observed_at")
);
--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_turns" ADD CONSTRAINT "agent_turns_device_id_device_tokens_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_snapshots" ADD CONSTRAINT "usage_snapshots_device_id_device_tokens_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."device_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_turns_started_idx" ON "agent_turns" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "agent_turns_client_idx" ON "agent_turns" USING btree ("client_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_turns_session_idx" ON "agent_turns" USING btree ("session_ref");--> statement-breakpoint
CREATE INDEX "usage_snapshots_source_idx" ON "usage_snapshots" USING btree ("source","observed_at");--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "tokens_in" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "agent_sessions" ALTER COLUMN "tokens_out" SET DATA TYPE bigint;
