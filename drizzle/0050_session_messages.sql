CREATE TABLE "session_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_ref" text NOT NULL,
	"surface" text DEFAULT 'claude' NOT NULL,
	"role" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"origin" text DEFAULT 'hook' NOT NULL,
	"tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "session_messages_key" ON "session_messages" USING btree ("session_ref","role","at");
--> statement-breakpoint
CREATE INDEX "session_messages_tsv_idx" ON "session_messages" USING gin ("tsv");
