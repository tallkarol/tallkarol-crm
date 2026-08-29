CREATE TYPE "public"."notion_proposal_status" AS ENUM('proposed', 'accepted', 'dismissed');--> statement-breakpoint
CREATE TABLE "notion_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"block_id" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"fingerprint" text NOT NULL,
	"status" "notion_proposal_status" DEFAULT 'proposed' NOT NULL,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "notion_proposals_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
ALTER TABLE "notion_pages" ADD COLUMN "scanned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notion_proposals" ADD CONSTRAINT "notion_proposals_link_id_notion_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."notion_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_proposals" ADD CONSTRAINT "notion_proposals_page_id_notion_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."notion_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notion_proposals" ADD CONSTRAINT "notion_proposals_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notion_proposals_link_status_idx" ON "notion_proposals" USING btree ("link_id","status");
