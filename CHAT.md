# Chat

An assistant inside the CRM that answers questions about the work and performs
actions against it. "What did I work on for Mineralife in June", "log three
hours to the toll filling page", "find the session where the UWD build broke".

Two things make it different from a chat box wired to an API key: the model is
chosen per request by a ladder that starts cheap and only climbs on evidence,
and nothing it proposes reaches a table until Karol confirms it.

## Why the brain is not on Railway

Composer and Grok are reachable through the Cursor SDK against the Ultra
allowance. They are not reachable through any HTTP API a Railway process could
call. Running the assistant inside the web service would mean paying Anthropic
or OpenAI list price for work the Ultra plan already covers.

So the work is split:

| Side | Runs | Holds | Decides |
|---|---|---|---|
| **CRM** (Railway) | routing, budget, tools, approvals, UI | database, Google creds, everything | which model runs, and whether a write happens |
| **Worker** (Karol's Mac) | the agent, via `@cursor/sdk` | one device token | nothing |

The worker claims a turn, runs the model, and posts back a reply plus any
writes it wants to make. It has no database credentials. A compromised worker
can waste tokens and lie in a chat bubble; it cannot touch the timesheet.

This also mirrors `punchlist_test_runs`: a queue table the Mac polls and claims,
with no server-side runner. Same shape, same reasons.

## Objects

| Table | Holds |
|---|---|
| `chat_threads` | A conversation. Titled from its first line. |
| `chat_messages` | What was said. `role` is user / assistant / tool / system. |
| `chat_turns` | One attempt at answering, **and** its billing record. |
| `chat_tool_calls` | What the assistant did or wants to do. |

`chat_turns` is the load-bearing one. It carries the routing decision (`jobType`,
`model`, `effort`, `pool`, `rung`), the queue state (`status`, `claimedBy`), and
the cost (`inputTokens` … `costCents`). Recording all three on one row is what
makes the ladder trace in the UI and the month's spend impossible to disagree —
they are the same rows read two ways.

**Escalation is rows, not a column.** Rung 0 runs and fails its detector; a
second turn lands with `escalatedFrom` pointing back and `rung` incremented.
Reading the chain is reading the ladder.

## Ladders

Defined in `lib/chat/models.ts`, guarded by `npm run check:chat`.

A ladder is only worth having when the cheap rung wins often enough to pay for
the retry. The break-even is `cost_cheap / cost_expensive` — the share of
attempts the cheap model must get right before "try cheap, escalate on failure"
beats going straight to the expensive one. `check:chat` computes it for every
adjacent pair and fails the build on a rung that loses money.

| Job | Ladder | Promoted by |
|---|---|---|
| `chat` | Composer 2.5 | — |
| `trivial_edit` | Composer 2.5 → Grok 4.6 High | lint, build |
| `content_edit` | Composer 2.5 → Grok 4.6 High | terminology and schema validators |
| `build_fix` | Composer 2.5 → Grok 4.6 High | compiler exit code |
| `code_tested` | Grok 4.6 Medium → XHigh → Fable 5.1 Max | test suite |
| `debug` | Grok 4.6 XHigh → Opus 5 Max | repro still fails |
| `review` | Grok 4.6 XHigh | — |
| `review_critical` | GPT-5.6 Sol Max | — |
| `security_review` | Opus 5 Max | — |
| `architecture` | Opus 5 Max | — |
| `writing` | Fable 5.1 High | — |
| `report` | Composer 2.5 → Grok 4.6 High | section schema |

**Ladders exist only where a machine can tell us the attempt failed, for free.**
A test suite, a compiler, a validator. Security review, architecture and brand
voice have no such detector — a missed finding produces no signal at all — so a
cheap first pass there proves nothing and those go straight to the tier that
should have run first.

Within a family, raise effort before changing family: a high-effort failure
usually means the approach was wrong, not that the model was small.

`code_tested` ends on a different family on purpose, and so does `debug`. Two
attempts from the same model tend to fail the same way.

### Turns that failed without a detector do not escalate

`POST /api/chat/turns/[id]` only queues the next rung when the failure carries a
`detector`. A dropped connection or a missing API key is not evidence the model
was too small, and promoting on it spends a frontier model to hit the same wall.

## Pools and the reserve

Ultra includes a large Cursor Models allowance (Composer, Grok) plus **$400** of
Other Models (Fable, Opus, Sol). Spillover runs one way: an exhausted Cursor
pool starts eating the same $400. So `cursor` is cheap and second in line, never
free.

`lib/chat/budget.ts` prices every turn from the registry and holds **$250 of the
$400 in reserve**. Past that line routine first-rung work is refused the Other
pool and falls back to Grok 4.6 XHigh; escalations may still spend it. Past 90%
nothing gets it. Left alone, ordinary work drifts onto premium models and the
escalations that actually need them arrive in week three to an empty allowance.

Two caveats, both deliberate:

- **The ledger is a floor, not a bill.** `agent.getUsage()` settles late and does
  not report subagent tokens, so we price our own turns from published rates and
  reconcile against the Cursor dashboard.
- **The period is the calendar month**, not Karol's billing day, which we do not
  know. Wrong by at most a few days of spend.

## Tools

`lib/chat/tools.ts`. Every tool is a thin wrapper over logic that already
exists and is already tested. The model picks the tool and the arguments; it
never writes SQL and cannot reach anything not on this list.

| Tool | Wraps | Writes |
|---|---|---|
| `search_work_history` | `ledgerEntries` (`lib/sheets.ts`) | no |
| `search_sessions` | `searchSessions` (`lib/leftoff-history.ts`) | no |
| `list_clients` | `clients` + `projects` | no |
| `log_time` | `logAgentTime` (`lib/punches.ts`) | **yes** |
| `create_task` | `resolveTaskTarget` + `insertTaskRow` | **yes** |
| `refresh_insights` | `refreshInsightsAction` | **yes** |

Reads run on the worker and come back as results. **Writes never run on the
worker.** They arrive as intentions, park at `pending`, render a preview card,
and are executed by the CRM under Karol's user only after he confirms.

The preview is built by the same tool that performs the write, from the same
arguments, so the card cannot describe one time entry and file another.

`chat_tool_calls.idempotencyKey` travels into the domain write — into
`logAgentTime`'s `clientRequestId`, into the task's `refId` — so confirming
twice, or a retry after a dropped connection, cannot double-apply.

### `log_time` invents a clock face

`logAgentTime` wants an interval; the chat only ever knows a day and a duration.
The window ends at 17:00 UTC on the day worked and runs backwards. The hours are
what bill — the times are decoration that keeps the punch row well-formed.

## Routes

All on device-token auth (`authenticateTimeRequest`), same as `/api/time/*`.

| Route | Who calls it |
|---|---|
| `POST /api/chat` | phone shortcut, script. Queues a turn, returns the routing decision. |
| `POST /api/chat/queue` | **worker.** Claims the oldest queued turn, returns thread + tools + model. |
| `POST /api/chat/turns/[id]` | **worker.** Posts the reply, or an error (with a `detector` to escalate). |
| `POST /api/chat/approvals/[id]` | confirm or reject a parked write. |

The browser does not use these — `lib/chat/actions.ts` holds server actions that
call the same functions in `lib/chat/turns.ts`, so a shortcut and the page
cannot drift apart.

Claiming is a compare-and-swap, not a held transaction: read the oldest queued
id, update `where id = ? and status = 'queued'`, and an empty result means
another worker won. The loser takes the next one.

## Running the worker

Issue a device token at **Settings → Devices**, then:

```sh
export CRM_URL=https://crm.tallkarol.com
export CRM_DEVICE_TOKEN=…
npm run chat:worker
```

| Variable | Purpose |
|---|---|
| `CRM_URL` | Defaults to `http://localhost:3001`. |
| `CRM_DEVICE_TOKEN` | Required. Settings → Devices. |
| `CURSOR_API_KEY` | Cursor SDK auth. |
| `CHAT_WORKER_NAME` | Shows in `chat_turns.claimedBy`. Defaults to `mac-<pid>`. |
| `CHAT_WORKER_REPO` | Repo the agent runs against, for jobs that touch code. |
| `CHAT_WORKER_IDLE_MS` | Poll interval when the queue is empty. Default 2500. |

Nothing about the worker is deployed. Railway runs the CRM; the queue simply
sits until a Mac is awake, which is also the honest failure mode — a turn
queued at 2am answers when Karol opens the laptop.

## What is not built yet

- **Streaming.** The page polls every three seconds while a turn is in flight.
  Adequate for work that takes tens of seconds; a stream can come later without
  changing the contract.
- **Agents as people.** One assistant today. `chat_messages.agent` already
  carries a speaker name so a roster and group threads do not need a migration.
- **Voice and attachments.** In the mockup, not in the build.
- **Repo work.** The worker can run code jobs, but the `code_tested` / `debug`
  ladders have no runner wiring the detector back yet — the escalation path
  exists and is tested, nothing calls it automatically.
