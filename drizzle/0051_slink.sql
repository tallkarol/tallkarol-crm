CREATE TABLE "slink_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slink_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"requested_by" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"ip" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slink_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slink_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"kind" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"secret_blob" text DEFAULT '' NOT NULL,
	"source_kind" text DEFAULT '' NOT NULL,
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slink_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slink_id" uuid NOT NULL,
	"recipient_id" uuid,
	"kind" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"user_agent" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slink_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slink_id" uuid NOT NULL,
	"block_id" uuid,
	"name" text DEFAULT '' NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"data" "bytea",
	"storage_key" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slink_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slink_id" uuid NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"expires_at" timestamp with time zone,
	"invited_by" uuid,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slink_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slink_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "slink_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slink_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "slinks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"title" text NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"client_id" uuid,
	"created_by" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "slinks_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "slink_access_requests" ADD CONSTRAINT "slink_access_requests_slink_id_slinks_id_fk" FOREIGN KEY ("slink_id") REFERENCES "public"."slinks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slink_access_requests" ADD CONSTRAINT "slink_access_requests_requested_by_slink_recipients_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."slink_recipients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slink_access_requests" ADD CONSTRAINT "slink_access_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slink_blocks" ADD CONSTRAINT "slink_blocks_slink_id_slinks_id_fk" FOREIGN KEY ("slink_id") REFERENCES "public"."slinks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slink_events" ADD CONSTRAINT "slink_events_slink_id_slinks_id_fk" FOREIGN KEY ("slink_id") REFERENCES "public"."slinks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slink_events" ADD CONSTRAINT "slink_events_recipient_id_slink_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."slink_recipients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slink_files" ADD CONSTRAINT "slink_files_slink_id_slinks_id_fk" FOREIGN KEY ("slink_id") REFERENCES "public"."slinks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slink_files" ADD CONSTRAINT "slink_files_block_id_slink_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."slink_blocks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slink_recipients" ADD CONSTRAINT "slink_recipients_slink_id_slinks_id_fk" FOREIGN KEY ("slink_id") REFERENCES "public"."slinks"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slink_recipients" ADD CONSTRAINT "slink_recipients_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slink_sessions" ADD CONSTRAINT "slink_sessions_recipient_id_slink_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."slink_recipients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slink_tokens" ADD CONSTRAINT "slink_tokens_recipient_id_slink_recipients_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."slink_recipients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slinks" ADD CONSTRAINT "slinks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "slinks" ADD CONSTRAINT "slinks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "slink_access_requests_slink_idx" ON "slink_access_requests" USING btree ("slink_id","status");
--> statement-breakpoint
CREATE INDEX "slink_blocks_slink_idx" ON "slink_blocks" USING btree ("slink_id","position");
--> statement-breakpoint
CREATE INDEX "slink_events_slink_idx" ON "slink_events" USING btree ("slink_id","at");
--> statement-breakpoint
CREATE INDEX "slink_files_slink_idx" ON "slink_files" USING btree ("slink_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "slink_recipients_key" ON "slink_recipients" USING btree ("slink_id","email");
--> statement-breakpoint
CREATE INDEX "slink_recipients_slink_idx" ON "slink_recipients" USING btree ("slink_id");
--> statement-breakpoint
CREATE INDEX "slink_sessions_recipient_idx" ON "slink_sessions" USING btree ("recipient_id");
--> statement-breakpoint
CREATE INDEX "slink_tokens_recipient_idx" ON "slink_tokens" USING btree ("recipient_id");
--> statement-breakpoint
CREATE INDEX "slinks_client_idx" ON "slinks" USING btree ("client_id");
--> statement-breakpoint
CREATE INDEX "slinks_status_idx" ON "slinks" USING btree ("status","updated_at");
