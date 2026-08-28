CREATE TABLE IF NOT EXISTS "ignored_domains" (
	"domain" text PRIMARY KEY NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
