ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "vercel_project_id" text DEFAULT '' NOT NULL;
