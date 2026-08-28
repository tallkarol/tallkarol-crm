ALTER TABLE "clients" ADD COLUMN "billing" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "clients" SET billing = '{"billTo":["Rebecca Goffe","Mineralife Nutraceuticals LLC","1435 Woolsey Heights","Colorado Springs, CO 80915"],"customerId":"MINLIFE","senderEmail":"kbuczek@mineralifeonline.com"}'::jsonb WHERE slug = 'mineralife' AND billing = '{}'::jsonb;--> statement-breakpoint
UPDATE "clients" SET billing = '{"billTo":["Rebecca Goffe","Mineralife Nutraceuticals LLC","1435 Woolsey Heights","Colorado Springs, CO 80915"],"customerId":"ZEMVELO","senderEmail":"kbuczek@mineralifeonline.com"}'::jsonb WHERE slug = 'zemvelo' AND billing = '{}'::jsonb;--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value")
VALUES ('invoice_sender', '{"lines":["Karol Buczek","6920 Acres Drive","Independence OH 44131","216-774-4283"],"email":"hello@tallkarol.com"}'::jsonb)
ON CONFLICT ("key") DO NOTHING;
