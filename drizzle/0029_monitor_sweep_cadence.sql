ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "sweep_every_minutes" integer DEFAULT 720 NOT NULL;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN IF NOT EXISTS "last_swept_at" timestamp with time zone;
