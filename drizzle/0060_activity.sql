CREATE TABLE "activity_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"role" text DEFAULT 'admin' NOT NULL,
	"client_id" uuid,
	"session" text DEFAULT '' NOT NULL,
	"surface" text DEFAULT 'browser' NOT NULL,
	"viewport" text DEFAULT 'desktop' NOT NULL,
	"module" text NOT NULL,
	"kind" text NOT NULL,
	"route" text DEFAULT '/' NOT NULL,
	"target" text,
	"duration_ms" integer,
	"ok" boolean,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"deploy" text DEFAULT '' NOT NULL,
	"synthetic" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_daily" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"route" text NOT NULL,
	"target" text DEFAULT '' NOT NULL,
	"surface" text NOT NULL,
	"role" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"sum_ms" bigint DEFAULT 0 NOT NULL,
	"p50_ms" integer,
	"p95_ms" integer
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_occurred_idx" ON "activity_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_kind_idx" ON "activity_events" USING btree ("kind","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_route_idx" ON "activity_events" USING btree ("route","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_daily_key_idx" ON "activity_daily" USING btree ("day","kind","route","target","surface","role");
