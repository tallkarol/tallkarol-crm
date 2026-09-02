CREATE TABLE "session_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_ref" text NOT NULL,
	"surface" text DEFAULT 'claude' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"project" text DEFAULT '' NOT NULL,
	"cwd" text DEFAULT '' NOT NULL,
	"branch" text DEFAULT '' NOT NULL,
	"last_prompt" text DEFAULT '' NOT NULL,
	"last_reply" text DEFAULT '' NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"pinned" boolean DEFAULT false NOT NULL,
	"event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_notes_session_ref_unique" UNIQUE("session_ref")
);
--> statement-breakpoint
CREATE INDEX "session_notes_live_idx" ON "session_notes" USING btree ("dismissed_at","event_at");
