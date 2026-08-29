ALTER TABLE "users" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "users" SET name = 'Karol' WHERE email IN ('hello@tallkarol.com', 'karolzbuczek@gmail.com') AND name = '';
