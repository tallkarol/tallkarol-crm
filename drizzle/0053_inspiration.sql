CREATE TABLE "inspiration_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inspiration_boards_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "inspiration_pins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"embed_url" text DEFAULT '' NOT NULL,
	"preview_url" text DEFAULT '' NOT NULL,
	"site_name" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspiration_pins" ADD CONSTRAINT "inspiration_pins_board_id_inspiration_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."inspiration_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspiration_pins" ADD CONSTRAINT "inspiration_pins_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inspiration_boards_updated_idx" ON "inspiration_boards" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "inspiration_pins_board_idx" ON "inspiration_pins" USING btree ("board_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "inspiration_pins_board_url_idx" ON "inspiration_pins" USING btree ("board_id","url");
--> statement-breakpoint
INSERT INTO "inspiration_boards" ("slug", "title", "description")
VALUES ('modern-websites', 'Modern websites', '');
--> statement-breakpoint
INSERT INTO "inspiration_pins" (
  "board_id", "kind", "url", "title", "note", "provider",
  "embed_url", "preview_url", "site_name", "description"
)
SELECT
  id,
  'video',
  'https://www.instagram.com/reel/Dci-Pn-vvnH/',
  'Instagram reel',
  '',
  'instagram',
  'https://www.instagram.com/reel/Dci-Pn-vvnH/embed',
  '',
  'Instagram',
  ''
FROM "inspiration_boards"
WHERE "slug" = 'modern-websites';
