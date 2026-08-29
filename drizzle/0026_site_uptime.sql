ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "uptime_monitor_id" text DEFAULT '' NOT NULL;
