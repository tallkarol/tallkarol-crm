CREATE TABLE IF NOT EXISTS "report_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"refreshed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text DEFAULT '' NOT NULL
);
