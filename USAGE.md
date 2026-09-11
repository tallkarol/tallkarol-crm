# Usage

`/usage` answers two things at a glance: where this window's agent work
went (client, surface, lane, model, hour) and whether a cap is close. Every
number names its source and its age. Three units — hours, tokens, dollars —
never sum into one figure.

## The rule

A bar is drawn only when the numerator and the denominator come from the
same reading — something Claude, cursor.com or Railway itself said.
Otherwise the tile prints the number, says what it is, and says "no reading"
or "no source" where that is the truth. Claude Max is tokens and time, never
dollars. Token pace is never a percent: Anthropic's weighting of cache reads
and of the model sub-windows is unknown, so a percent derived from tokens
would be an invented number.

## What feeds it

| Source | Table | Collector | Cadence |
| --- | --- | --- | --- |
| Claude Code turns (tokens per API request, model, effort, lane, subagent) | `agent_turns` | `skills/timeclock/scripts/turn-tokens.py` on every Stop/SubagentStop hook → `agent_meter` on the Mac → `push-turns.py` → `POST /api/usage/turns` | at most every 15 min while working; 07:15 / 19:15 sweep |
| Cursor IDE turns (time; model from `ai-code-tracking.db`; **no tokens**) | `agent_turns` | same hooks through `cursor-hook.sh`; model joined at push time | same |
| CRM chat (tokens and $ at registry rates) | `chat_turns` + `chat_threads` | the chat worker, read as-is | live |
| Railway dollars, per project, hard limit | `usage_snapshots` source `railway` | `railway-usage.sh` (three `railway usage … --json` reads) → `POST /api/usage/snapshots` | 07:15 / 19:15 |
| Claude Max 5-hour / 7-day windows | `usage_snapshots` source `claude_max` | typed from `/usage` inside Claude Code (the form on the page); each reading stores the token pace at that instant | when Karol looks; greys after 6 h |
| Cursor plan (Other-models $ of $400, plan %, cycle end) | `usage_snapshots` source `cursor_dashboard` | typed from cursor.com → Usage | weekly and on the cycle day; greys after 10 d |

`agent_turns` is one row per metered turn or subagent run, keyed by
`meter_ref` = `<host>:<agent_meter.id>`, so a re-push merges with
`coalesce(excluded, existing)`: a later push fills blanks and a recompute may
lower a number; a NULL — "unknown" — never erases a value. NULL is every
Cursor row and any Claude row whose transcript was gone; 0 is a real zero.
There is no cost column: nothing on that table has a bill.

`usage_snapshots` holds every reading verbatim (`payload` jsonb, unique on
`source` + `observed_at`). The page reads only the newest row per source and
prints its age. A manual row and a polled row have the same shape, so a
tile does not change if polling is ever switched on.

## The page

Row one, the caps: Claude Max (Claude's own reading with its age; pace
underneath with no bar), Cursor (cursor.com's reading of the $400 pool;
the CRM chat share from `budgetState()` as a sub-line, never the bar; IDE
turns by pool via the model registry), Railway (used vs hard limit from the
same snapshot, per-project list mapped to clients), and the window by
surface with deltas against the previous window.

Row two, *Where it went*: stacked bars per day, one segment per client, one
metric at a time — Claude Code output tokens, hours (both Mac surfaces), or
CRM chat dollars. Row three: turns by hour of day (all three surfaces share
that unit), the reading form, and three breakdowns — client × surface,
lane (`skill:<name>`, `agent:<type>`, `persona:<desk>`, `job:<type>`), and
model. The footer lists every source with its freshness; a collector that
stops shows as stale, never as zero.

Rollups are SQL group-bys at read time (`lib/usage/summary.ts`), bucketed in
the workspace timezone (`lib/timezone.ts`). Nothing is stored twice.
Hours are parent-turn time only — a subagent runs inside its turn's wall
clock, so its seconds never add to hours (its tokens do add to tokens). The
window is whole calendar days in the workspace zone, today included, so the
first bar of the chart is a full day. A typed "as of" is read in that zone
too, and a reading dated in the future is refused: it would pin the tile as
"just now" until the clock caught up.

## Why the history dropped

Until 2026-09-11 the Mac summed every assistant record in a transcript, and
Claude Code writes one record per content block with the request's usage
repeated on each — so token totals were two to four times the truth (1019
records for 274 requests in one afternoon). `turn-tokens.py` now counts once
per `requestId`. `recompute-tokens.py --all` re-read the history from the
transcripts on disk (workflow subagents live one level deeper, under
`subagents/workflows/<run>/`, and are matched too); `scripts/usage-recompute-sessions.ts` then set
`agent_sessions.tokens_in/out` from the deduped turns, because
`/api/sessions` merges with `greatest()` and would have kept the inflated
numbers. Nothing bills from tokens (log-session weights by time), so no
invoice moved.

## Checks

    npm run check:usage:db     # plants rows, runs every rollup, cleans up

## Not collected yet

Vercel (`/v1/billing/charges` — every sampled row $0, no project
attribution), Resend (metrics only, plan tier is dashboard-only), GA4
property quota, DataForSEO balance, the Anthropic Admin API (needs a
Console org). Each becomes one `usage_snapshots` source with its raw payload
when wired; no schema change needed. Claude Max polling through the
undocumented OAuth usage endpoint is Karol's call — the row shape is
already there for it.
