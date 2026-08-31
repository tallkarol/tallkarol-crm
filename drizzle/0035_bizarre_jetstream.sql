-- The partial index could not be used as an ON CONFLICT target without
-- repeating its predicate at every call site. Nulls are distinct in Postgres,
-- so a plain unique index leaves hand-typed projects unconstrained anyway.
DROP INDEX IF EXISTS "projects_source_external_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_source_external_idx" ON "projects" USING btree ("source","external_id");
