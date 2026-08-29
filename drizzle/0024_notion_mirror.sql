CREATE TABLE "notion_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"notion_page_id" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notion_links_notion_page_id_unique" UNIQUE("notion_page_id")
);
--> statement-breakpoint
CREATE TABLE "notion_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"link_id" uuid NOT NULL,
	"notion_id" text NOT NULL,
	"parent_notion_id" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plain_text" text DEFAULT '' NOT NULL,
	"notion_edited_at" timestamp with time zone,
	"archived" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notion_pages_notion_id_unique" UNIQUE("notion_id")
);
--> statement-breakpoint
ALTER TABLE "notion_links" ADD CONSTRAINT "notion_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "notion_pages" ADD CONSTRAINT "notion_pages_link_id_notion_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."notion_links"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "notion_pages_link_idx" ON "notion_pages" USING btree ("link_id");
