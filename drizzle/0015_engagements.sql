CREATE TYPE "public"."board_stage" AS ENUM('queue', 'doing', 'waiting');--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "fee_cents" integer;--> statement-breakpoint
ALTER TABLE "deliverables" ADD COLUMN "due_on" date;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "board_stage" "board_stage" DEFAULT 'queue' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "links" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "deliverables" d SET fee_cents = v.fee
FROM (VALUES
	('dqs-axvor-ais', 'D1', 124800),
	('dqs-axvor-ais', 'D2', 124800),
	('artist-house', 'D1', 255000),
	('artist-house', 'D2', 255000),
	('caps-fieldhouse', '001', 97393)
) AS v(slug, label, fee), "projects" p
WHERE p.slug = v.slug AND d.project_id = p.id AND d.label = v.label AND d.fee_cents IS NULL;--> statement-breakpoint
UPDATE "deliverables" d SET due_on = '2026-09-14'
FROM "projects" p
WHERE p.slug = 'dqs-axvor-ais' AND d.project_id = p.id AND d.label = 'D2' AND d.due_on IS NULL;--> statement-breakpoint
INSERT INTO "deliverables" ("id", "project_id", "label", "title", "status", "sort", "fee_cents")
SELECT v.id::uuid, p.id, 'Deposit', v.title, 'paid', 0, v.fee
FROM (VALUES
	('aa000000-0000-4000-8000-000000000001', 'dqs-axvor-ais', 'Deposit at kickoff', 166400),
	('aa000000-0000-4000-8000-000000000002', 'artist-house', 'Deposit at kickoff', 340000)
) AS v(id, slug, title, fee)
JOIN "projects" p ON p.slug = v.slug
ON CONFLICT ("id") DO NOTHING;
