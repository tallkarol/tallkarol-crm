# Codebase docs

What a client's codebases are made of, read from the code itself and stored
per client so "what is this built on" is one click away.

## The object

| Table | Row |
| --- | --- |
| `codebase_docs` | One generated sheet: `client` + `codebase` slug + `kind`, the tool's JSON in `data`, the commit it read, when. |

`kind` is `spec` today; `structure`, `db`, `features` and `permissions` are
reserved for the sibling tools. Every run inserts a row, so the history of a
codebase is readable; the latest `generated_at` per (client, codebase, kind) is
the current sheet. A rerun on the same commit that produces identical data
stores nothing (`replayed: true`).

## Where it shows

- Client page → **Codebases** rail card: one line per codebase with the spec
  summary and which kinds exist.
- `/clients/[slug]/codebases/[codebase]?kind=spec` — the sheet in full
  (`components/codebases/SpecSheet.tsx`), this run's provenance, and history.

## API (device token)

| Route | Body / query | Notes |
| --- | --- | --- |
| `POST /api/codebases/docs` | `{ clientSlug, codebase, kind, data, schemaVersion?, title?, summary?, commitHash?, branch?, tool?, sourcePath?, generatedAt?, siteSlug?, projectSlug?, productSlug? }` | 201 with `{ id, url }`; 200 + `replayed: true` when nothing changed. |
| `GET /api/codebases/docs?client=<slug>` | — | Latest sheet of every kind per codebase, without `data`. |
| `GET /api/codebases/docs?client=<slug>&codebase=<slug>&kind=spec` | — | One latest sheet with `data`. |

The producer is `skills/spec-sheet` in daedalus-hive-mind: a stdlib Python
scanner that reads manifests, lockfiles, WordPress/Shopify markers, deploy and
CI files, env variable *names*, and git identity — never values, never guesses.
Its JSON contract (`schemaVersion` 1) is what `SpecSheet.tsx` renders; unknown
fields are ignored, missing ones are simply not shown.
