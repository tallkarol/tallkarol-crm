ALTER TABLE "contracts" ADD COLUMN "counterparty" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "governing_law" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "venue" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "extra_rate_cents" integer;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "terms" jsonb DEFAULT '{}'::jsonb NOT NULL;
