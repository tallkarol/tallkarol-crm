ALTER TABLE "chat_threads" ADD COLUMN "agent" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "pack" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD COLUMN "private" boolean DEFAULT false NOT NULL;
